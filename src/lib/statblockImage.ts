/* Laying a stat block out as a picture.

   The layout is worked out here and drawn somewhere else. Everything below is
   arithmetic over a measuring function, so the wrapping and the column split
   can be tested without a canvas, a browser or a font — which matters, since
   a picture that comes out wrong is worse than no picture at all.

   Two column widths, because a stat block that fits in one column at CR 1 is
   a very long ribbon at CR 20, and the printed books answer that the same
   way: put it in two. */

import {
  ABILITIES, ABILITY_LABEL, ACTION_KIND_HEADING, ENTRY_HEADING, ENTRY_SECTIONS,
  abilityMod, actionsByKind, legendaryIntro, metaText, sign,
} from './statblock.ts';
import type { Derived, Entry, StatBlock } from './statblock.ts';
import { statLines } from './statblockText.ts';

/* ---------------- Type ---------------- */

export type Family = 'serif' | 'sans';

export interface FontSpec {
  size: number;
  /** 700 for the bold that a printed block uses on every label. */
  weight: 400 | 700;
  italic?: boolean;
  family?: Family;
  /** Capitals at full size, lower case as capitals at four fifths. */
  smallCaps?: boolean;
}

/** A stretch of text that shares one font and one colour. */
export interface Span {
  text: string;
  font: FontSpec;
  accent?: boolean;
}

export interface Palette {
  background: string;
  text: string;
  /** The maroon of a printed block; pink, here, since that is what the app uses. */
  accent: string;
  rule: string;
  serif: string;
  sans: string;
}

/* ---------------- Measuring ---------------- */

/** Width of one span, in pixels. Supplied by the caller so this stays pure. */
export type Measure = (text: string, font: FontSpec) => number;

/**
 * Small capitals, spelled out.
 *
 * Canvas takes a CSS font shorthand but browsers disagree about whether
 * `small-caps` in it does anything, so the effect is built by hand: the
 * capitals stay as they are and the lower case becomes capitals four fifths
 * the size. Both the measurer and the renderer walk the same split, so what
 * is measured is what is drawn.
 */
export const SMALL_CAP_RATIO = 0.8;

export function smallCapRuns(text: string, font: FontSpec): Span[] {
  if (!font.smallCaps) return [{ text, font }];
  const runs: Span[] = [];
  for (const piece of text.match(/[^a-z]+|[a-z]+/g) ?? []) {
    const lower = /^[a-z]/.test(piece);
    runs.push({
      text: lower ? piece.toUpperCase() : piece,
      font: lower
        ? { ...font, size: Math.round(font.size * SMALL_CAP_RATIO), smallCaps: false }
        : { ...font, smallCaps: false },
    });
  }
  return runs;
}

const spanWidth = (span: Span, measure: Measure): number =>
  smallCapRuns(span.text, span.font)
    .reduce((total, run) => total + measure(run.text, run.font), 0);

/* ---------------- Blocks ---------------- */

export type Block =
  | { kind: 'spans'; spans: Span[]; leading: number; gapAbove: number }
  | { kind: 'rule'; gapAbove: number; fade: boolean }
  | { kind: 'abilities'; gapAbove: number }
  | { kind: 'underline'; gapAbove: number };

/** A block once its text has been broken into lines that fit. */
export interface PlacedBlock {
  block: Block;
  /** Each line is the spans that sit on it, in order. */
  lines: Span[][];
  height: number;
}

export interface Column {
  x: number;
  blocks: { placed: PlacedBlock; y: number }[];
}

export interface Layout {
  width: number;
  height: number;
  columnWidth: number;
  columns: Column[];
}

export interface ImageOptions {
  columns: 1 | 2;
  /** Width of one column of text, before padding. */
  columnWidth?: number;
  padding?: number;
  gutter?: number;
  /** Base type size. Everything else is in proportion to it. */
  base?: number;
}

const DEFAULTS = { columnWidth: 460, padding: 28, gutter: 34, base: 16 };

/* ---------------- Building the block list ---------------- */

