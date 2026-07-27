import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { submitMemberStatus } from '@/services/api';
import {
  getPendingUpdates,
  getPendingCount,
  removePendingUpdate,
} from '@/services/offline';

const PING_INTERVAL = 15_000;
const PING_URL = 'https://clients3.google.com/generate_204';

export function useNetwork(token: string | null) {
  const [isOnline, setIsOnline]         = useState(true);
  const [syncing, setSyncing]           = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const wasOffline = useRef(false);

  // Refresh pending count whenever syncing state changes
  useEffect(() => {
    getPendingCount().then(setPendingCount);
  }, [syncing]);

  useEffect(() => {
    async function check() {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        await fetch(PING_URL, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeout);
        setIsOnline(true);

        if (wasOffline.current && token) {
          wasOffline.current = false;
          await syncQueue(token);
        }
      } catch {
        setIsOnline(false);
        wasOffline.current = true;
        // Update pending count while offline so banner shows correct number
        getPendingCount().then(setPendingCount);
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
        await submitMemberStatus(item.payload, authToken);
        await removePendingUpdate(item.id);
        successCount++;
      } catch {
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

  return { isOnline, syncing, pendingCount };
}
