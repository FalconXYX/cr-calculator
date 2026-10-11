import { useEffect, useState } from 'react';

/** Told the key, every time anything is written through here. */
type Watcher = (key: string) => void;
const watchers = new Set<Watcher>();

/**
 * Listen for local writes.
 *
 * One choke point rather than a notification bolted onto each shelf: sync has
 * to notice a saved profile, a saved monster and a deletion alike, and the
 * shelves have no reason to know that sync exists. Returns the unsubscribe.
 */
export function watchStored(fn: Watcher): () => void {
  watchers.add(fn);
  return () => { watchers.delete(fn); };
}

/**
 * State mirrored into localStorage.
 *
 * Every access is guarded: private windows, cleared site data and browsers
 * set to block storage all throw rather than returning empty, and a thrown
 * read here would take the whole app down on boot.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  revive?: (raw: unknown) => T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      const parsed: unknown = JSON.parse(raw);
      return revive ? revive(parsed) : (parsed as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    writeStored(key, value);
  }, [key, value]);

  return [value, setValue];
}

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable; the app still works, it just will not resume */
    return;
  }
  /* Watchers only after a write that landed, and never allowed to take the
     write down with them. */
  for (const fn of watchers) {
    try { fn(key); } catch { /* not this caller's problem */ }
  }
}
