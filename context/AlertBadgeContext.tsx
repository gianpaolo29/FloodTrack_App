import { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { getAlertsWithReadState } from '@/services/api';
import { socketService } from '@/services/socket';
import { getNotificationPrefs } from '@/services/notifications';

interface AlertBadgeContextValue {
  unreadCount: number;
  setUnreadCount: (n: number) => void;
}

const AlertBadgeContext = createContext<AlertBadgeContextValue>({
  unreadCount: 0,
  setUnreadCount: () => {},
});

export function AlertBadgeProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;

    const fetchCount = async () => {
      try {
        const data = await getAlertsWithReadState(token);
        setUnreadCount(data.filter(a => !a.read).length);
      } catch {
        // silently ignore fetch errors
      }
    };

    // Initial fetch to populate count on mount / login
    fetchCount();

    // Re-fetch when app returns to foreground (handles background missed events)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchCount();
    });

    // Real-time: increment badge only for alert kinds the user has enabled
    const incrementIfAllowed = async (raw: any) => {
      const prefs = await getNotificationPrefs();
      const kind = raw?.type; // 'critical' | 'advisory' | 'update'
      if (kind === 'critical' && !prefs.critical) return;
      if (kind === 'advisory' && !prefs.advisory) return;
      if (kind === 'update'   && !prefs.myReports) return;
      setUnreadCount(c => c + 1);
    };
    socketService.on('new-alert', incrementIfAllowed);
    socketService.on('new-notification', incrementIfAllowed);

    return () => {
      sub.remove();
      socketService.off('new-alert', incrementIfAllowed);
      socketService.off('new-notification', incrementIfAllowed);
    };
  }, [token]);

  return (
    <AlertBadgeContext.Provider value={{ unreadCount, setUnreadCount }}>
      {children}
    </AlertBadgeContext.Provider>
  );
}

export function useAlertBadge() {
  return useContext(AlertBadgeContext);
}
