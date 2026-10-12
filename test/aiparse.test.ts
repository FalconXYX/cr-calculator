/* The AI reader. Run with `npm test`.

   The model itself cannot be called from here — it lives behind a Cloudflare
   account — so its answers are written out by hand, the way a model answers:
   spacing tidied, dashes straightened, a field or two left empty. What is
   tested is everything either side of it. The page: laying the answer out,
   cutting each body from the real text, filling gaps from the built-in
   reader, and falling back whenever anything goes wrong. The Worker: who may
   call it, what it sends the model, and how a spent allowance comes back. */

import { readFileSync } from 'node:fs';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

const { combine, layOut, readWithAi, reviveExtraction, spentToday } = await import('../src/lib/aiParse.ts');
const { parseStatBlock } = await import('../src/lib/parseStatBlock.ts');
const { classify, handle } = await import('../worker/src/index.ts');
const { AI_MAX_INPUT, AI_PROMPT } = await import('../src/lib/aiSchema.ts');

let pass = 0;
let fail = 0;
function is(label: string, got: unknown, want: unknown): void {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}  ->  got ${got}${ok ? '' : `, want ${want}`}`);
}

/* What tesseract actually returned for the Frostfallen card: borders read as
   "|" and "Eee", the defences on one line, entry names in bold with no stop. */
const OCR = readFileSync(new URL('./fixtures/frostfallen-ocr.txt', import.meta.url), 'utf8');

/* What Llama 3.3 70B on Workers AI actually answered for it, closing quotes
   aside. Note what a model does that the text does not: the name in capitals,
   "MWA" kept as part of the attack's name, the size and type line left out
   altogether, and openings that start partway into an attack line. */
const ANSWER = {
  name: 'FROSTFALLEN',
  armorClass: '18 (frozen hide)',
  hitPoints: '225 (18d10+126)',
  speed: '40ft., climb 20ft.',
  str: 22, dex: 14, con: 24, int: 5, wis: 14, cha: 8,
  damageVulnerabilities: 'Fire, Radiant',
  damageImmunities: 'cold, poison',
  conditionImmunities: 'charmed, exhaustion, poisoned',
  senses: 'darkvision 120ft., blindsight 10ft. passive Perception 12',
  languages: 'That which it knew in life.',
  challenge: '15',
  proficiencyBonus: '',
  legendaryActionsPerRound: 0,
  entries: [
    { section: 'trait', name: 'Aura of Bitter Cold', opening: 'The Frostfallen radiates a supernatural' },
    { section: 'trait', name: 'Deathly Grip', opening: 'The Frostfallen can grapple and move' },
    { section: 'trait', name: 'Frozen Flesh', opening: 'The Frostfallen ignores difficult terrain' },
    { section: 'action', name: 'Multiattack', opening: 'The Frostfallen makes two Claw attacks' },
    { section: 'action', name: 'Claw MWA', opening: '+10, 10 ft. Hit: 15 (2d8 + 6) slashing' },
    { section: 'action', name: 'Bite MWA', opening: '+10, 5 ft. Hit: 17 (2d10 + 6) piercing' },
    { section: 'action', name: 'Freezing Embrace (Recharge 5-6)', opening: 'The Frostfallen tightens its grip around' },
    { section: 'reaction', name: 'Desperate Clutch', opening: 'Trigger: A creature the Frostfallen can' },
  ],
};

console.log('--- reading the answer ---');
const x = reviveExtraction(ANSWER)!;
is('a well-formed answer is accepted', x !== null, true);
is('- with every entry', x.entries.length, 8);
is('an answer that is not an object is refused', reviveExtraction('nope'), null);
is('- and so is a list', reviveExtraction([]), null);
const junk = reviveExtraction({ name: 7, str: 'twenty', entries: [{ section: 'spell', name: 'X' }, { section: 'trait' }, 4] })!;
is('a field of the wrong type reads as empty', junk.name, '');
is('- a score that is not a number reads as zero', junk.str, 0);
is('- and an entry with no name or an unknown section is dropped', junk.entries.length, 0);

console.log('\n--- laying it out against the real text ---');
const layout = layOut(x, OCR);
is('every entry is found in the text', `${layout.located}/${layout.expected}`, '8/8');
const ai = parseStatBlock(layout.text);
const raw = parseStatBlock(OCR);
const both = combine(ai, raw, layout);
const read = both.block;
is('name', read.name, 'Frostfallen');
is('armour class and its note', `${read.acValue} (${read.acNote})`, '18 (frozen hide)');
is('hit points', read.hpValue, 225);
is('both speeds', `${read.speeds.walk}/${read.speeds.climb}`, '40/20');
is('ability scores', [read.abilities.str, read.abilities.con, read.abilities.cha].join(' '), '22 24 8');
is('the rating sets the proficiency bonus', read.proficiencyBonus, 5);
is('traits', read.entries.trait.map((e) => e.name).join(', '), 'Aura of Bitter Cold, Deathly Grip, Frozen Flesh');
is('actions', read.entries.action.map((e) => e.name).join(', '),
  'Multiattack, Claw, Bite, Freezing Embrace (Recharge 5-6), Desperate Clutch');
is('the reaction is filed as one',
  read.entries.action.find((e) => e.name === 'Desperate Clutch')?.kind, 'reaction');
const claw = read.entries.action.find((e) => e.name === 'Claw')?.text ?? '';
is('"Claw MWA" is an attack called Claw', Boolean(claw), true);
is('the dice are the printed dice, cut from the text and not retyped', /15 \(2d8 \+ 6\)/.test(claw), true);
is('- the body runs to the end of the attack', claw.endsWith('(Escape 18).'), true);
is('- and not on into the next entry', /Bite/.test(claw), false);
const aura = read.entries.trait[0]?.text ?? '';
is('a body runs across the blank line recognition put mid-sentence', aura.endsWith('22 (4d10) cold damage.'), true);
/* Each of these was lost to the model's closing quotes on the first live
   read, which cut a body at words that appear before its real end. */
const bite = read.entries.action.find((e) => e.name === 'Bite')?.text ?? '';
is('a body that says "cold damage" twice keeps its second, and its dice',
  /additional 11 \(2d10\) cold damage\.$/.test(bite), true);
is('- and the Multiattack\u2019s mention of the Bite is not mistaken for the Bite', /^MWA: \+10, 5 ft\./.test(bite), true);
is('"Claw MWA" keeps MWA at the front of its body, where it says melee', /^MWA: \+10, 10 ft\./.test(claw), true);
is('a save keeps its half-damage clause',
  /Success: Takes half damage and is not restrained\.$/.test(read.entries.action.find((e) => /Freezing/.test(e.name))?.text ?? ''), true);
is('the reaction heading is not part of the action above it',
  /REACTIONS/i.test(read.entries.action.find((e) => /Freezing/.test(e.name))?.text ?? ''), false);
is('the card\u2019s frame, read as "Eee", is not part of a trait',
  read.entries.trait[2]?.text.endsWith('ice or snow.'), true);
is('a size and type the model left out comes from the rules', `${read.size} ${read.type}`, 'Large Undead');
is('nothing is reported missing', both.report.missing.join(', '), '');

console.log('\n--- what is past the last entry stays out ---');
{
  const text = [
    'Candela', 'Medium Undead, Lawful Evil', 'AC 17', 'HP 168 (16d8 + 96)', 'Speed 30 ft.',
    'STR 18 DEX 14 CON 22 INT 12 WIS 16 CHA 18', 'CR 11',
    'Candle of pain. While burning, creatures that hit it with melee attacks take 5 fire damage.',
    'Description',
    'The Candela is a towering undead formed from blackened wax and burial cloth.',
  ].join('\n');
  const answer = reviveExtraction({
    ...ANSWER, name: 'Candela', entries: [
      { section: 'trait', name: 'Candle of pain', opening: 'While burning, creatures that hit' },
    ],
  })!;
  const lay = layOut(answer, text);
  const body = parseStatBlock(lay.text).block.entries.trait[0]?.text ?? '';
  is('the last body stops at a heading underneath it', body.endsWith('take 5 fire damage.'), true);
  is('- so a description is not swallowed into it', /towering/.test(body), false);
}

console.log('\n--- a bracket the model left off the name ---');
{
  /* Live, on an Adult Red Dragon, the model answered "Fire Breath" for
     "Fire Breath (Recharge 5\u20136)" despite being told to keep the bracket. The
     recharge is what keeps a breath weapon out of every round's damage. */
  const text = [
    'Dragon', 'Huge Dragon, Chaotic Evil', 'AC 19', 'HP 256 (19d12 + 133)', 'Speed 40 ft.',
    'STR 27 DEX 10 CON 25 INT 16 WIS 13 CHA 23', 'Challenge 17',
    'Legendary Resistance (3/Day, or 4/Day in Lair). If the dragon fails a saving throw, it can succeed instead.',
    'ACTIONS',
    'Rend. Melee Attack Roll: +14, reach 10 ft. Hit: 13 (1d10 + 8) Slashing damage.',
    'Fire Breath (Recharge 5\u20136). Dexterity Saving Throw: DC 21, each creature in a 60-foot Cone. Failure: 59 (17d6) Fire damage.',
  ].join('\n');
  const answer = reviveExtraction({
    ...ANSWER, name: 'Dragon', entries: [
      { section: 'trait', name: 'Legendary Resistance', opening: 'If the dragon fails a' },
      { section: 'action', name: 'Rend', opening: 'Melee Attack Roll: +14, reach' },
      { section: 'action', name: 'Fire Breath', opening: 'Dexterity Saving Throw: DC 21,' },
    ],
  })!;
  const lay = layOut(answer, text);
  const b = parseStatBlock(lay.text).block;
  is('the printed bracket goes back on the name',
    b.entries.action[1]?.name, 'Fire Breath (Recharge 5\u20136)');
  is('- on a trait\u2019s too', b.entries.trait[0]?.name, 'Legendary Resistance (3/Day, or 4/Day in Lair)');
  is('- and the entry above does not end with it', b.entries.action[0]?.text.endsWith('Slashing damage.'), true);
}

console.log('\n--- an entry the text does not hold ---');
{
  const answer = reviveExtraction({
    ...ANSWER,
    entries: [
      ...ANSWER.entries.slice(0, 3),
      { section: 'action', name: 'Ice Spear', opening: 'Ranged Weapon Attack: +9 to hit' },
    ],
  })!;
  const lay = layOut(answer, OCR);
  is('a made-up entry is not given made-up words', `${lay.located}/${lay.expected}`, '3/4');
  is('- it is simply not there', /Ice Spear/.test(lay.text), false);
}

console.log('\n--- filling the model’s gaps from the built-in reader ---');
{
  const gappy = reviveExtraction({ ...ANSWER, armorClass: '', str: 0, damageVulnerabilities: '' })!;
  const lay = layOut(gappy, OCR);
  const both = combine(parseStatBlock(lay.text), raw, lay);
  is('armour class the model skipped comes from the rules', both.block.acValue, 18);
  is('- and the report says where it came from', both.report.took.some((l) => /Armor Class, by the built-in/.test(l)), true);
  is('- and does not still call it missing', both.report.missing.includes('Armor Class'), false);
  is('scores the model half-read are not used, and the rules’ are', both.block.abilities.str, 22);
  is('a list the model skipped is filled', both.block.vulnerabilities.join(','), 'Fire,Radiant');
}
{
  /* The model lists eight entries and the text only gives up two of them;
     the built-in reader found all eight, so its are kept. */
  const half = reviveExtraction({
    ...ANSWER,
    entries: ANSWER.entries.map((e, i) => (i < 2 ? e : { ...e, opening: 'nothing like this anywhere' })),
  })!;
  const lay = layOut(half, OCR);
  const both = combine(parseStatBlock(lay.text), raw, lay);
  is('entries the text could not be held to fall back to the rules’ own',
    both.block.entries.action.length, raw.block.entries.action.length);
}

console.log('\n--- asking, and falling back ---');
type Call = { url: string; body: { text: string } };
const calls: Call[] = [];
const answering = (status: number, body: unknown): typeof fetch => (async (url: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
  return new Response(JSON.stringify(body), { status });
}) as typeof fetch;

const DAY = Date.UTC(2026, 9, 11, 12);
store.clear();
is('no Worker means no request', (await readWithAi(OCR, raw, { url: '', fetch: answering(200, {}) })).via, 'off');
is('- and nothing was sent', calls.length, 0);

const ok = await readWithAi(OCR, raw, { url: 'https://reader.test', fetch: answering(200, { extraction: ANSWER }), now: DAY });
is('an answer is read', ok.via, 'ai');
is('- into the same block the layout gave', ok.via === 'ai' ? ok.result.block.entries.action.length : 0, 5);
is('the text is sent tidied', calls.at(-1)?.body.text.includes('|'), false);

store.clear();
calls.length = 0;
is('a spent allowance falls back', (await readWithAi(OCR, raw, { url: 'https://reader.test', fetch: answering(429, { error: 'quota' }), now: DAY })).via, 'spent');
is('- and is remembered for the rest of the day', spentToday(DAY + 60_000), true);
is('- so the next block does not ask', (await readWithAi(OCR, raw, { url: 'https://reader.test', fetch: answering(200, { extraction: ANSWER }), now: DAY + 60_000 })).via, 'spent');
is('- and nothing more was sent', calls.length, 1);
is('the next UTC day it asks again', spentToday(DAY + 24 * 3_600_000), false);

store.clear();
is('a busy service falls back', (await readWithAi(OCR, raw, { url: 'https://reader.test', fetch: answering(503, { error: 'busy' }), now: DAY })).via, 'failed');
is('- and is not remembered: the next block tries again', spentToday(DAY), false);
is('an answer that is not a stat block falls back',
  (await readWithAi(OCR, raw, { url: 'https://reader.test', fetch: answering(200, { extraction: 'hello' }) })).via, 'failed');
is('a network failure falls back',
  (await readWithAi(OCR, raw, { url: 'https://reader.test', fetch: (async () => { throw new TypeError('offline'); }) as typeof fetch })).via, 'failed');

const hanging = ((_: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
  init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
})) as typeof fetch;
const began = Date.now();
is('a model that never answers is given up on', (await readWithAi(OCR, raw, { url: 'https://reader.test', fetch: hanging, timeoutMs: 50 })).via, 'failed');
is('- promptly', Date.now() - began < 1_000, true);
const cancel = new AbortController();
const pending = readWithAi(OCR, raw, { url: 'https://reader.test', fetch: hanging, signal: cancel.signal, timeoutMs: 60_000 });
cancel.abort();
is('a request the page no longer wants is dropped', (await pending).via, 'failed');

console.log('\n--- the Worker ---');
const SITE = 'https://parthjain.ca';
let sent: Record<string, unknown> | null = null;
const envWith = (run: (model: string, input: Record<string, unknown>) => Promise<unknown>) => ({
  AI: { run: async (model: string, input: Record<string, unknown>) => { sent = { model, ...input }; return run(model, input); } },
  ALLOWED_ORIGINS: `${SITE}, http://localhost:5173`,
  MODEL: '@cf/test/model',
});
const post = (body: unknown, origin = SITE) => new Request('https://reader.test/', {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const answers = envWith(async () => ({ response: ANSWER }));

is('a page from elsewhere is refused', (await handle(post({ text: 'x' }, 'https://evil.test'), answers)).status, 403);
is('- and so is a request with no origin at all',
  (await handle(new Request('https://reader.test/', { method: 'POST', body: '{}' }), answers)).status, 403);
const preflight = await handle(new Request('https://reader.test/', { method: 'OPTIONS', headers: { Origin: SITE } }), answers);
is('the browser’s preflight is answered', preflight.status, 204);
is('- naming the page it allows', preflight.headers.get('Access-Control-Allow-Origin'), SITE);
is('only POST is taken',
  (await handle(new Request('https://reader.test/', { method: 'GET', headers: { Origin: SITE } }), answers)).status, 405);
is('nothing to read is refused', (await handle(post({ text: '   ' }), answers)).status, 400);
is('- as is something that is not JSON', (await handle(post('not json'), answers)).status, 400);
is('a block past the limit is refused before it costs anything',
  (await handle(post({ text: 'x'.repeat(AI_MAX_INPUT + 1) }), answers)).status, 413);

sent = null;
const good = await handle(post({ text: OCR }), answers);
is('a block is read', good.status, 200);
is('- and the annotation comes back untouched', ((await good.json()) as { extraction: { name: string } }).extraction.name, 'FROSTFALLEN');
is('- the answer carries the page’s origin', good.headers.get('Access-Control-Allow-Origin'), SITE);
const asked = sent as unknown as Record<string, unknown>;
is('the configured model is asked', asked.model, '@cf/test/model');
is('- for JSON held to the schema', (asked.response_format as { type: string }).type, 'json_schema');
is('- with room for a long block, not the 256-token default', asked.max_tokens, 2000);
is('- copying rather than composing', asked.temperature, 0);
is('- under the Worker’s own instructions, not the caller’s',
  (asked.messages as { role: string; content: string }[])[0]?.content, AI_PROMPT);

const stringy = await handle(post({ text: OCR }), envWith(async () => ({ response: JSON.stringify(ANSWER) })));
is('an answer returned as a string is unpacked', ((await stringy.json()) as { extraction: { name: string } }).extraction.name, 'FROSTFALLEN');

const failing = (message: string) => envWith(async () => { throw new Error(message); });
const quiet = console.error;
console.error = () => {};
is('a spent allowance is a 429',
  (await handle(post({ text: OCR }), failing('3036: You have used up your daily free allocation of 10,000 neurons'))).status, 429);
is('a full service is a 503',
  (await handle(post({ text: OCR }), failing('3040: Capacity temporarily exceeded, please try again'))).status, 503);
is('anything else is a 502', (await handle(post({ text: OCR }), failing('JSON Mode couldn’t be met'))).status, 502);
console.error = quiet;
is('the quota error is told apart by its code', classify(new Error('AiError: 3036: ...')), 'quota');
is('- or by its words', classify('You have used up your daily free allocation'), 'quota');
is('a capacity error is not mistaken for the quota', classify(new Error('3040: Capacity temporarily exceeded')), 'busy');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
