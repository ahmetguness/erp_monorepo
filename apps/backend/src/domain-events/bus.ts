import { logger } from '../lib/logger.js';
import type { DomainEvent } from './events.js';
import {
  markDomainEventFailed,
  markDomainEventProcessed,
  safeClaimDomainEvent,
  type DomainEventListenerFailure,
} from './outbox.js';

export type DomainEventListener = (event: DomainEvent) => Promise<void> | void;

class InProcessDomainEventBus {
  private readonly listeners = new Set<DomainEventListener>();

  subscribe(listener: DomainEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async publish(event: DomainEvent): Promise<void> {
    const claim = await safeClaimDomainEvent(event);
    if (!claim.shouldDispatch) return;
    await this.dispatch(event, claim.outboxId);
  }

  async publishClaimed(event: DomainEvent, outboxId: string): Promise<void> {
    await this.dispatch(event, outboxId);
  }

  private async dispatch(event: DomainEvent, outboxId: string | null): Promise<void> {
    const failures: DomainEventListenerFailure[] = [];
    for (const listener of this.listeners) {
      try {
        await listener(event);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Bilinmeyen domain event listener hatasi';
        const listenerName = listener.name || 'anonymousListener';
        failures.push({ listener: listenerName, message });
        logger.error(`[DomainEvent] ${event.name} ${listenerName} listener hatasi: ${message}`);
      }
    }

    if (failures.length > 0) {
      await markDomainEventFailed(outboxId, event.context.tenantId, failures);
      return;
    }

    await markDomainEventProcessed(outboxId, event.context.tenantId);
  }
}

export const domainEvents = new InProcessDomainEventBus();
