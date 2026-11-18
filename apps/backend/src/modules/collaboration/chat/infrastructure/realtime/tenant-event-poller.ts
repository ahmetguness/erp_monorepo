export interface RealtimeAudience {
  connectionId: number;
  userId: string;
  sessionId?: string;
  expiresAt?: number;
  clientIp: string;
}
export interface RealtimeCursor {
  createdAt: Date;
  id: string;
}
export interface RealtimeEvent extends RealtimeCursor {
  tenantId: string;
  conversationId: string;
  type: string;
  payload: unknown;
  recipientIds: string[];
}
export interface RealtimeBatch {
  authorizedIds: number[];
  events: RealtimeEvent[];
}
export type RealtimeReader = (
  tenantId: string,
  audience: readonly RealtimeAudience[],
  since: Date,
  after: RealtimeCursor | undefined,
  limit: number,
) => Promise<RealtimeBatch>;
interface Listener extends RealtimeAudience {
  connectedAt: number;
  send(message: string): boolean;
  close(code: number, reason: string): void;
}
interface Channel {
  tenantId: string;
  listeners: Map<number, Listener>;
  seen: Map<
    string,
    { expiresAt: number; createdAt: number; audienceThrough: number }
  >;
  since: Date;
  scanStartedAt?: number;
  after?: RealtimeCursor;
  nextPoll: number;
  polling: boolean;
  closed: boolean;
}

/** Share IO and serialization, never authorization: each batch returns a fresh audience. */
export class TenantEventPoller {
  private readonly channels = new Map<string, Channel>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private nextId = 0;
  private connections = 0;
  private inFlight = 0;
  private remembered = 0;
  private stopped = false;
  private readonly batchSize = 500;

  constructor(
    private readonly read: RealtimeReader,
    private readonly onError?: (error: unknown, tenantId: string) => void,
  ) {}
  get stats() {
    return {
      tenants: this.channels.size,
      connections: this.connections,
      inFlight: this.inFlight,
      rememberedEvents: this.remembered,
    };
  }

  subscribe(
    tenantId: string,
    input: Omit<Listener, "connectionId" | "connectedAt">,
  ): () => void {
    if (
      this.stopped ||
      this.connections >= 10_000 ||
      (!this.channels.has(tenantId) && this.channels.size >= 1000)
    ) {
      input.close(1013, "Realtime capacity exceeded");
      return () => {};
    }
    let channel = this.channels.get(tenantId);
    if (!channel) {
      channel = {
        tenantId,
        listeners: new Map(),
        seen: new Map(),
        since: new Date(Date.now() - 10_000),
        nextPoll: Date.now() + 1000,
        polling: false,
        closed: false,
      };
      this.channels.set(tenantId, channel);
    }
    const id = ++this.nextId;
    channel.listeners.set(id, {
      ...input,
      connectionId: id,
      connectedAt: Date.now(),
    });
    this.connections++;
    if (!this.timer) {
      this.timer = setInterval(() => this.dispatch(), 100);
      this.timer.unref();
    }
    const selected = channel;
    return () => this.remove(selected, id);
  }

  stop(): void {
    this.stopped = true;
    for (const channel of [...this.channels.values()])
      this.closeChannel(channel, 1012, "Service restart");
  }

  private remove(channel: Channel, id: number): void {
    if (channel.listeners.delete(id)) this.connections--;
    if (!channel.listeners.size && !channel.closed) {
      channel.closed = true;
      this.channels.delete(channel.tenantId);
      this.remembered -= channel.seen.size;
      channel.seen.clear();
    }
    if (!this.channels.size && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private closeChannel(channel: Channel, code: number, reason: string): void {
    for (const [id, listener] of [...channel.listeners]) {
      this.remove(channel, id);
      listener.close(code, reason);
    }
  }

  private dispatch(): void {
    if (this.stopped || this.inFlight >= 2) return;
    const due = [...this.channels.values()]
      .filter((channel) => !channel.polling && channel.nextPoll <= Date.now())
      .sort((a, b) => a.nextPoll - b.nextPoll);
    for (const channel of due.slice(0, 2 - this.inFlight)) {
      channel.polling = true;
      this.inFlight++;
      void this.poll(channel)
        .catch((error: unknown) => {
          this.closeChannel(channel, 1011, "Realtime polling failed");
          this.onError?.(error, channel.tenantId);
        })
        .finally(() => {
          channel.polling = false;
          channel.nextPoll = Date.now() + 1000;
          this.inFlight--;
          this.dispatch();
        });
    }
  }

  private async poll(channel: Channel): Promise<void> {
    const now = Date.now();
    for (const [id, value] of channel.seen)
      if (value.expiresAt <= now && value.createdAt < channel.since.getTime()) {
        channel.seen.delete(id);
        this.remembered--;
      }
    const audience = [...channel.listeners.values()];
    const checkedThrough = audience.at(-1)?.connectionId ?? 0;
    channel.scanStartedAt ??= now;
    const batch = await this.read(
      channel.tenantId,
      audience,
      channel.since,
      channel.after,
      this.batchSize,
    );
    if (channel.closed) return;
    const authorized = new Set(batch.authorizedIds);
    const checked = new Set(audience.map((member) => member.connectionId));
    for (const [id, listener] of [...channel.listeners])
      if (checked.has(id) && !authorized.has(id)) {
        this.remove(channel, id);
        listener.close(1008, "Realtime authorization expired");
      }
    if (channel.closed) return;
    const last = batch.events.at(-1);
    channel.after =
      batch.events.length === this.batchSize && last
        ? { createdAt: last.createdAt, id: last.id }
        : undefined;
    if (!channel.after) {
      // Advance from the completed scan, so scheduler/DB stalls cannot skip an interval.
      channel.since = new Date(channel.scanStartedAt - 10_000);
      channel.scanStartedAt = undefined;
    }
    for (const event of batch.events) {
      if (event.tenantId !== channel.tenantId)
        throw new Error("Realtime tenant boundary violation.");
      let remembered = channel.seen.get(event.id);
      if (remembered && remembered.audienceThrough >= checkedThrough) continue;
      if (!remembered) {
        if (channel.seen.size >= 4096 || this.remembered >= 65_536) {
          this.closeChannel(channel, 1013, "Realtime event capacity exceeded");
          return;
        }
        remembered = {
          expiresAt: now + 20_000,
          createdAt: event.createdAt.getTime(),
          audienceThrough: 0,
        };
        channel.seen.set(event.id, remembered);
        this.remembered++;
      }
      const previouslyChecked = remembered.audienceThrough;
      remembered.audienceThrough = checkedThrough;
      const recipients = new Set(event.recipientIds);
      const message = JSON.stringify({
        id: event.id,
        type: event.type,
        tenantId: event.tenantId,
        conversationId: event.conversationId,
        occurredAt: event.createdAt.toISOString(),
        version: 1,
        payload: event.payload,
      });
      for (const [id, listener] of [...channel.listeners])
        if (
          id > previouslyChecked &&
          authorized.has(id) &&
          recipients.has(listener.userId) &&
          event.createdAt.getTime() >= listener.connectedAt &&
          !listener.send(message)
        ) {
          this.remove(channel, id);
          listener.close(1013, "Realtime consumer backpressure");
        }
    }
  }
}
