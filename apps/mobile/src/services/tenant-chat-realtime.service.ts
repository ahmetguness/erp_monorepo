import { Platform } from 'react-native';
import { API_URL } from '../lib/api-client';
import { getAuthToken } from '../lib/token-storage';
import { ChatRealtimeEvent, ChatRealtimeEventSchema } from '@repo/types/chat';

export type RealtimeEventHandler = (event: ChatRealtimeEvent) => void;

class TenantChatRealtimeService {
  private socket: WebSocket | null = null;
  private listeners: Set<RealtimeEventHandler> = new Set();
  private isConnected = false;
  private shouldReconnect = true;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  public subscribe(handler: RealtimeEventHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  public async connect(): Promise<void> {
    this.shouldReconnect = true;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const token = await getAuthToken();
      if (!token) return;

      const wsBase = API_URL.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
      const wsUrl = `${wsBase}/api/chat/ws?token=${encodeURIComponent(token)}`;

      // In React Native / mobile environment:
      const headers: Record<string, string> = {
        'X-Client-Platform': 'mobile',
        Authorization: `Bearer ${token}`,
      };

      // Create WebSocket instance
      if (Platform.OS === 'web') {
        this.socket = new WebSocket(wsUrl);
      } else {
        try {
          this.socket = new (WebSocket as any)(wsUrl, null, { headers });
        } catch {
          this.socket = new WebSocket(wsUrl);
        }
      }

      if (!this.socket) return;

      this.socket.onopen = () => {
        this.isConnected = true;
        this.startHeartbeat();
      };

      this.socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const raw = JSON.parse(event.data);
          if (raw.type === 'pong' || raw.type === 'connection.ready') {
            return;
          }
          const parsed = ChatRealtimeEventSchema.safeParse(raw);
          if (parsed.success) {
            this.notifyListeners(parsed.data);
          } else if (raw.type && raw.conversationId) {
            // Flexible fallback if event shape has minor drift
            this.notifyListeners(raw as ChatRealtimeEvent);
          }
        } catch {
          // Ignore non-json frames
        }
      };

      this.socket.onerror = () => {
        this.isConnected = false;
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.stopHeartbeat();
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      this.isConnected = false;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Safe close
      }
      this.socket = null;
    }
    this.isConnected = false;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  private notifyListeners(event: ChatRealtimeEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.warn('[TenantChatRealtime] Error in event listener:', err);
      }
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.socket.send('ping');
        } catch {
          // Socket might have closed
        }
      }
    }, 25_000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.shouldReconnect) {
        this.connect();
      }
    }, 4_000);
  }
}

export const tenantChatRealtime = new TenantChatRealtimeService();
