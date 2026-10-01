/* Reading the words off a picture of a stat block.

   The pictures this is for are screenshots — Homebrewery, D&D Beyond, a
   post — rather than photographs of a book. That matters: clean pixels at a
   known size are what OCR is good at, and the perspective, shadow and page
   curl that make photographs hard are simply not there.

   Everything here is fetched when somebody first uses it and never before.
   The recogniser and its training data together are several megabytes, which
   has no business in the first load of a calculator. */

/** How far along, nought to one. Nothing about which part it is up to. */
export type OcrProgress = (fraction: number) => void;

type Worker = {
  recognize: (image: Blob) => Promise<{ data: { text: string } }>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

let worker: Promise<Worker> | null = null;

/* Where the current picture's progress goes. Held apart from the worker
   because the logger is attached once, when the worker is built, and the
   worker outlives the picture that happened to start it — closing over the
   first caller's callback would send the second picture's progress to a
   listener nobody is watching any more. */
let listener: OcrProgress | null = null;

/* Setting up is a download and an initialisation; recognising is the work.
   The recogniser reports each phase from nought to one on its own, so a bar
   fed the raw number would fill and reset four times over. This splits one
   bar between them, and only the first picture of a session sees the first
   part move at all. */
const SETUP_SHARE = 0.3;
let furthest = 0;

/* Which column is being read, out of how many. A two-column page is two
   passes, and without this the bar would fill, drop to nothing and fill
   again — which reads as the first attempt having failed. */
let piece = 0;
let pieces = 1;

function report(status: string, p: number): void {
  const overall = status === 'recognizing text'
    ? SETUP_SHARE + ((piece + p) / pieces) * (1 - SETUP_SHARE)
    : p * SETUP_SHARE;
  /* Never backwards. Phases can arrive out of order, and a bar that retreats
     reads as something having gone wrong. */
  furthest = Math.max(furthest, Math.min(1, overall));
  listener?.(furthest);
}

/**
 * One recogniser, started once and kept.
 *
 * Starting it costs the download and a second or two of setting up, so a
 * second picture should not pay for it again.
 */
function recogniser(): Promise<Worker> {
  worker ??= import('tesseract.js')
    .then((t) => t.createWorker('eng', 1, {
      logger: (m: { status?: string; progress?: number }) => {
        if (typeof m.progress === 'number') report(m.status ?? '', m.progress);
      },
    }) as unknown as Promise<Worker>)
    .then(async (w) => {
      /* Tesseract's own answer to a dark image is to run the whole page a
         second time inverted and keep whichever read better, which doubles
         the wait on precisely the screenshots this tool sees most — the ones
         taken of a stat block on a dark background. `prepare` turns those the
         right way up before they get here, so the second pass is a second
         pass for nothing. */
      await w.setParameters({ tessedit_do_invert: '0' });
      return w;
    });
  return worker;
}

/**
 * Start fetching the recogniser before there is anything to read.
 *
 * Called when a picture looks likely — a file being dragged over the box, the
 * file picker being opened — rather than when the section opens, because it
 * is several megabytes and most visits to this section are a text paste that
 * will never want it. Safe to call as often as you like; it is the same
 * promise every time, and it swallows its own failure so that a warm-up going
 * wrong is not an error nobody asked for. Reading a picture will raise it
 * again properly if it is still broken by then.
 */
export function warmUp(): void {
  void recogniser().catch(() => { worker = null; });
}

/** The longest side we will hand the recogniser, and the shortest we want. */
const MAX_SIDE = 2000;
const MIN_SIDE = 1000;

/**
 * Where the page divides into two columns, or nothing if it does not.
 *
 * This is the whole reason a two-column stat block came back as nonsense.
 * Tesseract reads a page in lines, and on a block printed in two columns a
 * line runs clean through both: "Armor Class 16 Arcane Lance. Ranged Attack
 * Roll: +8, range 150 ft." — the armour class welded to an action. Nothing
 * downstream can unpick that, and it was wrecking every header line while
 * leaving the traits at the bottom intact, because that is the one stretch
 * where the right column has already run out.
 *
 * So the columns are separated before the recogniser ever sees them: count
 * the dark pixels in each vertical line of the picture and look for a tall
 * empty band down the middle. A gutter is the one place on a page of text
 * where nothing is written for the full height, which makes it easy to find
 * and hard to mistake for anything else.
 */
export function gutter(
  frame: { width: number; height: number; data: Uint8ClampedArray | number[] },
): { start: number; end: number } | null {
  const { width, height, data } = frame;
  const ink = new Int32Array(width);
  /* Every fourth row. A letter is many rows tall, so nothing is missed, and
     it is a quarter of the work on a picture this size. */
  for (let y = 0; y < height; y += 4) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = row + x * 4;
      if ((data[i]! + data[i + 1]! + data[i + 2]!) / 3 < 160) ink[x]! += 1;
    }
  }

  let peak = 0;
  let total = 0;
  for (const v of ink) { if (v > peak) peak = v; total += v; }
  if (!peak) return null;

  /* Not quite zero: a stray speck or a hairline rule should not disqualify a
     gap that is plainly a gutter. */
  const quiet = peak * 0.02;
  const narrowest = Math.max(4, Math.round(width * 0.012));
  let best: { start: number; end: number } | null = null;
  let run = -1;
  for (let x = 0; x <= width; x++) {
    const empty = x < width && ink[x]! <= quiet;
    if (empty && run < 0) run = x;
    if (!empty && run >= 0) {
      const middle = (run + x) / 2;
      /* Only the middle of the page. The margins are empty too, and they are
         not somewhere to cut. */
      if (x - run >= narrowest && middle > width * 0.3 && middle < width * 0.7
        && (!best || x - run > best.end - best.start)) best = { start: run, end: x };
      run = -1;
    }
  }
  if (!best) return null;

  /* Both sides have to be carrying text. Otherwise this is one column that
     happens to have a quiet strip down it, and splitting would invent a
     second column out of white space. */
  let leftInk = 0;
  for (let x = 0; x < best.start; x++) leftInk += ink[x]!;
  const share = leftInk / total;
  return share > 0.15 && share < 0.85 ? best : null;
}

