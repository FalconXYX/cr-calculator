/* Builds the Monster Manual catalogue that the Monster Maker starts from.
   Run it by hand when the upstream data moves:

       node tools/build-bestiary.mjs

   It reads 5etools' bestiary for the 2025 Monster Manual and writes two
   generated modules under src/data. Nothing in the app fetches at runtime —
   the site is static, and a catalogue that only works while someone else's
   server is up is not a catalogue. */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createCipheriv, createHash, pbkdf2Sync } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detag } from './detag.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/bestiary/bestiary-xmm.json';
const CACHE = join(ROOT, 'tools', '.cache', 'bestiary-xmm.json');

/* Rounds of PBKDF2 between the password and the key. High enough that
   guessing costs about half a second a try in a browser, which is the whole
   defence a short password can offer. */
const ITERATIONS = 310000;

/* ---------------- Vocabulary, matched to src/lib/statblock.ts ---------------- */

/** Hit die back to size. The formula names the die the book actually used,
    which settles the creatures printed as "Small or Medium". */
const SIZE_BY_DIE = { 4: 'Tiny', 6: 'Small', 8: 'Medium', 10: 'Large', 12: 'Huge', 20: 'Gargantuan' };
const SIZE_BY_CODE = { T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large', H: 'Huge', G: 'Gargantuan' };

const ALIGNMENT = {
  U: 'Unaligned', N: 'True Neutral',
  'L,G': 'Lawful Good', 'N,G': 'Neutral Good', 'C,G': 'Chaotic Good',
  'L,N': 'Lawful Neutral', 'C,N': 'Chaotic Neutral',
  'L,E': 'Lawful Evil', 'N,E': 'Neutral Evil', 'C,E': 'Chaotic Evil',
};

const TYPES = [
  'Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey',
  'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead',
];

/** 5etools keys its skills in lower case with spaces; the app uses camelCase. */
const SKILL_ID = {
  acrobatics: 'acrobatics', 'animal handling': 'animalHandling', arcana: 'arcana',
  athletics: 'athletics', deception: 'deception', history: 'history',
  insight: 'insight', intimidation: 'intimidation', investigation: 'investigation',
  medicine: 'medicine', nature: 'nature', perception: 'perception',
  performance: 'performance', persuasion: 'persuasion', religion: 'religion',
  'sleight of hand': 'sleightOfHand', stealth: 'stealth', survival: 'survival',
};

const SKILL_ABILITY = {
  acrobatics: 'dex', animalHandling: 'wis', arcana: 'int', athletics: 'str',
  deception: 'cha', history: 'int', insight: 'wis', intimidation: 'cha',
  investigation: 'int', medicine: 'wis', nature: 'int', perception: 'wis',
  performance: 'cha', persuasion: 'cha', religion: 'int', sleightOfHand: 'dex',
  stealth: 'dex', survival: 'wis',
};

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** Challenge rating to proficiency bonus, from the Monster Statistics table. */
function profBonus(cr) {
  const v = crValue(cr);
  return Math.max(2, Math.min(9, 2 + Math.floor(Math.max(0, v - 1) / 4)));
}

function crValue(cr) {
  if (cr === '1/8') return 0.125;
  if (cr === '1/4') return 0.25;
  if (cr === '1/2') return 0.5;
  const n = Number(cr);
  return Number.isFinite(n) ? n : 0;
}

const abilityMod = (score) => Math.floor((score - 10) / 2);

/** The first signed number, so "+4 (+6 while in snake form)" reads as 4. */
const printedBonus = (raw) => Number(/[+-]?\d+/.exec(String(raw))?.[0] ?? 0);
const titleCase = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/* ---------------- Entry rendering ---------------- */

/** One 5etools entry tree, flattened to the paragraphs a stat block prints. */
function renderEntries(entries) {
  const out = [];
  const walk = (node) => {
    if (typeof node === 'string') { out.push(detag(node)); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if (node.type === 'list') { (node.items ?? []).forEach(walk); return; }
    const body = renderEntries(node.entries ?? (node.entry ? [node.entry] : []));
    out.push(node.name ? `${detag(node.name)}. ${body}`.trim() : body);
  };
  walk(entries);
  return out.filter(Boolean).join('\n\n');
}

/** Spellcasting is a block of its own upstream; the book prints it as prose. */
function renderSpellcasting(sc) {
  const parts = [renderEntries(sc.headerEntries ?? [])];
  /* `hidden` marks a group the header already names in full — a reaction
     that just says "casts Feather Fall" should not then list Feather Fall. */
  const suppressed = new Set(sc.hidden ?? []);
  const list = (label, spells) => {
    const names = (spells ?? []).map((s) => detag(s)).filter(Boolean);
    if (names.length) parts.push(`${label} ${names.join(', ')}`);
  };
  const group = (key, label) => {
    if (suppressed.has(key)) return;
    for (const [n, spells] of Object.entries(sc[key] ?? {})) list(label(n), spells);
  };
  if (!suppressed.has('will')) list('At Will:', sc.will);
  /* "3e" is 5etools for three uses of each spell rather than three between
     them, which the book writes as "3/Day Each". */
  group('daily', (n) => `${n.replace('e', '')}/Day${n.endsWith('e') ? ' Each' : ''}:`);
  group('recharge', (n) => `${n}/Recharge:`);
  group('restLong', (n) => `${n}/Long Rest:`);
  group('rest', (n) => `${n}/Short Rest:`);
  group('legendary', (n) => `${n}/Legendary Action:`);
  return parts.filter(Boolean).join('\n\n');
}

/** Name plus body, with the ids kept short and stable across rebuilds. */
function entriesFrom(blocks, prefix, kind) {
  return (blocks ?? []).map((b, i) => ({
    id: `${prefix}${i}`,
    name: detag(b.name ?? ''),
    text: renderEntries(b.entries ?? []),
    /* kindOf() already reads an untagged entry as a plain action. */
    ...(kind && kind !== 'action' ? { kind } : {}),
  }));
}

/* ---------------- Field conversion ---------------- */

function sizeOf(m) {
  const die = Number(/d(\d+)/.exec(m.hp?.formula ?? '')?.[1]);
  return SIZE_BY_DIE[die] ?? SIZE_BY_CODE[m.size?.[m.size.length - 1]] ?? 'Medium';
}

function typeOf(m) {
  const raw = typeof m.type === 'string' ? m.type : m.type?.type;
  const name = titleCase(String(raw ?? 'Humanoid'));
  return TYPES.includes(name) ? name : 'Humanoid';
}

function alignmentOf(m) {
  const key = (m.alignment ?? []).filter((a) => typeof a === 'string').join(',');
  return ALIGNMENT[key] ?? 'Unaligned';
}

function speedsOf(m) {
  const s = m.speed ?? {};
  const n = (v) => (typeof v === 'number' ? v : typeof v?.number === 'number' ? v.number : 0);
  return {
    walk: n(s.walk), burrow: n(s.burrow), climb: n(s.climb),
    fly: n(s.fly), swim: n(s.swim), hover: Boolean(s.canHover),
  };
}

function sensesOf(m) {
  const out = { darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0, blindBeyond: false };
  for (const raw of m.senses ?? []) {
    if (typeof raw !== 'string') continue;
    const text = detag(raw);
    const feet = Number(/(\d+)\s*ft/i.exec(text)?.[1] ?? 0);
    const key = /blindsight/i.test(text) ? 'blindsight'
      : /darkvision/i.test(text) ? 'darkvision'
        : /tremorsense/i.test(text) ? 'tremorsense'
          : /truesight/i.test(text) ? 'truesight' : null;
    if (!key) continue;
    out[key] = feet;
    if (key === 'blindsight' && /blind beyond/i.test(text)) out.blindBeyond = true;
  }
  return out;
}

function languagesOf(m) {
  const langs = [];
  let telepathy = 0;
  for (const raw of m.languages ?? []) {
    if (typeof raw !== 'string') continue;
    for (const piece of detag(raw).split(';')) {
      const text = piece.trim();
      if (!text) continue;
      const tele = /telepathy\s+(\d+)/i.exec(text);
      if (tele) { telepathy = Math.max(telepathy, Number(tele[1])); continue; }
      langs.push(text);
    }
  }
  return { languages: langs, telepathy };
}

/** Damage and condition lists, capitalised to match the app's vocabulary. */
function wordsOf(list) {
  return (list ?? []).filter((x) => typeof x === 'string').map(titleCase);
}

/**
 * Work out whether each skill is proficient or expert.
 *
 * The book prints the finished bonus, and the app stores the tier it came
 * from, so the two candidates get rebuilt and compared. A skill matching
 * neither keeps whichever is closer, and the caller is told about it.
 */
function skillsOf(m, mods, pb, report) {
  const out = {};
  for (const [key, raw] of Object.entries(m.skill ?? {})) {
    const id = SKILL_ID[key];
    if (!id) continue;
    const printed = printedBonus(raw);
    const mod = mods[SKILL_ABILITY[id]];
    const proficient = mod + pb;
    const expert = mod + pb * 2;
    if (printed === expert) out[id] = 'expertise';
    else if (printed === proficient) out[id] = 'proficient';
    else {
      out[id] = Math.abs(printed - expert) < Math.abs(printed - proficient) ? 'expertise' : 'proficient';
      report.push(`${m.name}: ${id} prints ${printed}, nearest tier gives ${out[id] === 'expertise' ? expert : proficient}`);
    }
  }
  return out;
}

function savesOf(m, mods, pb, report) {
  const out = [];
  for (const [key, raw] of Object.entries(m.save ?? {})) {
    if (!ABILITIES.includes(key)) continue;
    out.push(key);
    const printed = printedBonus(raw);
    if (printed !== mods[key] + pb) {
      report.push(`${m.name}: ${key} save prints ${printed}, proficiency gives ${mods[key] + pb}`);
    }
  }
  return out.sort((a, b) => ABILITIES.indexOf(a) - ABILITIES.indexOf(b));
}

/* ---------------- The whole creature ---------------- */

function convert(m, report) {
  const cr = typeof m.cr === 'string' ? m.cr : (m.cr?.cr ?? '0');
  const pb = profBonus(cr);
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(m[a] ?? 10)]));

  /* Spellcasting is filed under whichever section the book prints it in. */
  const spellBySection = { action: [], bonus: [], reaction: [], legendary: [], trait: [] };
  for (const sc of m.spellcasting ?? []) {
    const where = sc.displayAs ?? 'trait';
    (spellBySection[where] ?? spellBySection.trait).push({
      name: detag(sc.name ?? 'Spellcasting'),
      text: renderSpellcasting(sc),
    });
  }
  const spells = (where, prefix, kind) => (spellBySection[where] ?? []).map((s, i) => ({
    id: `${prefix}s${i}`, ...s, ...(kind && kind !== 'action' ? { kind } : {}),
  }));

  const block = {
    name: detag(m.name),
    size: sizeOf(m),
    type: typeOf(m),
    alignment: alignmentOf(m),
    acValue: Number(m.ac?.[0]?.ac ?? m.ac?.[0] ?? 10),
    acNote: '',
    hpValue: Number(m.hp?.average ?? 1),
    showHitDice: true,
    /* Upstream stores the multiple of the proficiency bonus, which is exactly
       the app's three tiers. */
    initiative: m.initiative?.proficiency === 2 ? 'expertise'
      : m.initiative?.proficiency === 1 ? 'proficient' : 'none',
    proficiencyBonus: pb,
    speeds: speedsOf(m),
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, Number(m[a] ?? 10)])),
    saves: savesOf(m, mods, pb, report),
    skills: skillsOf(m, mods, pb, report),
    vulnerabilities: wordsOf(m.vulnerable),
    resistances: wordsOf(m.resist),
    damageImmunities: wordsOf(m.immune),
    conditionImmunities: wordsOf(m.conditionImmune),
    senses: sensesOf(m),
    ...languagesOf(m),
    entries: {
      trait: [...entriesFrom(m.trait, 't'), ...spells('trait', 't')],
      action: [
        ...entriesFrom(m.action, 'a', 'action'), ...spells('action', 'a', 'action'),
        ...entriesFrom(m.bonus, 'b', 'bonus'), ...spells('bonus', 'b', 'bonus'),
        ...entriesFrom(m.reaction, 'r', 'reaction'), ...spells('reaction', 'r', 'reaction'),
      ],
      legendary: [...entriesFrom(m.legendary, 'l'), ...spells('legendary', 'l')],
      lair: [],
    },
    legendaryCount: Number(m.legendaryActions ?? 3),
  };

  return {
    id: slug(m.name),
    name: block.name,
    cr,
    crValue: crValue(cr),
    page: Number(m.page ?? 0),
    srd: Boolean(m.srd52),
    block,
  };
}

