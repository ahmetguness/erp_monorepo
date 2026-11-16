import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { enqueueDomainEvent, toDomainEventJson } from '../../domain-events/outbox.js';
import { createEventContext, type DomainEventPayloads } from '../../domain-events/events.js';
import type { OutboxLease } from '../../domain-events/delivery/repository.js';
import { PermanentDeliveryError, LostOutboxLeaseError, MAX_OUTBOX_ATTEMPTS } from '../../domain-events/delivery/retry-policy.js';
import { ProviderHttpError } from '../../infrastructure/providers/retry-policy.js';
import { MailHistoryService, type CreateOutboundMailHistoryInput } from '../mail-history.service.js';
import { mailDeliveryPayload, mailDeliveryPayloadSchema, deliverMail } from './mail-delivery.provider.js';
import { completeProvisioningMail, type ProvisioningMailCompletion } from './provisioning-completion.js';

export interface QueueOutboundMailInput extends CreateOutboundMailHistoryInput {
  provisioning?: ProvisioningMailCompletion;
  expiresAt?: Date;
}

export async function queueOutboundMail(tx: Prisma.TransactionClient, input: QueueOutboundMailInput): Promise<{ id: string; }> {
  const record = await MailHistoryService.createOutbound(input, tx);
  const payload = mailDeliveryPayload(input);
  await tx.mailMessage.updateMany({ where: { id: record.id, tenantId: input.tenantId }, data: { deliveryPayload: toDomainEventJson(payload) ?? Prisma.JsonNull } });
  await enqueueDomainEvent(tx, {
    name: 'mail.delivery.requested', context: createEventContext({ tenantId: input.tenantId, userId: input.sentById }),
    payload: { mailId: record.id, ...(input.provisioning ? { provisioning: input.provisioning } : {}), ...(input.expiresAt ? { expiresAt: input.expiresAt.toISOString() } : {}) }
  });
  return record;
}

export function queueMail(input: QueueOutboundMailInput): Promise<{ id: string; success: true; queued: true; }> {
  return prisma.$transaction(async (tx) => ({ ...await queueOutboundMail(tx, input), success: true, queued: true }));
}

export async function deliverQueuedMail(lease: OutboxLease, request: DomainEventPayloads['mail.delivery.requested']): Promise<void> {
  const { mailId } = request;
  const mail = await prisma.$transaction(async (tx) => {
    const owned = await tx.domainEventOutbox.count({ where: { id: lease.id, tenantId: lease.tenantId, status: 'PROCESSING', leaseOwner: lease.leaseOwner, leaseExpiresAt: { gt: new Date() } } });
    if (!owned) throw new LostOutboxLeaseError('Mail delivery lease expired.');
    const current = await tx.mailMessage.findFirstOrThrow({ where: { id: mailId, tenantId: lease.tenantId } });
    if (!current.deliveryStartedAt) {
      return tx.mailMessage.update({ where: { id: current.id, tenantId: lease.tenantId }, data: { deliveryStartedAt: new Date() } });
    }
    return current;
  });
  if (mail.status === 'SENT') {
    await prisma.$transaction((tx) => completeProvisioningMail(tx, lease.tenantId, request.provisioning, true));
    return;
  }
  try {
    if (request.expiresAt && Date.parse(request.expiresAt) <= Date.now()) throw new PermanentDeliveryError('Mail action link has expired; generate a new request.');
    // Resend retains keys for 24 hours. Never retry an ambiguous old delivery beyond that window.
    if (mail.deliveryStartedAt && Date.now() - mail.deliveryStartedAt.getTime() >= 23 * 60 * 60_000) {
      throw new PermanentDeliveryError('Mail delivery requires provider reconciliation: idempotency window expired.');
    }
    const decoded = mailDeliveryPayloadSchema.safeParse(mail.deliveryPayload);
    if (!decoded.success) throw new PermanentDeliveryError('Mail delivery snapshot is invalid.');
    const providerId = await deliverMail(decoded.data, `axon/mail/${mail.id}`);
    await prisma.$transaction(async (tx) => {
      await tx.mailMessage.updateMany({
        where: { id: mail.id, tenantId: lease.tenantId, status: { not: 'SENT' } },
        data: { status: 'SENT', providerId, sentAt: new Date(), error: null, deliveryPayload: Prisma.JsonNull }
      });
      await completeProvisioningMail(tx, lease.tenantId, request.provisioning, true);
    });
  } catch (error) {
    if (error instanceof PermanentDeliveryError || (error instanceof ProviderHttpError && (!error.retryable || lease.attempts >= MAX_OUTBOX_ATTEMPTS))) {
      await prisma.$transaction(async (tx) => {
        await tx.mailMessage.updateMany({ where: { id: mail.id, tenantId: lease.tenantId, status: { not: 'SENT' } }, data: { status: 'FAILED', error: error.message } });
        await completeProvisioningMail(tx, lease.tenantId, request.provisioning, false, error.message);
        await enqueueDomainEvent(tx, {
          name: 'mail.failed', context: createEventContext({ tenantId: lease.tenantId, userId: mail.sentById }),
          payload: { mailId: mail.id, subject: mail.subject, sentById: mail.sentById, recipients: [...mail.to, ...mail.cc], error: error.message }
        });
      });
    }
    throw error;
  }
}
