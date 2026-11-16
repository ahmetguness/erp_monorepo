import type { Prisma } from '@prisma/client';
import type { DomainEvent } from './events.js';

export type DomainEventListener = (event: DomainEvent, tx: Prisma.TransactionClient) => Promise<void>;

class DomainEventBus {
  private readonly listeners = new Map<string, DomainEventListener>();

  subscribe(name: string, listener: DomainEventListener): () => void {
    if (this.listeners.has(name)) throw new Error(`Duplicate domain event consumer: ${name}`);
    this.listeners.set(name, listener);
    return () => this.listeners.delete(name);
  }

  consumers(): ReadonlyMap<string, DomainEventListener> { return new Map(this.listeners); }
}

export const domainEvents = new DomainEventBus();
