import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { NumberField } from '../Fields.tsx';
import {
  ACTION_KINDS, ACTION_KIND_LABEL, PROFICIENCY_LABEL, kindOf, newEntryId, sign,
} from '../../lib/statblock.ts';
import type { ActionKind, Entry, ProficiencyTier, UnusualChoice } from '../../lib/statblock.ts';
import { ACTION_PRESETS, PRESET_GROUPS, presetById } from '../../lib/actionPresets.ts';

/* ---------------- Accordion ---------------- */

interface SectionProps {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function Section({ title, count, open, onToggle, children }: SectionProps) {
  const ref = useRef<HTMLDivElement>(null);

  /* Open a long section near the foot of the list and its body unfolds below
     the fold of the pane. Nudge the pane — and only the pane, so the page
     does not jump — far enough to put the section header at the top. */
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    const pane = el?.closest('.mm-editor');
    if (!el || !pane) return;
    const e = el.getBoundingClientRect();
    const p = pane.getBoundingClientRect();
    if (e.top < p.top || e.bottom > p.bottom) pane.scrollTop += e.top - p.top;
  }, [open]);

  return (
    <div className={`mm-sec${open ? ' open' : ''}`} ref={ref}>
      <button className="mm-sec-head" type="button" aria-expanded={open} onClick={onToggle}>
        <span className="mm-chev" aria-hidden="true">›</span>
        <span className="mm-sec-title">{title}</span>
        {count !== undefined && (
          <span className={`pill${count ? ' on' : ''}`}>{count}</span>
        )}
      </button>
      {open && <div className="mm-sec-body">{children}</div>}
    </div>
  );
}

/* ---------------- Fields ---------------- */

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mm-field">
      <span className="mm-label">{label}</span>
      {children}
    </label>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function TextField({ label, value, onChange, placeholder }: TextFieldProps) {
  return (
    <Field label={label}>
      <input
        type="text"
        className="mm-text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  /** For options stored by id rather than by the words shown. */
  labels?: Record<string, string>;
}

/**
 * A real dropdown over a fixed vocabulary.
 *
 * A value that is not in the list — typed in an older build, or carried over
 * from somewhere else — is kept as an extra option rather than silently
 * snapping to whatever happens to be first.
 */
export function SelectField({ label, value, options, onChange, labels }: SelectFieldProps) {
  const known = options.includes(value);
  const show = (o: string) => labels?.[o] ?? o;
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {!known && <option value={value}>{show(value) || '—'}</option>}
        {options.map((o) => <option key={o} value={o}>{show(o)}</option>)}
      </select>
    </Field>
  );
}

interface NumFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  suffix?: string;
}

export function NumField({ label, value, min, max, onChange, suffix }: NumFieldProps) {
  return (
    <div className="mm-field">
      <span className="mm-label">{label}</span>
      <NumberField
        value={value}
        min={min}
        max={max}
        onCommit={onChange}
        ariaLabel={label}
        className="mm-num"
      />
      {suffix && <span className="mm-suffix">{suffix}</span>}
    </div>
  );
}

export function CheckField({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (b: boolean) => void;
}) {
  return (
    <label className="mm-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/* ---------------- Chip picker ---------------- */

interface ChipPickerProps {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Adds a free-text box for anything the preset list does not cover. */
  custom?: boolean;
  placeholder?: string;
}

/**
 * Toggle chips for the standard vocabulary, plus anything typed in.
 *
 * The preset list is never exhaustive — "damage from nonmagical attacks" and
 * homebrew conditions have to be expressible — so a custom entry is kept in
 * the same array and rendered as a removable chip.
 */
export function ChipPicker({ options, selected, onChange, custom, placeholder }: ChipPickerProps) {
  const [draft, setDraft] = useState('');
  const extras = selected.filter((s) => !options.includes(s));

  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  };

  const add = () => {
    const v = draft.trim();
    if (!v || selected.includes(v)) { setDraft(''); return; }
    onChange([...selected, v]);
    setDraft('');
  };

  return (
    <div className="mm-chips">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`chip${selected.includes(o) ? ' on' : ''}`}
          aria-pressed={selected.includes(o)}
          onClick={() => toggle(o)}
        >
          {o}
        </button>
      ))}
      {extras.map((o) => (
        <button
          key={o}
          type="button"
          className="chip on custom"
          onClick={() => toggle(o)}
          title="Remove"
        >
          {o} <span aria-hidden="true">×</span>
        </button>
      ))}
      {custom && (
        <span className="mm-chip-add">
          <input
            type="text"
            className="mm-text"
            value={draft}
            placeholder={placeholder ?? 'Add…'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          />
          <button type="button" className="mini" onClick={add} disabled={!draft.trim()}>Add</button>
        </span>
      )}
    </div>
  );
}

