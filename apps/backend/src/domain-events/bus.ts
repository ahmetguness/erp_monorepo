import { logger } from '../lib/logger.js';
import type { DomainEvent } from './events.js';

export type DomainEventListener = (event: DomainEvent) => Promise<void> | void;

class InProcessDomainEventBus {
  private readonly listeners = new Set<DomainEventListener>();

  subscribe(listener: DomainEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async publish(event: DomainEvent): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener(event);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Bilinmeyen domain event listener hatası';
        logger.error(`[DomainEvent] ${event.name} listener hatası: ${message}`);
      }
    }
  }
}

export const domainEvents = new InProcessDomainEventBus();
