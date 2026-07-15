import { createContext, useContext, useState } from 'react';

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
  return (
    <AlertBadgeContext.Provider value={{ unreadCount, setUnreadCount }}>
      {children}
    </AlertBadgeContext.Provider>
  );
}

export function useAlertBadge() {
  return useContext(AlertBadgeContext);
}
