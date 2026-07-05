import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

const AVG_SPEED_KMH = 30;

function getDistanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useETA(destLat: number, destLng: number, active: boolean) {
  const [eta, setEta] = useState<string | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      setEta(null);
      setDistanceKm(null);
      return;
    }

    let mounted = true;

    async function calculate() {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const dist = getDistanceKm(
          loc.coords.latitude, loc.coords.longitude,
          destLat, destLng,
        );

        if (!mounted) return;
        setDistanceKm(Math.round(dist * 10) / 10);

        const roadDist = dist * 1.3;
        const minutes = Math.round((roadDist / AVG_SPEED_KMH) * 60);

        if (minutes < 1) {
          setEta('< 1 min');
        } else if (minutes < 60) {
          setEta(`~${minutes} min`);
        } else {
          const hrs = Math.floor(minutes / 60);
          const mins = minutes % 60;
          setEta(`~${hrs}h ${mins}m`);
        }
      } catch {
        if (mounted) setEta(null);
      }
    }

    calculate();
    const interval = setInterval(calculate, 30_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [destLat, destLng, active]);

  return { eta, distanceKm };
}
