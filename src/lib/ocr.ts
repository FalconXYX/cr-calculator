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

function report(status: string, p: number): void {
  const overall = status === 'recognizing text'
    ? SETUP_SHARE + p * (1 - SETUP_SHARE)
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
 * The picture, at a size worth spending time on and the right way up.
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
 */
async function prepare(image: Blob): Promise<Blob> {
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
  if (!ctx) return image;
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

  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? image), 'image/png');
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
    const [engine, ready] = await Promise.all([
      recogniser(),
      prepare(image).catch(() => image),
    ]);
    const { data } = await engine.recognize(ready);
    return data.text;
  } finally {
    listener = null;
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
