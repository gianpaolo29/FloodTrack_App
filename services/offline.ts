/**
 * Offline cache & sync service — FloodTrack
 *
 * Caches assigned incidents locally for offline access.
 * Queues status updates when offline, syncs when back online.
 */
import * as Storage from '@/utils/storage';
import type { Incident, StatusUpdatePayload } from '@/types';

const CACHE_KEY = 'floodtrack_offline_incidents';
const QUEUE_KEY = 'floodtrack_offline_queue';

// ─── Incident cache ─────────────────────────────────────────────────────────

export async function cacheIncidents(incidents: Incident[]): Promise<void> {
  await Storage.setItem(CACHE_KEY, JSON.stringify(incidents));
}

export async function getCachedIncidents(): Promise<Incident[]> {
  const raw = await Storage.getItem(CACHE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Incident[];
  } catch {
    return [];
  }
}

export async function clearCache(): Promise<void> {
  await Storage.deleteItem(CACHE_KEY);
  await Storage.deleteItem(QUEUE_KEY);
}

// ─── Offline update queue ───────────────────────────────────────────────────

export interface QueuedUpdate {
  id: string;
  payload: StatusUpdatePayload;
  queuedAt: string;
}

export async function queueStatusUpdate(payload: StatusUpdatePayload): Promise<void> {
  const queue = await getPendingUpdates();
  queue.push({
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    payload,
    queuedAt: new Date().toISOString(),
  });
  await Storage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getPendingUpdates(): Promise<QueuedUpdate[]> {
  const raw = await Storage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedUpdate[];
  } catch {
    return [];
  }
}

export async function clearPendingUpdates(): Promise<void> {
  await Storage.deleteItem(QUEUE_KEY);
}

export async function removePendingUpdate(id: string): Promise<void> {
  const queue = await getPendingUpdates();
  const filtered = queue.filter(u => u.id !== id);
  await Storage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}