/**
 * The blocks of a stat block, and where it is allowed to break.
 *
 * `firstMovable` is the index of the first block that may start a second
 * column. Everything before it — the name, the defences, the ability scores
 * and the traits — belongs together at the top left, which is how a printed
 * block reads. Only the actions and what follows them may move across.
 */
interface BuiltBlocks { blocks: Block[]; firstMovable: number; }

function buildBlocks(sb: StatBlock, d: Derived, base: number): BuiltBlocks {
  const serif = (size: number, weight: 400 | 700 = 400, italic = false): FontSpec =>
    ({ size, weight, italic, family: 'serif' });
  const body = serif(base);
  const bold = serif(base, 700);
  const out: Block[] = [];

  const spans = (list: Span[], gapAbove = 0, leading = base * 1.42): void => {
    out.push({ kind: 'spans', spans: list, leading, gapAbove });
  };

  spans([{
    text: sb.name || 'Unnamed',
    font: { size: Math.round(base * 1.85), weight: 700, family: 'serif', smallCaps: true },
    accent: true,
  }], 0, base * 2.05);
  spans([{ text: metaText(sb), font: serif(Math.round(base * 0.88), 400, true) }], 2);

  const { top, mid } = statLines(sb, d);
  out.push({ kind: 'rule', gapAbove: Math.round(base * 0.55), fade: true });
  for (const line of top) {
    spans([{ text: `${line.key} `, font: bold, accent: true }, { text: line.value, font: body }], 2);
  }
  out.push({ kind: 'rule', gapAbove: Math.round(base * 0.55), fade: true });
  out.push({ kind: 'abilities', gapAbove: Math.round(base * 0.3) });
  out.push({ kind: 'rule', gapAbove: Math.round(base * 0.55), fade: true });
  for (const line of mid) {
    spans([{ text: `${line.key} `, font: bold, accent: true }, { text: line.value, font: body }], 2);
  }
  out.push({ kind: 'rule', gapAbove: Math.round(base * 0.55), fade: true });

  const entries = (list: readonly Entry[]): void => {
    for (const e of list) {
      const paragraphs = e.text.split(/\n{2,}/).filter((p) => p.trim());
      spans([
        { text: `${e.name || 'Unnamed'}. `, font: serif(base, 700, true) },
        { text: (paragraphs.shift() ?? '').replace(/\n/g, ' '), font: body },
      ], Math.round(base * 0.5));
      for (const p of paragraphs) spans([{ text: p.replace(/\n/g, ' '), font: body }], 4);
    }
  };

  const heading = (text: string): void => {
    spans([{
      text,
      font: { size: Math.round(base * 1.24), weight: 700, family: 'serif', smallCaps: true },
      accent: true,
    }], Math.round(base * 0.85), base * 1.4);
    out.push({ kind: 'underline', gapAbove: 1 });
  };

  entries(sb.entries.trait);
  /* Everything above stays in the first column. */
  const firstMovable = out.length;

  for (const group of actionsByKind(sb.entries.action)) {
    heading(ACTION_KIND_HEADING[group.kind]);
    entries(group.entries);
  }
  for (const section of ENTRY_SECTIONS) {
    if (section === 'trait' || section === 'action') continue;
    const list = sb.entries[section];
    if (!list.length) continue;
    heading(ENTRY_HEADING[section]);
    if (section === 'legendary') spans([{ text: legendaryIntro(sb), font: body }], Math.round(base * 0.4));
    entries(list);
  }
  return { blocks: out, firstMovable };
}

/* ---------------- Wrapping ---------------- */

/**
 * Break a run of spans across lines no wider than the column.
 *
 * Words are moved one at a time and keep the font they arrived with, so a
 * bold label that runs past the end of a line carries its weight onto the
 * next one rather than turning plain halfway through.
 */
