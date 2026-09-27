/**
 * Broadcasts the responder's location via socket every INTERVAL_MS when on duty.
 * Foreground only — uses expo-location polling.
 */

import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { socketService } from '@/services/socket';

const INTERVAL_MS = 15_000; // 15 seconds

export function useLocationBroadcast(enabled: boolean) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function start() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;

      // Send immediately once
      try {
        const loc = await Location.getLastKnownPositionAsync();
        if (loc && !cancelled) {
          socketService.emitLocation(loc.coords.latitude, loc.coords.longitude);
        }
      } catch {}

      // Then poll
      intervalRef.current = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          socketService.emitLocation(loc.coords.latitude, loc.coords.longitude);
        } catch {}
      }, INTERVAL_MS);
    }

    start();

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled]);
}
