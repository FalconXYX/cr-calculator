/* The sync button: a Google mark in the title bar, and the panel behind it.

   Deliberately quiet. Most people who open a challenge rating calculator want
   to rate a challenge, not to think about accounts, and the thing works
   perfectly well without ever being pressed. So it is one 27-pixel button
   beside the theme switch, and it does not appear at all unless a client ID
   has been configured.

   The panel is portalled to the body rather than positioned inside the title
   bar. The panel it would otherwise sit in is `overflow: clip`, which clips
   absolutely positioned children just as happily as it clips anything else —
   the dropdown would be sliced off at the first row of the calculator. */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GoogleSync as Sync } from '../hooks/useGoogleSync.ts';

/** Google's mark, which their branding terms ask to be used unaltered. */
function GoogleMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1818l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 16.0455 5.4818 18 9 18z" />
      <path fill="#FBBC05" d="M3.9641 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2822-1.71V4.9582H.9573C.3477 6.1731 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.9641 10.71z" />
      <path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 1.9545.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z" />
    </svg>
  );
}

/** "just now", or how long ago in the largest unit that is still honest. */
function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function GoogleSyncButton({ sync }: { sync: Sync }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);

  /* Re-rendered on a timer only while open, so "3 minutes ago" is not stale
     the moment somebody reads it, and nothing ticks when nobody is looking. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, [open, sync.lastSync]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = button.current;
      const box = panel.current;
      if (!anchor || !box) return;
      const a = anchor.getBoundingClientRect();
      const p = box.getBoundingClientRect();
      const margin = 8;
      const left = Math.max(margin, Math.min(a.right - p.width, window.innerWidth - p.width - margin));
      let top = a.bottom + 5;
      if (top + p.height > window.innerHeight - margin) {
        top = Math.max(margin, a.top - p.height - 5);
      }
      box.style.left = `${Math.round(left)}px`;
      box.style.top = `${Math.round(top)}px`;
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, sync.phase, sync.error, sync.account]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panel.current?.contains(target) || button.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  if (!sync.available) return null;

  const working = sync.phase === 'working';
  const on = sync.phase === 'ready';
  const state = sync.error ? 'bad' : working ? 'busy' : on ? 'good' : 'idle';
  const label = on
    ? `Synced to Google${sync.account?.email ? ` as ${sync.account.email}` : ''}`
    : working ? 'Syncing with Google…' : 'Sync with your Google account';

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`icon-btn gsync gsync-${state}${open ? ' open' : ''}`}
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <GoogleMark />
      </button>

      {open && createPortal(
        <div className="gsync-panel" ref={panel} role="dialog" aria-label="Google sync">
          {on || working ? (
            <>
              <div className="gsync-head">
                <GoogleMark size={15} />
                <div className="gsync-who">
                  <b>{sync.account?.name || sync.account?.email || 'Signed in'}</b>
                  {sync.account?.email && sync.account.name
                    ? <span>{sync.account.email}</span>
                    : null}
                </div>
              </div>
              <p className="gsync-note">
                Saved calculations and saved monsters are kept in a private
                folder in your Drive, so they follow you to any browser you
                sign in from. Nothing else in your Drive is visible to this
                page.
              </p>
              <div className="gsync-state">
                {working
                  ? 'Syncing…'
                  : sync.lastSync
                    ? `Last synced ${ago(sync.lastSync, now)}`
                    : 'Not synced yet'}
              </div>
              {sync.error && <div className="gsync-error">{sync.error}</div>}
              <div className="gsync-actions">
                <button type="button" className="mini" disabled={working} onClick={sync.syncNow}>
                  Sync now
                </button>
                <button type="button" className="mini danger" onClick={() => { sync.disconnect(); setOpen(false); }}>
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="gsync-title">Sync across devices</div>
              <p className="gsync-note">
                Your saved calculations and saved monsters live in this browser
                only. Sign in to keep a copy in your own Google Drive, in a
                private folder only this page can see, and they will be here on
                your other devices too.
              </p>
              {sync.error && <div className="gsync-error">{sync.error}</div>}
              <button type="button" className="gsync-signin" onClick={sync.connect}>
                <GoogleMark size={17} />
                Sign in with Google
              </button>
              <p className="gsync-fine">
                Nothing is sent anywhere until you do. There is no account here
                and no server of ours in the middle — revoking access in your
                Google settings removes the copy.
              </p>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
