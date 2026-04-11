import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Per-device preference for the parcel-weight auto-advance behaviour.
// Stored in AsyncStorage so the user's choice persists across every order
// they open, instead of resetting to the built-in default each time.
const STORAGE_KEY = '@kh/autoAdvancePref';

export interface AutoAdvancePref {
  enabled: boolean;
  delay: number;
}

const DEFAULT_PREF: AutoAdvancePref = { enabled: true, delay: 2000 };

export function useAutoAdvancePref() {
  const [enabled, setEnabledState] = useState<boolean>(DEFAULT_PREF.enabled);
  const [delay, setDelayState] = useState<number>(DEFAULT_PREF.delay);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (cancelled || !raw) return;
        try {
          const parsed = JSON.parse(raw) as Partial<AutoAdvancePref>;
          if (typeof parsed.enabled === 'boolean') setEnabledState(parsed.enabled);
          if (typeof parsed.delay === 'number') setDelayState(parsed.delay);
        } catch {}
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setEnabled = useCallback(
    (value: boolean) => {
      setEnabledState(value);
      AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ enabled: value, delay }),
      ).catch(() => {});
    },
    [delay],
  );

  const setDelay = useCallback(
    (value: number) => {
      setDelayState(value);
      AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ enabled, delay: value }),
      ).catch(() => {});
    },
    [enabled],
  );

  return { enabled, delay, setEnabled, setDelay };
}
