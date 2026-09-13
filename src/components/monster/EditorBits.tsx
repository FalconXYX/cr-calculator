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

/* ---------------- Entry list ---------------- */

interface EntryListProps {
  entries: Entry[];
  onChange: (next: Entry[]) => void;
  addLabel: string;
  namePlaceholder: string;
  textPlaceholder: string;
  /** Shows the action / bonus action / reaction selector on each entry. */
  kinded?: boolean;
}

export function EntryList({
  entries, onChange, addLabel, namePlaceholder, textPlaceholder, kinded,
}: EntryListProps) {
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
          {kinded && (
            <div className="mm-entry-controls">
              <select
                value={kindOf(e)}
                aria-label="Kind"
                onChange={(ev) => patch(i, { kind: ev.target.value as ActionKind })}
              >
                {ACTION_KINDS.map((k) => (
                  <option key={k} value={k}>{ACTION_KIND_LABEL[k]}</option>
                ))}
              </select>
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
            </div>
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