/**
 * The picture, at a size worth spending time on, the right way up, and in
 * reading order.
 *
 * Recognition cost goes with the pixel count, and a screenshot from a modern
 * display is mostly pixels nobody needs: text two or three times larger than
 * the recogniser can use. Coming down to 2000 across is most of the saving
 * and costs no accuracy. Small crops go the other way — under 1000 the
 * letters are too few pixels to tell apart, and doubling them reads better
 * even though it is slower.
 *
 * A dark background is inverted here rather than left to Tesseract, which
 * would otherwise find out the expensive way. See `recogniser`.
 *
 * Returns one picture, or two when the page is in columns — left then right,
 * which is the order they are meant to be read in.
 */
async function prepare(image: Blob): Promise<Blob[]> {
  const bitmap = await createImageBitmap(image);
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > MAX_SIDE ? MAX_SIDE / longest
    : longest < MIN_SIDE ? Math.min(2, MIN_SIDE / longest)
      : 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  /* No `willReadFrequently`: that asks for a canvas backed by the processor,
     which is the right trade for many small readbacks and the wrong one here,
     where a single large picture is scaled once and read once. */
  const ctx = canvas.getContext('2d');
  if (!ctx) return [image];
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = frame.data;
  /* Mean brightness off a sample rather than every pixel. Every fiftieth is
     tens of thousands of readings on any picture worth reading, which settles
     light against dark long before the answer could change. */
  let sum = 0;
  let seen = 0;
  for (let i = 0; i < px.length; i += 4 * 50) {
    sum += (px[i]! + px[i + 1]! + px[i + 2]!) / 3;
    seen++;
  }
  if (seen > 0 && sum / seen < 110) {
    for (let i = 0; i < px.length; i += 4) {
      px[i] = 255 - px[i]!;
      px[i + 1] = 255 - px[i + 1]!;
      px[i + 2] = 255 - px[i + 2]!;
    }
    ctx.putImageData(frame, 0, 0);
  }

  const split = gutter(frame);
  const cuts = split
    ? [[0, split.start], [split.end, canvas.width]] as const
    : [[0, canvas.width]] as const;

  return Promise.all(cuts.map(([from, to]) => {
    if (from === 0 && to === canvas.width) return toBlob(canvas, image);
    const part = document.createElement('canvas');
    part.width = to - from;
    part.height = canvas.height;
    const pctx = part.getContext('2d');
    if (!pctx) return toBlob(canvas, image);
    pctx.drawImage(canvas, from, 0, part.width, part.height, 0, 0, part.width, part.height);
    return toBlob(part, image);
  }));
}

function toBlob(canvas: HTMLCanvasElement, fallback: Blob): Promise<Blob> {
  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? fallback), 'image/png');
  });
}

/**
 * Whatever text is in the picture.
 *
 * Two columns are left to the recogniser's own page analysis. It is right
 * often enough on a screenshot, and when it is wrong the reader downstream
 * still finds the header lines — which is where the numbers that matter are.
 */
export async function readImage(image: Blob, onProgress: OcrProgress): Promise<string> {
  listener = onProgress;
  furthest = 0;
  onProgress(0);
  try {
    /* Preparing the picture is an optimisation, not a requirement. A format
       the canvas will not decode should cost the saving, not the reading. */
    const [engine, parts] = await Promise.all([
      recogniser(),
      prepare(image).catch(() => [image]),
    ]);
    const out: string[] = [];
    pieces = parts.length;
    for (const [i, part] of parts.entries()) {
      piece = i;
      const { data } = await engine.recognize(part);
      out.push(data.text.trim());
    }
    /* A blank line between the columns, which is what tells the reader
       downstream that the right column starts a new thing rather than
       continuing the last sentence of the left one. */
    return out.filter(Boolean).join('\n\n');
  } finally {
    listener = null;
    piece = 0;
    pieces = 1;
  }
}

/** Let it go, and the memory with it. */
export async function stopReading(): Promise<void> {
  const running = worker;
  worker = null;
  if (running) await (await running).terminate();
}

/** The first image on a clipboard or in a drop, if there is one. */
export function imageFrom(source: DataTransfer | null | undefined): File | null {
  for (const file of source?.files ?? []) {
    if (file.type.startsWith('image/')) return file;
  }
  return null;
}
