/**
 * AlertContext — global SweetAlert state
 *
 * Wrap the root with <AlertProvider> then call useAlert().showAlert(config)
 * from any screen to show a premium animated confirmation/notification modal.
 */
import { createContext, useContext, useState } from 'react';
import type { AlertConfig } from '@/components/AppAlert';
import { AppAlert } from '@/components/AppAlert';

// ─── Context ──────────────────────────────────────────────────────────────────

interface AlertContextValue {
  showAlert: (config: AlertConfig) => void;
}

const AlertContext = createContext<AlertContextValue>({ showAlert: () => {} });

// ─── Provider ─────────────────────────────────────────────────────────────────

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAlert() {
  return useContext(AlertContext);
}
