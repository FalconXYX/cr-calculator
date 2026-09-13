/* The tooltip that explains a trait.

   Every entry shows BOTH halves: what the feature does at the table, and
   what it does to the challenge rating. The calculator this replaces only
   ever showed the second, which was the main thing wrong with it.

   Opening is driven by <InfoButton>, so hovering a row does nothing — the
   pointer crossing the list on its way elsewhere used to fire it constantly. */

import {
  createContext, useContext, useEffect, useId,
  useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import type { ReactNode } from 'react';

export interface PopoverContent {
  title: string;
  example?: string;
  desc: string;
  effect: string;
  /** Ticked, but does nothing at the chosen target CR. */
  gated?: boolean;
}

interface Anchored {
  id: string;
  anchor: HTMLElement;
  content: PopoverContent;
  pinned: boolean;
}

interface PopoverApi {
  /** Which InfoButton is currently showing, so buttons can style themselves. */
  openId: string | null;
  show: (id: string, anchor: HTMLElement, content: PopoverContent) => void;
  hover: (id: string, anchor: HTMLElement, content: PopoverContent) => void;
  toggle: (id: string, anchor: HTMLElement, content: PopoverContent) => void;
  scheduleHide: () => void;
  cancelHide: () => void;
  close: () => void;
}

const Ctx = createContext<PopoverApi | null>(null);

export function usePopoverApi(): PopoverApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('usePopoverApi used outside <PopoverProvider>');
  return api;
}

/** Only fine pointers get hover-to-open; touch users tap. */
const canHover = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export function PopoverProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Anchored | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const popRef = useRef<HTMLDivElement | null>(null);

  const api = useMemo<PopoverApi>(() => {
    const cancelHide = () => {
      if (hideTimer.current !== undefined) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = undefined;
      }
    };
    return {
      openId: state?.id ?? null,
      cancelHide,
      show(id, anchor, content) {
        cancelHide();
        setState({ id, anchor, content, pinned: false });
      },
      hover(id, anchor, content) {
        cancelHide();
        setState((prev) => (prev?.pinned ? prev : { id, anchor, content, pinned: false }));
      },
      toggle(id, anchor, content) {
        cancelHide();
        setState((prev) =>
          prev?.pinned && prev.id === id ? null : { id, anchor, content, pinned: true });
      },
      scheduleHide() {
        cancelHide();
        hideTimer.current = window.setTimeout(() => {
          setState((prev) => (prev?.pinned ? prev : null));
        }, 120);
      },
      close() {
        cancelHide();
        setState(null);
      },
    };
  }, [state]);

  /* Position against the anchor, flipping above when there is no room below. */
  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!state || !pop) return;

    const place = () => {
      const a = state.anchor;
      if (!a.isConnected) { setState(null); return; }
      const t = a.getBoundingClientRect();

      /* The trait list scrolls inside its own box, so a scroll event does not
         mean the popover should vanish — it means it must follow its anchor.
         Only give up once the anchor has actually left the viewport. */
      if (t.bottom < 0 || t.top > window.innerHeight ||
          t.right < 0 || t.left > window.innerWidth) {
        setState(null);
        return;
      }

      const p = pop.getBoundingClientRect();
      const margin = 8;
      let left = t.left + t.width / 2 - p.width / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - p.width - margin));

      let top = t.bottom + 5;
      if (top + p.height > window.innerHeight - margin) {
        const above = t.top - p.height - 5;
        top = above >= margin ? above : Math.max(margin, window.innerHeight - p.height - margin);
      }
      pop.style.left = `${Math.round(left)}px`;
      pop.style.top = `${Math.round(top)}px`;
    };

    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [state]);

  /* Escape closes; so does a click anywhere outside the popover. InfoButton
     stops propagation so its own click does not immediately close it again. */
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setState(null); };
    const onClick = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node)) setState(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [state]);

  useEffect(() => () => {
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current);
  }, []);

  return (
    <Ctx.Provider value={api}>
      {children}
      {state && (
        <div
          className="popover"
          role="tooltip"
          ref={popRef}
          onPointerEnter={api.cancelHide}
          onPointerLeave={api.scheduleHide}
        >
          <div className="pop-title">{state.content.title}</div>
          {state.content.example && <div className="pop-example">e.g. {state.content.example}</div>}
          <p className="pop-desc">{state.content.desc}</p>
          <div className="pop-effect">
            <b>Effect on CR</b>
            {state.content.effect}
          </div>
          {state.content.gated && (
            <p className="pop-gate">Not applied at your current target CR range.</p>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function InfoButton({ content, label }: { content: PopoverContent; label: string }) {
  const api = usePopoverApi();
  const id = useId();
  const ref = useRef<HTMLButtonElement | null>(null);
  const open = api.openId === id;

  return (
    <button
      ref={ref}
      type="button"
      className={`info-btn${open ? ' open' : ''}`}
      aria-label={label}
      onPointerEnter={() => { if (canHover() && ref.current) api.hover(id, ref.current, content); }}
      onPointerLeave={() => { if (canHover()) api.scheduleHide(); }}
      onFocus={() => { if (ref.current) api.show(id, ref.current, content); }}
      onBlur={api.scheduleHide}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (ref.current) api.toggle(id, ref.current, content);
      }}
    >
      i
    </button>
  );
}
