import { useCallback, useEffect, useState } from 'react';

function resolveInitial<T>(initial: T | (() => T)): T {
  return typeof initial === 'function' ? (initial as () => T)() : initial;
}

function readStoredValue<T>(key: string, initial: T | (() => T)): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : resolveInitial(initial);
  } catch {
    return resolveInitial(initial);
  }
}

export function useLocalStorageState<T>(key: string, initial: T | (() => T)) {
  const [valuesByKey, setValuesByKey] = useState<Record<string, T>>(() => ({
    [key]: readStoredValue(key, initial),
  }));

  const value = Object.prototype.hasOwnProperty.call(valuesByKey, key)
    ? valuesByKey[key]
    : readStoredValue(key, initial);

  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    setValuesByKey((prev) => {
      const prevValue = Object.prototype.hasOwnProperty.call(prev, key)
        ? prev[key]
        : readStoredValue(key, initial);
      const resolved = typeof next === 'function' ? (next as (current: T) => T)(prevValue) : next;
      return { ...prev, [key]: resolved };
    });
  }, [initial, key]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, [key, value]);

  return [value, setValue] as const;
}
