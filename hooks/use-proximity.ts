import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import type { Incident, ResponderStatus } from '@/types';

const PROXIMITY_RADIUS_METERS = 200;
const CHECK_INTERVAL = 10_000;

function getDistanceMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useProximityAlert(
  incidents: Incident[],
  onArrived: (incident: Incident) => void,
) {
  const alertedIds = useRef(new Set<string>());

  useEffect(() => {
    const enRouteIncidents = incidents.filter(
      i => i.responderStatus === 'en_route' && !alertedIds.current.has(i.id),
    );

    if (enRouteIncidents.length === 0) return;

    let active = true;

    async function checkProximity() {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        for (const incident of enRouteIncidents) {
          if (!active || alertedIds.current.has(incident.id)) continue;

          const distance = getDistanceMeters(
            loc.coords.latitude, loc.coords.longitude,
            incident.latitude, incident.longitude,
          );

          if (distance <= PROXIMITY_RADIUS_METERS) {
            alertedIds.current.add(incident.id);

            Alert.alert(
              'You\'ve arrived',
              `You are within ${Math.round(distance)}m of "${incident.title}". Update status to On Scene?`,
              [
                { text: 'Not yet', style: 'cancel' },
                { text: 'On Scene', onPress: () => onArrived(incident) },
              ],
            );
          }
        }
      } catch {
      }
    }

    checkProximity();
    const interval = setInterval(checkProximity, CHECK_INTERVAL);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [incidents, onArrived]);
}
