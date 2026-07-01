import { useEffect, useState } from "react";

/** localStorage-backed setting (language mode, simple-English toggle, ...). */
export function useSetting<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    localStorage.setItem(key, JSON.stringify(v));
  };
  return [value, set];
}

/** Await async data once per dependency change; undefined while loading. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let alive = true;
    setValue(undefined);
    fn().then((v) => {
      if (alive) setValue(v);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
