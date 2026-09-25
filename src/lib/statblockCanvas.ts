/* Putting the laid-out block onto a canvas.

   Everything decided — what goes where, and how wide — happens in
   statblockImage.ts. All that is left here is ink. */

import { abilityCells, layoutStatBlock, smallCapRuns } from './statblockImage.ts';
import type {
  FontSpec, ImageOptions, Layout, Measure, Palette, Span,
} from './statblockImage.ts';
import type { Derived, StatBlock } from './statblock.ts';

const cssFont = (font: FontSpec, palette: Palette): string => [
  font.italic ? 'italic' : '',
  String(font.weight),
  `${font.size}px`,
  font.family === 'sans' ? palette.sans : palette.serif,
].filter(Boolean).join(' ');

/** Canvas measures text the same way it draws it, which is the whole point. */
export const canvasMeasure = (ctx: CanvasRenderingContext2D, palette: Palette): Measure =>
  (text, font) => {
    ctx.font = cssFont(font, palette);
    return ctx.measureText(text).width;
  };

/** Where the letters sit relative to the top of their line. */
const ASCENT = 0.78;

function drawLine(
  ctx: CanvasRenderingContext2D, palette: Palette, line: Span[], x: number, baseline: number,
): void {
  let cursor = x;
  for (const span of line) {
    ctx.fillStyle = span.accent ? palette.accent : palette.text;
    for (const run of smallCapRuns(span.text, span.font)) {
      ctx.font = cssFont(run.font, palette);
      ctx.fillText(run.text, cursor, baseline);
      cursor += ctx.measureText(run.text).width;
    }
  }
}

function drawAbilities(
  ctx: CanvasRenderingContext2D, palette: Palette, sb: StatBlock,
  x: number, top: number, width: number, base: number,
): void {
  const cells = abilityCells(sb);
  const cell = width / cells.length;
  ctx.textAlign = 'center';
  cells.forEach((c, i) => {
    const centre = x + cell * i + cell / 2;
    ctx.fillStyle = palette.accent;
    ctx.font = cssFont({ size: Math.round(base * 0.8), weight: 700, family: 'sans' }, palette);
    ctx.fillText(c.label, centre, top + base * 0.95);
    ctx.fillStyle = palette.text;
    ctx.font = cssFont({ size: Math.round(base * 0.95), weight: 400, family: 'serif' }, palette);
    ctx.fillText(c.value, centre, top + base * 2.15);
  });
  ctx.textAlign = 'left';
}

export interface RenderResult { layout: Layout; }

/**
 * Draw a stat block at whatever pixel density the screen asks for.
 *
 * The layout is measured once against this very context, so the wrapping is
 * the wrapping the fonts actually produce rather than an estimate of them.
 */
export function drawStatBlock(
  canvas: HTMLCanvasElement,
  sb: StatBlock,
  d: Derived,
  options: ImageOptions,
  palette: Palette,
  scale = 2,
): RenderResult {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser gave no 2d canvas context');

  const base = options.base ?? 16;
  const layout = layoutStatBlock(sb, d, options, canvasMeasure(ctx, palette));

  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.textBaseline = 'alphabetic';

  for (const column of layout.columns) {
    for (const { placed, y } of column.blocks) {
      const { block } = placed;
      const top = y + block.gapAbove;
      if (block.kind === 'spans') {
        placed.lines.forEach((line, i) => {
          const size = line[0]?.font.size ?? base;
          drawLine(ctx, palette, line, column.x, top + block.leading * i + size * ASCENT);
        });
      } else if (block.kind === 'abilities') {
        drawAbilities(ctx, palette, sb, column.x, top, layout.columnWidth, base);
      } else if (block.kind === 'underline') {
        ctx.fillStyle = palette.accent;
        ctx.fillRect(column.x, top, layout.columnWidth, 1);
      } else {
        /* The tapered bar a printed block puts under its heading. */
        const gradient = ctx.createLinearGradient(column.x, 0, column.x + layout.columnWidth, 0);
        gradient.addColorStop(0, palette.rule);
        gradient.addColorStop(block.fade ? 0.55 : 1, palette.rule);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = block.fade ? gradient : palette.rule;
        ctx.fillRect(column.x, top, layout.columnWidth, 3);
      }
    }
  }
  return { layout };
}

/** The colours the page is using, so the picture matches what is on screen. */
export function paletteFromPage(element: Element): Palette {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string): string =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    background: read('--panel', '#ffffff'),
    text: read('--text', '#111111'),
    accent: read('--result', '#8a2a2a'),
    rule: read('--result', '#8a2a2a'),
    serif: read('--serif', 'Georgia, serif'),
    sans: read('--sans', 'Arial, sans-serif'),
  };
}
