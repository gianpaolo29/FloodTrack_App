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

class SocketService {
  private socket: Socket | null = null;
  private joinedReports = new Set<string>();

  connect(token: string) {
    if (this.socket?.connected) return;

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    this.socket.on('connect', () => {
      console.log('[socket] connected', this.socket?.id);
      this.joinedReports.forEach(reportId => {
        this.socket?.emit('join-report', reportId);
      });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[socket] disconnected', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[socket] connection error:', err.message);
    });
  }

  disconnect() {
    this.joinedReports.clear();
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

  on<T>(event: string, cb: (data: T) => void) {
    this.socket?.on(event, cb as (...args: unknown[]) => void);
  }

  off<T>(event: string, cb: (data: T) => void) {
    this.socket?.off(event, cb as (...args: unknown[]) => void);
  }

  get isConnected() {
    return this.socket?.connected ?? false;
  }
}

export const socketService = new SocketService();
