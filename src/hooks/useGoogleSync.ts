/* Wiring the shelves to a Google account.

   Three things make a sync happen: connecting, coming back to the tab, and
   editing something. The first two pull; the last pushes, after a pause long
   enough that saving three profiles in a row is one upload rather than three.

   Every one of them goes through the same exchange — read the remote, fold it
   into the local, write back if the fold moved anything — because a push that
   has not read first is how the other device's afternoon disappears. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  configured, connect as openDrive, disconnect as closeDrive,
  exchange, reconnect, signedIn,
} from '../lib/googleDrive.ts';
import type { Account } from '../lib/googleDrive.ts';
import { applySnapshot, digest, localSnapshot, merge, SYNCED_KEYS } from '../lib/sync.ts';
import { readStored, watchStored, writeStored } from './usePersistentState.ts';

/** Whether this browser has ever connected, so a reload can pick up quietly. */
const OPT_KEY = 'cr-calc-google-sync';

export type SyncPhase =
  /** No client ID is configured, so there is nothing to show. */
  | 'off'
  /** Configured, nobody signed in. */
  | 'out'
  /** Talking to Google. */
  | 'working'
  /** Signed in and up to date. */
  | 'ready';

export interface GoogleSync {
  available: boolean;
  phase: SyncPhase;
  account: Account | null;
  lastSync: number | null;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  syncNow: () => void;
}

/** How long after an edit to send it. */
const SETTLE_MS = 2500;
/** The shortest gap between two pulls triggered by returning to the tab. */
const REFRESH_MS = 60_000;

const reason = (error: unknown): string => {
  const text = error instanceof Error ? error.message : String(error);
  return text || 'Sync failed.';
};

export function useGoogleSync(): GoogleSync {
  const available = useMemo(configured, []);
  const [phase, setPhase] = useState<SyncPhase>(available ? 'out' : 'off');
  const [account, setAccount] = useState<Account | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* What the remote is believed to hold. An edit is anything that does not
     match it; without this the write below would read as an edit and sync
     would chase its own tail. */
  const sent = useRef('');
  /* Writes made by sync itself, which are not edits however much they look
     like them. */
  const landing = useRef(false);
  const busy = useRef(false);
  const again = useRef(false);
  const ranAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const alive = useRef(true);

  useEffect(() => () => {
    alive.current = false;
    if (timer.current !== undefined) window.clearTimeout(timer.current);
  }, []);

  const runRef = useRef<(interactive: boolean) => Promise<void>>(async () => {});

  const run = useCallback(async (interactive: boolean): Promise<void> => {
    /* One conversation at a time. A second request while the first is in
       flight is remembered, not dropped — it may be carrying the edit that
       arrived a moment after the upload started. */
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    ranAt.current = Date.now();
    if (alive.current) { setPhase('working'); setError(null); }

    try {
      const merged = await exchange((theirs) => merge(localSnapshot(), theirs), interactive);
      landing.current = true;
      try {
        applySnapshot(merged);
      } finally {
        landing.current = false;
      }
      /* Read back rather than trusting what went down, so the digest is of
         the shelves as they now actually are. */
      sent.current = digest(localSnapshot());
      if (alive.current) { setLastSync(Date.now()); setPhase('ready'); }
    } catch (caught) {
      if (alive.current) {
        setError(reason(caught));
        setPhase(signedIn() ? 'ready' : 'out');
      }
    } finally {
      busy.current = false;
      if (again.current && alive.current) {
        again.current = false;
        void runRef.current(false);
      }
    }
  }, []);

  runRef.current = run;

  const schedule = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      /* Cheaper than an upload, and most writes on these keys turn out to
         change nothing: loading a profile rewrites the same map. */
      if (digest(localSnapshot()) === sent.current) return;
      void runRef.current(false);
    }, SETTLE_MS);
  }, []);

  /* ---- An edit means a push ---- */

  useEffect(() => {
    if (phase === 'off' || phase === 'out') return;
    return watchStored((key) => {
      if (landing.current) return;
      if (!SYNCED_KEYS.includes(key)) return;
      schedule();
    });
  }, [phase, schedule]);

  /* ---- Coming back to the tab means a pull ---- */

  useEffect(() => {
    if (phase === 'off' || phase === 'out') return;
    const look = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - ranAt.current < REFRESH_MS) return;
      void run(false);
    };
    document.addEventListener('visibilitychange', look);
    window.addEventListener('online', look);
    return () => {
      document.removeEventListener('visibilitychange', look);
      window.removeEventListener('online', look);
    };
  }, [phase, run]);

  /* ---- Picking up where the last visit left off ---- */

  useEffect(() => {
    if (!available) return;
    if (!readStored<boolean>(OPT_KEY, false)) return;
    let dropped = false;
    void (async () => {
      /* Quietly: no prompt, and no error if the grant has lapsed. The button
         simply reads as signed out, which it is. */
      const who = await reconnect();
      if (dropped || !alive.current) return;
      if (!who) { setPhase('out'); return; }
      setAccount(who);
      await runRef.current(false);
    })();
    return () => { dropped = true; };
  }, [available]);

  const connect = useCallback(() => {
    void (async () => {
      setPhase('working');
      setError(null);
      /* Held for the length of the popup. Google will only entertain one
         request at a time, and an edit made while the window is open would
         otherwise schedule a push that arrives to find sign-in half done and
         reports it as a failure. */
      busy.current = true;
      let who: Account;
      try {
        who = await openDrive();
      } catch (caught) {
        busy.current = false;
        again.current = false;
        if (!alive.current) return;
        setError(reason(caught));
        setPhase('out');
        return;
      }
      busy.current = false;
      if (!alive.current) return;
      setAccount(who);
      writeStored(OPT_KEY, true);
      await runRef.current(true);
    })();
  }, []);

  const disconnect = useCallback(() => {
    writeStored(OPT_KEY, false);
    sent.current = '';
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }
    setPhase('out');
    setAccount(null);
    setLastSync(null);
    setError(null);
    /* Nothing local is deleted. Signing out stops the copying; it is not a
       way to throw away your monsters, and somebody who meant that would be
       very surprised to have done it by accident. */
    void closeDrive();
  }, []);

  const syncNow = useCallback(() => { void run(true); }, [run]);

  return { available, phase, account, lastSync, error, connect, disconnect, syncNow };
}
