import { createContext, useContext, useState } from 'react';
import type { AlertConfig } from '@/components/AppAlert';
import { AppAlert } from '@/components/AppAlert';

interface AlertContextValue {
  showAlert: (config: AlertConfig) => void;
}

const AlertContext = createContext<AlertContextValue>({ showAlert: () => {} });

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AlertConfig | null>(null);

  return (
    <AlertContext.Provider value={{ showAlert: setConfig }}>
      {children}
      {config !== null && (
        <AppAlert
          config={config}
          onDismiss={() => setConfig(null)}
        />
      )}
    </AlertContext.Provider>
  );
}

export function useAlert() {
  return useContext(AlertContext);
}
