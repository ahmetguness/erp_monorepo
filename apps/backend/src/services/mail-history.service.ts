import { MailDeliveryStatus, MailDirection, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { NormalizedMailAttachment } from '../utils/mail-attachments';

export interface CreateOutboundMailHistoryInput {
  tenantId: string;
  sentById?: string;
  from?: string;
  replyTo?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  attachments?: NormalizedMailAttachment[];
}

export interface CompleteMailHistoryInput {
  id: string;
  tenantId: string;
  success: boolean;
  providerId?: string;
  error?: string;
}

export interface MailHistoryFilters {
  tenantId: string;
  userId: string;
  direction?: MailDirection;
  status?: MailDeliveryStatus;
  search?: string;
  page: number;
  limit: number;
}

function htmlToPreview(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function toAttachmentJson(attachments: NormalizedMailAttachment[] | undefined): Prisma.InputJsonArray | undefined {
  if (!attachments || attachments.length === 0) return undefined;
  return attachments.map((attachment) => ({
    filename: attachment.filename,
    contentType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
  }));
}

async function getTenantUserEmail(tenantId: string, userId: string): Promise<string | null> {
  const tenantUser = await prisma.tenantUser.findFirst({
    where: {
      tenantId,
      userId,
      isActive: true,
      user: { isActive: true },
    },
    select: {
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  return tenantUser?.user.email ?? null;
}

function visibleToUserWhere(userId: string, email: string): Prisma.MailMessageWhereInput {
  return {
    OR: [
      { sentById: userId },
      { to: { has: email } },
      { cc: { has: email } },
      { bcc: { has: email } },
    ],
  };
}

function visibleBcc(bcc: string[], userId: string, userEmail: string, sentById?: string | null): string[] {
  if (sentById === userId) return bcc;
  return bcc.some((recipient) => recipient.toLowerCase() === userEmail.toLowerCase()) ? [userEmail] : [];
}

export class MailHistoryService {
  static async list(filters: MailHistoryFilters) {
    const userEmail = await getTenantUserEmail(filters.tenantId, filters.userId);
    if (!userEmail) {
      return {
        data: [],
        meta: { total: 0, page: filters.page, pageSize: filters.limit, totalPages: 0 },
      };
    }

    const where: Prisma.MailMessageWhereInput = {
      tenantId: filters.tenantId,
      AND: [
        visibleToUserWhere(filters.userId, userEmail),
        ...(filters.search
          ? [{
              OR: [
                { subject: { contains: filters.search, mode: 'insensitive' } },
                { from: { contains: filters.search, mode: 'insensitive' } },
                { to: { has: filters.search } },
              ],
            } satisfies Prisma.MailMessageWhereInput]
          : []),
      ],
      ...(filters.direction && { direction: filters.direction }),
      ...(filters.status && { status: filters.status }),
    };

    const [total, data] = await Promise.all([
      prisma.mailMessage.count({ where }),
      prisma.mailMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        select: {
          id: true,
          direction: true,
          status: true,
          providerId: true,
          from: true,
          replyTo: true,
          to: true,
          cc: true,
          bcc: true,
          subject: true,
          textPreview: true,
          attachmentCount: true,
          error: true,
          sentAt: true,
          createdAt: true,
          sentBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      data: data.map((mail) => ({
        ...mail,
        bcc: visibleBcc(mail.bcc, filters.userId, userEmail, mail.sentBy?.id),
      })),
      meta: {
        total,
        page: filters.page,
        pageSize: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }

  static async get(tenantId: string, userId: string, id: string) {
    const userEmail = await getTenantUserEmail(tenantId, userId);
    if (!userEmail) return null;

    const mail = await MailHistoryService.getRaw(tenantId, userId, userEmail, id);
    if (!mail) return null;

    return {
      ...mail,
      bcc: visibleBcc(mail.bcc, userId, userEmail, mail.sentBy?.id),
    };
  }

  private static async getRaw(tenantId: string, userId: string, userEmail: string, id: string) {
    return prisma.mailMessage.findFirst({
      where: {
        id,
        tenantId,
        ...visibleToUserWhere(userId, userEmail),
      },
      select: {
        id: true,
        direction: true,
        status: true,
        providerId: true,
        from: true,
        replyTo: true,
        to: true,
        cc: true,
        bcc: true,
        subject: true,
        html: true,
        textPreview: true,
        attachments: true,
        attachmentCount: true,
        error: true,
        sentAt: true,
        createdAt: true,
        sentBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  static async createOutbound(input: CreateOutboundMailHistoryInput) {
    const attachments = input.attachments ?? [];

    return prisma.mailMessage.create({
      data: {
        tenantId: input.tenantId,
        sentById: input.sentById,
        direction: MailDirection.OUTBOUND,
        status: MailDeliveryStatus.PENDING,
        from: input.from,
        replyTo: input.replyTo,
        to: input.to,
        cc: input.cc ?? [],
        bcc: input.bcc ?? [],
        subject: input.subject,
        html: input.html,
        textPreview: htmlToPreview(input.html),
        attachments: toAttachmentJson(attachments),
        attachmentCount: attachments.length,
      },
      select: { id: true },
    });
  }

  static async complete(input: CompleteMailHistoryInput) {
    return prisma.mailMessage.updateMany({
      where: { id: input.id, tenantId: input.tenantId },
      data: {
        status: input.success ? MailDeliveryStatus.SENT : MailDeliveryStatus.FAILED,
        providerId: input.providerId,
        error: input.error,
        sentAt: input.success ? new Date() : undefined,
      },
    });
  }
}
