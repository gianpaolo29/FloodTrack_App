import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useAuth } from '@/context/AuthContext';
import { socketService } from '@/services/socket';
import { getNotificationPrefs } from '@/services/notifications';

interface EmergencyAlert {
  id: number;
  title: string;
  body: string;
  type: 'advisory' | 'update' | 'critical';
}

interface EmergencyAlertContextValue {
  isShowing: boolean;
}

const EmergencyAlertContext = createContext<EmergencyAlertContextValue>({ isShowing: false });

const ALERT_META: Record<string, {
  label: string;
  channelId: string;
  vibration: number[];
}> = {
  critical: {
    label:     'Emergency Alert',
    channelId: 'floodtrack-critical',
    vibration: [0, 500, 200, 500, 200, 500],
  },
  advisory: {
    label:     'Advisory',
    channelId: 'floodtrack-advisory',
    vibration: [0, 300, 150, 300],
  },
  update: {
    label:     'Update',
    channelId: 'floodtrack-updates',
    vibration: [0, 200, 100, 200],
  },
};

export function EmergencyAlertProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const lastAlertId = useRef<number | null>(null);

  const alertFeedback = useCallback((alert: EmergencyAlert) => {
    const meta = ALERT_META[alert.type];
    if (!meta) return;

    // Vibration + haptic only (push notification comes from backend)
    Vibration.vibrate(meta.vibration);
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(
        alert.type === 'critical'
          ? Haptics.NotificationFeedbackType.Error
          : Haptics.NotificationFeedbackType.Warning
      );
    }
  }, []);

  // Socket listener
  useEffect(() => {
    if (!token) return;

    const handleNewAlert = async (raw: any) => {
      const type = raw?.type as string;
      if (!ALERT_META[type]) return;

      // Deduplicate
      if (raw.id === lastAlertId.current) return;
      lastAlertId.current = raw.id;

      // Check notification preferences
      const prefs = await getNotificationPrefs();
      if (type === 'critical' && !prefs.critical) return;
      if (type === 'advisory' && !prefs.advisory) return;

      // Filter by target barangays
      const targets: string[] | null = raw?.target_barangays ?? null;
      if (targets && targets.length > 0) {
        const addr = user?.homeAddress?.toLowerCase() ?? '';
        const matches = targets.some((b: string) => addr.includes(b.toLowerCase()));
        if (!matches) return;
      }

      alertFeedback({
        id:    raw.id,
        title: raw.title,
        body:  raw.body,
        type:  type as EmergencyAlert['type'],
      });
    };

    const lid = socketService.on('new-alert', handleNewAlert);
    return () => {
      socketService.off(lid);
    };
  }, [token, user?.homeAddress, alertFeedback]);

  return (
    <EmergencyAlertContext.Provider value={{ isShowing: false }}>
      {children}
    </EmergencyAlertContext.Provider>
  );
}

export function useEmergencyAlert() {
  return useContext(EmergencyAlertContext);
}
