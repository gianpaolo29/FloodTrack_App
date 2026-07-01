/**
 * Lightweight network connectivity hook.
 * Returns true when the device appears to be online.
 */
import { useEffect, useState } from 'react';

const PING_INTERVAL = 15_000;
const PING_URL = 'https://clients3.google.com/generate_204';

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    async function check() {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        await fetch(PING_URL, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeout);
        setIsConnected(true);
      } catch {
        setIsConnected(false);
      }
    }

    check();
    const interval = setInterval(check, PING_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return isConnected;
}
