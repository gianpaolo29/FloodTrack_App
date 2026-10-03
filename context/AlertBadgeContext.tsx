import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { getAlertsWithReadState } from '@/services/api';
import { socketService } from '@/services/socket';
import { getNotificationPrefs, onNotificationReceived } from '@/services/notifications';

interface AlertBadgeContextValue {
  unreadCount: number;
  setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
  refetch: () => void;
}

const AlertBadgeContext = createContext<AlertBadgeContextValue>({
  unreadCount: 0,
  setUnreadCount: () => {},
  refetch: () => {},
});

export function AlertBadgeProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const { token } = useAuth();

  const fetchCount = async () => {
    if (!token) return;
    try {
      const data = await getAlertsWithReadState(token);
      setUnreadCount(data.filter(a => !a.read && a.kind !== 'new_message').length);
    } catch {}
  };

  useEffect(() => {
    if (!token) return;

    // Initial fetch
    fetchCount();

    // Re-fetch when app returns to foreground
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchCount();
    });

    // ── Push notification listener (most reliable — always works) ──
    const pushSub = onNotificationReceived((notification: any) => {
      const data = notification?.request?.content?.data;
      const type = data?.type;
      // Chat messages don't show in alerts tab
      if (type === 'new_message') return;
      // Increment immediately, then re-fetch actual count
      setUnreadCount(c => c + 1);
      // Debounced re-fetch to get accurate server count
      setTimeout(fetchCount, 2000);
    });

    // ── Socket listeners (real-time when connected) ──
    const increment = () => { setUnreadCount(c => c + 1); };
    const incrementIfAllowed = async (raw: any) => {
      const kind = raw?.type;
      if (kind === 'new_message') return;
      if (kind === 'status_changed' || kind === 'schedule_change' || kind === 'assignment' || kind === 'status_update') {
        setUnreadCount(c => c + 1);
        return;
      }
      const prefs = await getNotificationPrefs();
      if (kind === 'critical' && !prefs.critical) return;
      if (kind === 'advisory' && !prefs.advisory) return;
      setUnreadCount(c => c + 1);
    };

    const lid1 = socketService.on('new-alert', incrementIfAllowed);
    const lid2 = socketService.on('new-notification', incrementIfAllowed);
    const lid3 = socketService.on('new-assignment', increment);
    const lid4 = socketService.on('report-status', increment);
    const lid5 = socketService.on('schedule-updated', increment);

    return () => {
      sub.remove();
      pushSub?.remove();
      socketService.off(lid1);
      socketService.off(lid2);
      socketService.off(lid3);
      socketService.off(lid4);
      socketService.off(lid5);
    };
  }, [token]);

  return (
    <AlertBadgeContext.Provider value={{ unreadCount, setUnreadCount, refetch: fetchCount }}>
      {children}
    </AlertBadgeContext.Provider>
  );
}

export function useAlertBadge() {
  return useContext(AlertBadgeContext);
}
