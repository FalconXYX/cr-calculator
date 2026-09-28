/* Working out the creatures that 5etools stores as differences.

   A quarter of the bestiary is not written out. A Flying Dagger is "a Flying
   Sword, with 'sword' read as 'dagger' and the Longsword action swapped for a
   Dagger one"; Archduke Zariel is Zariel with three actions replaced. Without
   resolving those the catalogue loses a quarter of everything, and most of
   the interesting variants with it. */

const key = (name, source) => `${String(name).toLowerCase()}\u0000${String(source).toLowerCase()}`;
const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Fields that describe where an entry was printed, not what it is. */
const PROVENANCE = [
  'reprintedAs', 'otherSources', 'additionalSources', 'srd', 'srd52',
  'basicRules', 'basicRules2024', 'page', 'hasToken', 'hasFluff',
  'hasFluffImages', 'soundClip', '_versions',
];

/**
 * Swap one word for another through every string in a value.
 *
 * This is what `replaceTxt` does, and it is the single commonest operation in
 * the data — a variant is most often the same creature called something else
 * all the way down. Case is carried over, so "Sword" stays capitalised.
 */
function replaceText(value, replace, withText) {
  const pattern = new RegExp(`\\b${escape(replace)}\\b`, 'gi');
  const swap = (s) => s.replace(pattern, (m) => (m[0] === m[0].toUpperCase()
    ? withText.charAt(0).toUpperCase() + withText.slice(1)
    : withText));
  const walk = (v) => {
    if (typeof v === 'string') return swap(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(value);
}

const asArray = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** One `_mod` instruction against one field of the creature being built. */
function applyOne(monster, field, op, report) {
  if (op === 'remove') { delete monster[field]; return; }
  if (typeof op !== 'object' || op === null) { monster[field] = op; return; }

  if (op.mode === 'replaceTxt') {
    const targets = field === '*' || field === '_'
      ? Object.keys(monster).filter((k) => k !== 'name' && k !== 'source')
      : [field];
    for (const k of targets) {
      if (monster[k] !== undefined) monster[k] = replaceText(monster[k], op.replace, op.with);
    }
    return;
  }

  const list = asArray(monster[field]);
  const items = asArray(op.items);

  switch (op.mode) {
    case 'appendArr':
      monster[field] = [...list, ...items];
      return;
    case 'appendIfNotExistsArr': {
      const have = new Set(list.map((x) => x?.name));
      monster[field] = [...list, ...items.filter((x) => !have.has(x?.name))];
      return;
    }
    case 'prependArr':
      monster[field] = [...items, ...list];
      return;
    case 'insertArr':
      monster[field] = [...list.slice(0, op.index ?? 0), ...items, ...list.slice(op.index ?? 0)];
      return;
    case 'removeArr': {
      const names = new Set(asArray(op.names).map(String));
      monster[field] = list.filter((x) => !names.has(x?.name));
      return;
    }
    case 'replaceArr': {
      const target = typeof op.replace === 'object' ? op.replace.index : op.replace;
      const at = typeof target === 'number'
        ? target
        : list.findIndex((x) => x?.name === target);
      if (at < 0) { report.push(`${monster.name}: nothing called "${target}" to replace`); return; }
      monster[field] = [...list.slice(0, at), ...items, ...list.slice(at + 1)];
      return;
    }
    case 'setProp':
      monster[op.prop ?? field] = op.value;
      return;
    default:
      /* Spell list surgery and skill maths, which the app does not read back
         out anyway — the creature is still worth having without them. */
      report.push(`${monster.name}: ${op.mode} on ${field} left undone`);
  }
}

/**
 * The creature a `_copy` entry describes, written out in full.
 *
 * Copies of copies happen, so this recurses — with a depth stop, because
 * nothing in the data should be more than a couple deep and a cycle would
 * otherwise never come back.
 */
export function resolveCopy(entry, byKey, report, depth = 0) {
  if (!entry?._copy) return entry;
  if (depth > 4) { report.push(`${entry.name}: copied too deep to follow`); return entry; }

  const ref = entry._copy;
  const base = byKey.get(key(ref.name, ref.source));
  if (!base) { report.push(`${entry.name}: copies ${ref.name} (${ref.source}), which is missing`); return entry; }

  const built = structuredClone(resolveCopy(base, byKey, report, depth + 1));
  for (const field of PROVENANCE) delete built[field];

  /* What the copy states for itself wins over what it inherited, and the
     modifications run last, over the finished thing. */
  for (const [k, v] of Object.entries(entry)) {
    if (k !== '_copy') built[k] = structuredClone(v);
  }
  if (ref._templates) report.push(`${entry.name}: built from a template, which is not followed`);

  for (const [field, ops] of Object.entries(ref._mod ?? {})) {
    for (const op of asArray(ops)) applyOne(built, field, op, report);
  }
  delete built._copy;
  return built;
}

/** Index every entry by name and source, so a copy can find what it copies. */
export const indexBy = (monsters) => new Map(monsters.map((m) => [key(m.name, m.source), m]));
