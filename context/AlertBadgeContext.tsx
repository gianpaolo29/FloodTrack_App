import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { getAlertsWithReadState } from '@/services/api';
import { socketService } from '@/services/socket';

const POLL_INTERVAL = 15_000; // 15 seconds

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!token) return;

    const poll = async () => {
      try {
        const data = await getAlertsWithReadState(token);
        setUnreadCount(data.filter(a => !a.read).length);
      } catch {
        // silently ignore polling errors
      }
    };

    // Initial fetch
    poll();

    // Start polling
    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    // Pause polling when app is backgrounded, resume when foregrounded
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        poll();
        if (!intervalRef.current) {
          intervalRef.current = setInterval(poll, POLL_INTERVAL);
        }
      } else {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    });

    const increment = () => setUnreadCount(c => c + 1);
    socketService.on('new-alert', increment);
    socketService.on('new-notification', increment);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
      socketService.off('new-alert', increment);
      socketService.off('new-notification', increment);
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
