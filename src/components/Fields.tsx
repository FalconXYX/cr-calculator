import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export function Row({ children }: { children: ReactNode }) {
  return <div className="row">{children}</div>;
}

/** CR adjustments always carry a sign, "+0 CR" included. */
export const signedAlways = (n: number): string => (n < 0 ? String(n) : `+${n}`);
export const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

interface NumberFieldProps {
  id?: string;
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * Number input that lets you type freely and only clamps on blur.
 *
 * Clamping on every keystroke fights the user — typing "1" into a field with
 * a minimum of 10 would rewrite it instantly. The local text state is synced
 * back from the prop only while the field is unfocused, so an external change
 * (loading a profile, Reset) still lands without stomping on typing.
 */
export function NumberField({ id, value, min, max, onCommit, ariaLabel, className }: NumberFieldProps) {
  const [text, setText] = useState(() => String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  return (
    <input
      type="number"
      id={id}
      className={className}
      value={text}
      min={min}
      max={max}
      inputMode="numeric"
      aria-label={ariaLabel}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n)) onCommit(n);
      }}
      onBlur={() => {
        focused.current = false;
        let n = parseFloat(text);
        if (!Number.isFinite(n)) n = value;
        n = clamp(n, min, max);
        setText(String(n));
        onCommit(n);
      }}
    />
  );
}

interface OutCellProps {
  label: string;
  value: ReactNode;
  /** Rung adjustment, rendered as a "(+1 CR)" suffix. */
  adjust?: number;
  wide?: boolean;
  result?: boolean;
  dimmed?: boolean;
}

export function OutCell({ label, value, adjust, wide, result, dimmed }: OutCellProps) {
  const cls = ['cell', 'out'];
  if (wide) cls.push('wide');
  if (result) cls.push('result');
  if (dimmed) cls.push('muted-out');
  return (
    <div className={cls.join(' ')}>
      <span>{label}</span>
      <b>
        {value}
        {adjust !== undefined && <> <small>({signedAlways(adjust)} CR)</small></>}
      </b>
    </div>
  );
}
