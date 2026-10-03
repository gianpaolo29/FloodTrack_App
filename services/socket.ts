/**
 * FloodTrack Socket.IO client service (singleton)
 */

import { io, type Socket } from 'socket.io-client';
import type { IncidentMessage } from '@/types';

const SOCKET_URL = (process.env.EXPO_PUBLIC_SOCKET_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export interface RawSocketMessage {
  id: number;
  report_id: number;
  user_id: number;
  body: string;
  is_quick_reply: boolean;
  read_at: string | null;
  created_at: string;
  user: { id: number; name: string; role: string };
}

export interface TypingUser {
  id: number;
  name: string;
  role: string;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 0) return `Today, ${time}`;
  if (diffDays === 1) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

export function adaptSocketMessage(raw: RawSocketMessage, reportId: string): IncidentMessage {
  return {
    id: String(raw.id),
    reportId,
    userId: String(raw.user.id),
    userName: raw.user.name,
    userRole: raw.user.role,
    body: raw.body,
    isQuickReply: raw.is_quick_reply,
    readAt: raw.read_at,
    createdAt: formatRelativeTime(raw.created_at),
  };
}

type Listener = (...args: unknown[]) => void;

let listenerIdCounter = 0;

class SocketService {
  private socket: Socket | null = null;
  private joinedReports = new Set<string>();
  /**
   * Tracked listeners keyed by unique ID so they can be reliably
   * removed even when the callback reference changes (React re-renders).
   */
  private listeners = new Map<number, { event: string; cb: Listener }>();

  private token: string | null = null;
  private connectionAttempts = 0;

  connect(token: string) {
    this.token = token;

    // If socket exists and is connected or connecting, don't create another
    if (this.socket) return;

    this.connectionAttempts = 0;

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      console.log('[socket] connected', this.socket?.id);
      this.connectionAttempts = 0;
      // Re-join report rooms after reconnect
      this.joinedReports.forEach(reportId => {
        this.socket?.emit('join-report', reportId);
      });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[socket] disconnected', reason);
      // If server disconnected us, force reconnect with fresh socket
      if (reason === 'io server disconnect' && this.token) {
        this.socket = null;
        this.connect(this.token);
      }
    });

    this.socket.on('connect_error', (err) => {
      this.connectionAttempts++;
      console.warn(`[socket] connection error (attempt ${this.connectionAttempts}):`, err.message);
      // After 5 failed attempts, destroy and recreate socket
      if (this.connectionAttempts >= 5 && this.token) {
        console.log('[socket] too many failures, recreating socket...');
        this.socket?.disconnect();
        this.socket = null;
        setTimeout(() => {
          if (this.token) this.connect(this.token);
        }, 5000);
      }
    });

    // Register all tracked listeners on this new socket
    for (const [, { event, cb }] of this.listeners) {
      this.socket.on(event, cb);
    }
  }

  /** Force reconnect — useful when app returns to foreground */
  reconnect() {
    if (!this.token) return;
    if (this.socket?.connected) return;
    this.socket?.disconnect();
    this.socket = null;
    this.connect(this.token);
  }

  disconnect() {
    this.joinedReports.clear();
    this.listeners.clear();
    this.socket?.disconnect();
    this.socket = null;
  }

  joinReport(reportId: string) {
    this.joinedReports.add(reportId);
    this.socket?.emit('join-report', reportId);
  }

  leaveReport(reportId: string) {
    this.joinedReports.delete(reportId);
    this.socket?.emit('leave-report', reportId);
  }

  emitTyping(reportId: string) {
    this.socket?.emit('typing', reportId);
  }

  emitLocation(latitude: number, longitude: number) {
    this.socket?.emit('location-update', { latitude, longitude });
  }

  /**
   * Register a listener. Returns a unique ID that MUST be used with `off()`
   * to ensure reliable cleanup regardless of callback reference changes.
   */
  on<T>(event: string, cb: (data: T) => void): number {
    const id = ++listenerIdCounter;
    const wrapped = cb as Listener;
    this.listeners.set(id, { event, cb: wrapped });
    this.socket?.on(event, wrapped);
    return id;
  }

  /**
   * Remove a listener by the ID returned from `on()`.
   */
  off(listenerId: number) {
    const entry = this.listeners.get(listenerId);
    if (!entry) return;
    this.socket?.off(entry.event, entry.cb);
    this.listeners.delete(listenerId);
  }

  get isConnected() {
    return this.socket?.connected ?? false;
  }
}

export const socketService = new SocketService();
