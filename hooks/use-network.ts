/**
 * Network connectivity hook
 * Provides online/offline state and a sync trigger for queued updates.
 */
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { updateIncidentStatus } from '@/services/api';
import {
  getPendingUpdates,
  removePendingUpdate,
} from '@/services/offline';

const PING_INTERVAL = 15_000; // 15 seconds
const PING_URL = 'https://clients3.google.com/generate_204';

export function useNetwork(token: string | null) {
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const wasOffline = useRef(false);

  // Periodically check connectivity
  useEffect(() => {
    async function check() {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        await fetch(PING_URL, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeout);
        setIsOnline(true);

        // If we were offline and now online, sync queued updates
        if (wasOffline.current && token) {
          wasOffline.current = false;
          syncQueue(token);
        }
      } catch {
        setIsOnline(false);
        wasOffline.current = true;
      }
    }

    check();
    const interval = setInterval(check, PING_INTERVAL);
    return () => clearInterval(interval);
  }, [token]);

  async function syncQueue(authToken: string) {
    const queue = await getPendingUpdates();
    if (queue.length === 0) return;

    setSyncing(true);
    let successCount = 0;

    for (const item of queue) {
      try {
        await updateIncidentStatus(item.payload, authToken);
        await removePendingUpdate(item.id);
        successCount++;
      } catch {
        // Stop on first failure — remaining items stay queued
        break;
      }
    }

    setSyncing(false);

    if (successCount > 0) {
      Alert.alert(
        'Synced',
        `${successCount} queued update${successCount !== 1 ? 's' : ''} synced successfully.`,
      );
    }
  }

  return { isOnline, syncing };
}
