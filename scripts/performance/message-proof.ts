interface PendingMessage { expected: Set<number>; received: Set<number>; accepted: boolean }

/** Bounded correlation of accepted messages and the fixture's connected room audience. */
export class MessageProof {
  private readonly connections = new Map<number, { tenantId: string; conversationId: string }>();
  private readonly pending = new Map<string, PendingMessage>();
  private recipients = 0;
  private accepted = 0;
  private expected = 0;
  private confirmed = 0;
  private overflows = 0;

  connect(vu: number, tenantId: string, conversationId: string): void { this.connections.set(vu, { tenantId, conversationId }); }
  disconnect(vu: number): void { this.connections.delete(vu); }
  begin(id: string, tenantId: string, conversationId: string): void {
    const expected = new Set([...this.connections].filter(([, room]) => room.tenantId === tenantId && room.conversationId === conversationId).map(([vu]) => vu));
    if (!expected.size) return;
    if (this.pending.size >= 10_000 || this.recipients + expected.size > 100_000) { this.overflows++; return; }
    this.pending.set(id, { expected, received: new Set(), accepted: false }); this.recipients += expected.size;
  }
  accept(id: string): void {
    const message = this.pending.get(id); if (!message || message.accepted) return;
    message.accepted = true; this.accepted++; this.expected += message.expected.size; this.confirmed += message.received.size;
    if (message.received.size === message.expected.size) this.remove(id, message);
  }
  cancel(id: string): void { const message = this.pending.get(id); if (message) this.remove(id, message); }
  observe(vu: number, id: string): boolean {
    const message = this.pending.get(id);
    if (!message || !message.expected.has(vu) || message.received.has(vu)) return false;
    message.received.add(vu);
    if (message.accepted) { this.confirmed++; if (message.received.size === message.expected.size) this.remove(id, message); }
    return true;
  }
  snapshot() { return { acceptedMessages: this.accepted, expectedReceipts: this.expected, confirmedReceipts: this.confirmed, unconfirmedReceipts: this.expected - this.confirmed, trackingOverflows: this.overflows }; }
  private remove(id: string, message: PendingMessage): void { this.pending.delete(id); this.recipients -= message.expected.size; }
}