const slug = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------------- Emitting ---------------- */

/** One record per line: JSON is valid TypeScript here, and a monster that
    changes upstream then shows up as a single line in the diff. */
const literal = (value) => JSON.stringify(value);

/**
 * Drop anything a fresh stat block already says.
 *
 * reviveStatBlock merges a saved block onto the defaults, so every field left
 * out here comes back with the value it would have had anyway. That is a
 * third off the file, and it means the data never restates a default that
 * later changes in one place and not the other.
 */
function prune(block, defaults) {
  const out = {};
  for (const [key, value] of Object.entries(block)) {
    const fallback = defaults[key];
    if (JSON.stringify(value) === JSON.stringify(fallback)) continue;
    if (value && fallback && !Array.isArray(value)
        && typeof value === 'object' && typeof fallback === 'object') {
      const inner = prune(value, fallback);
      if (Object.keys(inner).length) out[key] = inner;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** What defaultStatBlock() in src/lib/statblock.ts builds. Kept in step by a
    test, which fails if the two ever drift. */
const DEFAULT_BLOCK = {
  name: 'Monster', size: 'Medium', type: 'Humanoid', alignment: 'True Neutral',
  acValue: 13, acNote: '', hpValue: 75, showHitDice: true, initiative: 'none',
  proficiencyBonus: 2,
  speeds: { walk: 30, burrow: 0, climb: 0, fly: 0, swim: 0, hover: false },
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  saves: [], skills: {}, vulnerabilities: [], resistances: [],
  damageImmunities: [], conditionImmunities: [],
  senses: { darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0, blindBeyond: false },
  languages: [], telepathy: 0,
  entries: { trait: [], action: [], legendary: [], lair: [] },
  legendaryCount: 3,
};

/**
 * The trait's wording with the creature's own name taken back out.
 *
 * Two creatures word the same trait identically apart from what they call
 * themselves: "The devil has Advantage on saving throws against spells" and
 * "The mind flayer has Advantage on saving throws against spells" are one
 * trait, not two, and a picker that shows both seventy-six times is no use.
 * Only lowercase occurrences go, so a Fire Elemental loses "the fire
 * elemental" and keeps "Fire damage".
 */
function withoutSelf(text, monster) {
  const lower = monster.toLowerCase();
  /* Hyphenated names first: a yuan-ti calls itself "the yuan-ti", and taking
     "yuan" out on its own would leave "the -ti" behind. */
  const words = [...lower.split(/[^a-z-]+/), ...lower.split(/[^a-z]+/)]
    .filter((w) => w.length > 2)
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const word of words) out = out.replaceAll(new RegExp(`\\b${word}\\b`, 'g'), '');
  return out.replace(/\s+/g, ' ').toLowerCase();
}

/** "Legendary Resistance (3/Day, or 4/Day in Lair)" is Legendary Resistance. */
const plainName = (name) => name.replace(/\s*\([^)]*\)\s*$/, '').trim();

/**
 * One row per trait, and one row only.
 *
 * Creatures word the same trait differently — a death burst has its own dice
 * and its own save, a regeneration its own number of hit points — but a list
 * that shows Death Burst nine times is a list nobody can read. The wording
 * the most creatures share wins and the rest go, since every one of them is a
 * starting point to be edited anyway.
 */
function traitCatalogue(monsters) {
  /* Grouped by name, then by the exact words, so the commonest wording of
     each is the one that survives. */
  const groups = new Map();
  for (const { name: monster, block } of monsters) {
    for (const t of block.entries.trait) {
      if (!t.name || !t.text) continue;
      const key = plainName(t.name).toLowerCase();
      let group = groups.get(key);
      if (!group) { group = { total: 0, wordings: new Map() }; groups.set(key, group); }
      group.total += 1;
      const wording = group.wordings.get(t.text);
      if (wording) wording.count += 1;
      else group.wordings.set(t.text, { name: t.name, text: t.text, example: monster, count: 1 });
    }
  }

  return [...groups.values()].map((group) => {
    const [best] = [...group.wordings.values()].sort((a, b) => b.count - a.count);
    return {
      id: slug(plainName(best.name)),
      name: best.name,
      text: best.text,
      example: best.example,
      count: group.total,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function load() {
  if (existsSync(CACHE)) return JSON.parse(await readFile(CACHE, 'utf8'));
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`${SOURCE} returned ${res.status}`);
  const text = await res.text();
  await mkdir(dirname(CACHE), { recursive: true });
  await writeFile(CACHE, text);
  return JSON.parse(text);
}

const HEADER = `/* Generated by tools/build-bestiary.mjs — do not edit by hand.
   Source: the 2025 Monster Manual as published in 5etools' bestiary data. */\n`;

/**
 * Seal the creatures that are not in the open reference document.
 *
 * The Monster Manual is not ours to republish, and a gate that only hides the
 * list would not be one: the blocks would still be sitting in the bundle for
 * anyone who opened the network tab. So they are encrypted, and what ships is
 * ciphertext that is no use without the password.
 *
 * The password never appears here or anywhere else in the repository — it
 * comes from the environment at build time, and the site only ever sees what
 * came out the other side.
 *
 * It is compressed first. Encryption destroys the repetition that makes stat
 * block prose compress, so ciphertext goes over the wire at full size; gzip
 * before the cipher and the download is a quarter of what it would be.
 *
 * Salt and nonce are derived from the plaintext rather than drawn at random,
 * which does two things: the same data always rebuilds to the same file, so a
 * rebuild that changed nothing shows an empty diff; and data that did change
 * gets a different key, so no two versions are ever encrypted under the same
 * key and nonce.
 */
function seal(plaintext, password) {
  const digest = (tag) => createHash('sha256').update(tag).update(plaintext).digest();
  const salt = digest('salt').subarray(0, 16);
  const iv = digest('nonce').subarray(0, 12);
  const key = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const packed = gzipSync(Buffer.from(plaintext, 'utf8'), { level: 9 });
  const body = Buffer.concat([cipher.update(packed), cipher.final()]);
  return {
    iterations: ITERATIONS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    /* The tag rides on the end, which is where WebCrypto expects it. */
    data: Buffer.concat([body, cipher.getAuthTag()]).toString('base64'),
  };
}

async function main() {
  const report = [];
  const raw = await load();
  const monsters = raw.monster
    .map((m) => convert(m, report))
    .sort((a, b) => a.name.localeCompare(b.name));

  const traits = traitCatalogue(monsters);

  await mkdir(join(ROOT, 'src', 'data'), { recursive: true });

  await writeFile(join(ROOT, 'src', 'data', 'monsterTraits.ts'), [
    HEADER,
    `import type { CatalogTrait } from '../lib/catalog.ts';\n`,
    `export const MONSTER_TRAITS: readonly CatalogTrait[] = [`,
    ...traits.map((t) => `  ${literal(t)},`),
    `];\n`,
  ].join('\n'));

  const packed = monsters.map((m) => ({ ...m, block: prune(m.block, DEFAULT_BLOCK) }));
  const open = packed.filter((m) => m.srd);
  const sealed = packed.filter((m) => !m.srd);

  await writeFile(join(ROOT, 'src', 'data', 'monsterTemplates.ts'), [
    HEADER,
    `import type { SavedStatBlock } from '../lib/statblock.ts';`,
    `import type { MonsterTemplate } from '../lib/catalog.ts';\n`,
    `/* The block every creature below was pruned against. A test compares it`,
    `   to defaultStatBlock(): if the two ever drift, a monster whose armour`,
    `   class happens to match the old default would come back wearing the`,
    `   new one. */`,
    `export const PRUNED_AGAINST: SavedStatBlock = ${literal(DEFAULT_BLOCK)};\n`,
    `/* The creatures that are also in the System Reference Document 5.2, which`,
    `   is published under Creative Commons Attribution 4.0. Everyone gets`,
    `   these. The rest are in monsterTemplatesSealed.ts. */`,
    `export const MONSTER_TEMPLATES: readonly MonsterTemplate[] = [`,
    ...open.map((m) => `  ${literal(m)},`),
    `];\n`,
  ].join('\n'));

  /* The counts live in a module of their own, small enough to ship with the
     app. Reading them off the catalogue would drag the whole catalogue into
     the first load, which is the one thing it must not do. */
  await writeFile(join(ROOT, 'src', 'data', 'bestiaryCounts.ts'), [
    HEADER,
    `/** Creatures in the reference document, which everyone gets. */`,
    `export const OPEN_COUNT = ${open.length};\n`,
    `/** Creatures behind the password. Saying how many costs nothing; saying`,
    `    which would mean shipping them. */`,
    `export const SEALED_COUNT = ${sealed.length};\n`,
  ].join('\n'));

  const password = process.env['BESTIARY_PASSWORD'];
  if (!password) {
    throw new Error(
      'BESTIARY_PASSWORD is not set. The creatures outside the reference\n'
      + 'document are encrypted with it, and it is deliberately not stored in\n'
      + 'this repository. Run:  BESTIARY_PASSWORD=... npm run bestiary');
  }
  const vault = seal(JSON.stringify(sealed), password);
  await writeFile(join(ROOT, 'src', 'data', 'monsterTemplatesSealed.ts'), [
    HEADER,
    `import type { SealedTemplates } from '../lib/vault.ts';\n`,
    `/* The creatures that are NOT in the reference document, encrypted with`,
    `   AES-256-GCM under a key stretched from the password by PBKDF2. What is`,
    `   below is ciphertext; without the password it is ${vault.data.length} characters of noise.`,
    `   See src/lib/vault.ts for how it is opened. */`,
    `export const SEALED_TEMPLATES: SealedTemplates = {`,
    `  iterations: ${vault.iterations},`,
    `  salt: ${JSON.stringify(vault.salt)},`,
    `  iv: ${JSON.stringify(vault.iv)},`,
    `  count: ${sealed.length},`,
    `  data: ${JSON.stringify(vault.data)},`,
    `};\n`,
  ].join('\n'));

  console.log(`${monsters.length} monsters, ${traits.length} distinct traits`);
  console.log(`  ${open.length} in the reference document, open to everyone`);
  console.log(`  ${sealed.length} sealed behind the password`);
  if (report.length) {
    console.log(`\n${report.length} bonuses that proficiency alone does not explain:`);
    for (const line of report.slice(0, 40)) console.log(`  ${line}`);
    if (report.length > 40) console.log(`  … and ${report.length - 40} more`);
  }
}

await main();