/** A note, not a block — the choice stands, you are just told what it costs. */
export function Warnings({ picks }: { picks: UnusualChoice[] }) {
  if (!picks.length) return null;
  return (
    <div className="mm-warn" role="note">
      {picks.map((p) => (
        <p key={p.value}>
          <b>{p.value} is unusual for a monster.</b> {p.why}
        </p>
      ))}
    </div>
  );
}

/* ---------------- Tiered picker ---------------- */

export interface TierRow {
  id: string;
  name: string;
  tier: ProficiencyTier;
  /** What the check totals at the current tier. */
  bonus: number;
}

/**
 * Chips that cycle none to proficient to expertise.
 *
 * One control rather than a checkbox plus a separate expertise toggle: a
 * skill is at exactly one of three levels, and cycling keeps the list dense
 * enough to show all nineteen checks at once.
 */
export function TierPicker({ rows, onCycle }: { rows: TierRow[]; onCycle: (id: string) => void }) {
  return (
    <div className="mm-chips">
      {rows.map((r) => (
        <button
          key={r.id}
          type="button"
          className={`chip tier-${r.tier}`}
          title={`${r.name}: ${PROFICIENCY_LABEL[r.tier]}`}
          aria-label={`${r.name}, ${PROFICIENCY_LABEL[r.tier]}`}
          onClick={() => onCycle(r.id)}
        >
          {r.name}{r.tier !== 'none' && ` ${sign(r.bonus)}`}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Catalogue ---------------- */

/** One thing that can be picked out of a catalogue. */
export interface CatalogOption {
  id: string;
  name: string;
  /** Shown in grey beside the name — the creature it came from, its rating. */
  note?: string;
  text: string;
  kind?: ActionKind;
}

interface CatalogPickerProps {
  placeholder: string;
  /** Null while the catalogue is still on its way. */
  search: ((query: string) => CatalogOption[]) | null;
  onPick: (option: CatalogOption) => void;
  /** Left out where the picker is the whole point of the section it is in. */
  onClose?: () => void;
  note?: string;
  /** An optional switch above the list, for widening what it searches. */
  toggle?: { label: string; on: boolean; onChange: (on: boolean) => void };
}

/**
 * Search a catalogue and pick from it.
 *
 * A dropdown was fine for twenty hand-written presets. A catalogue of
 * hundreds is past the point where scrolling a select is any use at all, so
 * this is a box you type in and a list of what matched.
 */
export function CatalogPicker({ placeholder, search, onPick, onClose, note, toggle }: CatalogPickerProps) {
  const [query, setQuery] = useState('');
  const results = search ? search(query) : [];

  return (
    <div className="mm-catalog">
      <div className="mm-catalog-top">
        <input
          type="search"
          className="mm-text"
          value={query}
          placeholder={placeholder}
          aria-label={placeholder}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
        {onClose && <button type="button" className="mini" onClick={onClose}>Close</button>}
      </div>
      {note && <p className="mm-note">{note}</p>}
      {toggle && (
        <label className="mm-check mm-catalog-toggle">
          <input
            type="checkbox"
            checked={toggle.on}
            onChange={(e) => toggle.onChange(e.target.checked)}
          />
          {toggle.label}
        </label>
      )}
      {!search && <Progress label="Fetching the catalogue" />}
      {search && !results.length && (
        <p className="mm-note">Nothing matches “{query}”.</p>
      )}
      <div className="mm-catalog-list">
        {results.map((o) => (
          <button
            key={o.id}
            type="button"
            className="mm-catalog-row"
            onClick={() => onPick(o)}
          >
            <span className="mm-catalog-name">{o.name}</span>
            {o.note && <span className="mm-catalog-note">{o.note}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Progress ---------------- */

/**
 * A bar, and nothing else.
 *
 * What a task is doing at each moment is the task's business. "Loading
 * language traineddata 42%" tells somebody waiting for their stat block
 * nothing they can act on, and reads as the machine talking about itself.
 * How far along it is, they can act on: they know whether to wait.
 *
 * Leave `value` out for work whose length is not known, and the bar paces
 * instead of filling.
 */
export function Progress({ value, label }: { value?: number; label: string }) {
  const known = typeof value === 'number';
  return (
    <div
      className="mm-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={known ? 0 : undefined}
      aria-valuemax={known ? 100 : undefined}
      aria-valuenow={known ? Math.round(value * 100) : undefined}
    >
      <div
        className={`mm-progress-fill${known ? '' : ' waiting'}`}
        style={known ? { width: `${Math.round(value * 100)}%` } : undefined}
      />
    </div>
  );
}

/* ---------------- Entry list ---------------- */

/** Where an entry list gets its browse button from. */
export interface EntryCatalog {
  buttonLabel: string;
  placeholder: string;
  note?: string;
  /** Null until the catalogue has arrived. */
  search: ((query: string) => CatalogOption[]) | null;
}

interface EntryListProps {
  entries: Entry[];
  onChange: (next: Entry[]) => void;
  addLabel: string;
  namePlaceholder: string;
  textPlaceholder: string;
  /** Shows the action / bonus action / reaction selector on each entry. */
  kinded?: boolean;
  /** Lets each entry be filled from a catalogue. */
  catalog?: EntryCatalog;
}

export function EntryList({
  entries, onChange, addLabel, namePlaceholder, textPlaceholder, kinded, catalog,
}: EntryListProps) {
  /* Which entry has the catalogue open under it, by id. One at a time: two
     open search boxes in a narrow column is a list you cannot read. */
  const [browsing, setBrowsing] = useState<string | null>(null);
  const patch = (i: number, part: Partial<Entry>) => {
    onChange(entries.map((e, j) => (i === j ? { ...e, ...part } : e)));
  };

  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= entries.length) return;
    const next = [...entries];
    const a = next[i]!;
    next[i] = next[j]!;
    next[j] = a;
    onChange(next);
  };

  return (
    <div className="mm-entries">
      {entries.map((e, i) => (
        <div className="mm-entry" key={e.id}>
          <div className="mm-entry-top">
            <input
              type="text"
              className="mm-text mm-entry-name"
              value={e.name}
              placeholder={namePlaceholder}
              aria-label="Name"
              onChange={(ev) => patch(i, { name: ev.target.value })}
            />
            <button
              type="button" className="mini" title="Move up"
              disabled={i === 0} onClick={() => move(i, -1)}
            >↑</button>
            <button
              type="button" className="mini" title="Move down"
              disabled={i === entries.length - 1} onClick={() => move(i, 1)}
            >↓</button>
            <button
              type="button" className="mini danger" title="Delete"
              onClick={() => onChange(entries.filter((_, j) => j !== i))}
            >×</button>
          </div>
          {(kinded || catalog) && (
            <div className="mm-entry-controls">
              {kinded && (
                <select
                  value={kindOf(e)}
                  aria-label="Kind"
                  onChange={(ev) => patch(i, { kind: ev.target.value as ActionKind })}
                >
                  {ACTION_KINDS.map((k) => (
                    <option key={k} value={k}>{ACTION_KIND_LABEL[k]}</option>
                  ))}
                </select>
              )}
              {catalog && (
                <button
                  type="button"
                  className="mini"
                  aria-expanded={browsing === e.id}
                  onClick={() => setBrowsing(browsing === e.id ? null : e.id)}
                >
                  {catalog.buttonLabel}
                </button>
              )}
              {kinded && (
              <>
              {/* Loads into THIS entry rather than making another one, so a
                  preset is a starting point for what you are writing. */}
              <select
                className="mm-preset-select"
                value=""
                aria-label="Load a preset into this action"
                onChange={(ev) => {
                  const p = presetById(ev.target.value);
                  if (p) patch(i, { name: p.name, text: p.text, kind: p.kind });
                }}
              >
                <option value="">Load a preset…</option>
                {PRESET_GROUPS.map((g) => (
                  <optgroup key={g} label={g}>
                    {ACTION_PRESETS.filter((x) => x.group === g).map((x) => (
                      <option key={x.id} value={x.id}>{x.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              </>
              )}
            </div>
          )}
          {catalog && browsing === e.id && (
            <CatalogPicker
              placeholder={catalog.placeholder}
              {...(catalog.note ? { note: catalog.note } : {})}
              search={catalog.search}
              onClose={() => setBrowsing(null)}
              onPick={(o) => {
                /* Into the entry being written, the same as the presets: a
                   catalogue trait is a starting point, not a finished one. */
                patch(i, { name: o.name, text: o.text, ...(o.kind ? { kind: o.kind } : {}) });
                setBrowsing(null);
              }}
            />
          )}
          <textarea
            className="mm-textarea"
            rows={3}
            value={e.text}
            placeholder={textPlaceholder}
            aria-label="Description"
            onChange={(ev) => patch(i, { text: ev.target.value })}
          />
        </div>
      ))}
      <button
        type="button"
        className="mini mm-add"
        onClick={() => onChange([...entries,
          { id: newEntryId(), name: '', text: '', ...(kinded ? { kind: 'action' as ActionKind } : {}) }])}
      >
        + {addLabel}
      </button>
    </div>
  );
}