export function wrapSpans(spans: Span[], width: number, measure: Measure): Span[][] {
  const lines: Span[][] = [];
  let line: Span[] = [];
  let used = 0;

  /* The space that caused a break belongs to neither line, so it is dropped
     rather than left hanging off the end of the one above. */
  const endLine = (): void => {
    const last = line.at(-1);
    if (last) last.text = last.text.replace(/\s+$/, '');
    lines.push(line.filter((s) => s.text));
    line = [];
    used = 0;
  };

  for (const span of spans) {
    let pending = '';
    const flush = (): void => {
      if (!pending) return;
      line.push({ ...span, text: pending });
      used += spanWidth({ ...span, text: pending }, measure);
      pending = '';
    };
    for (const word of span.text.split(/(\s+)/)) {
      if (!word) continue;
      const w = spanWidth({ ...span, text: word }, measure);
      const wide = used + spanWidth({ ...span, text: pending }, measure) + w > width;
      if (wide && (line.length || pending)) {
        flush();
        endLine();
        if (/^\s+$/.test(word)) continue;
      }
      pending += word;
    }
    flush();
  }
  if (line.length) endLine();
  return lines.length ? lines : [[]];
}

/* ---------------- Laying out ---------------- */

function place(block: Block, width: number, base: number, measure: Measure): PlacedBlock {
  if (block.kind === 'spans') {
    const lines = wrapSpans(block.spans, width, measure);
    return { block, lines, height: block.gapAbove + lines.length * block.leading };
  }
  if (block.kind === 'abilities') {
    return { block, lines: [], height: block.gapAbove + base * 2.5 };
  }
  /* A rule and a heading's underline are both a few pixels of ink. */
  return { block, lines: [], height: block.gapAbove + (block.kind === 'rule' ? 5 : 4) };
}

/**
 * Where every block ends up.
 *
 * In one column that is simply one after another. In two, the blocks are
 * dealt into the first column until it has passed half the total and then
 * into the second, which balances them without ever splitting a paragraph
 * across the gap.
 *
 * The balance is a preference, not a rule. The rule is that the name, the
 * defences, the ability scores and the traits stay together in the first
 * column, because that is how a printed stat block reads: the second column
 * starts at the actions or later, however lopsided that leaves it.
 */
export function layoutStatBlock(
  sb: StatBlock, d: Derived, options: ImageOptions, measure: Measure,
): Layout {
  const columnWidth = options.columnWidth ?? DEFAULTS.columnWidth;
  const padding = options.padding ?? DEFAULTS.padding;
  const gutter = options.gutter ?? DEFAULTS.gutter;
  const base = options.base ?? DEFAULTS.base;

  const built = buildBlocks(sb, d, base);
  const placed = built.blocks.map((b) => place(b, columnWidth, base, measure));
  const total = placed.reduce((a, b) => a + b.height, 0);

  const count = options.columns;
  const columns: Column[] = Array.from({ length: count }, (_, i) => ({
    x: padding + i * (columnWidth + gutter),
    blocks: [],
  }));

  let index = 0;
  let y = padding;
  let filled = 0;
  placed.forEach((block, i) => {
    /* Move on once this column holds its share — but not before the actions,
       and never on the very first block. */
    const mayMove = i >= built.firstMovable && filled > 0;
    if (index < count - 1 && mayMove && filled + block.height / 2 > total / count) {
      index += 1;
      y = padding;
      filled = 0;
    }
    columns[index]!.blocks.push({ placed: block, y });
    y += block.height;
    filled += block.height;
  });

  const height = Math.max(...columns.map((c) =>
    c.blocks.reduce((a, b) => a + b.placed.height, 0))) + padding * 2;
  return {
    width: padding * 2 + columnWidth * count + gutter * (count - 1),
    height: Math.round(height),
    columnWidth,
    columns,
  };
}

/** The six ability columns, as text, in printing order. */
export function abilityCells(sb: StatBlock): { label: string; value: string }[] {
  return ABILITIES.map((a) => ({
    label: ABILITY_LABEL[a],
    value: `${sb.abilities[a]} (${sign(abilityMod(sb.abilities[a]))})`,
  }));
}

/** "adult-red-dragon-2col.png" */
export const imageFilename = (sb: StatBlock, columns: 1 | 2): string =>
  `${(sb.name || 'monster').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'monster'}-${columns}col.png`;
