/* 5etools stores stat block prose in a markup of its own: `{@hit 5}` for an
   attack bonus, `{@damage 2d6 + 3}` for a dice expression, `{@condition
   Prone|XPHB}` for a rules reference. Every one has to come back out as the
   words the Monster Manual prints, because that text is what the vibe check
   reads: a stray `{@dc 15}` left in would hide the save DC from it. */

const ATTACK = {
  m: 'Melee Attack Roll:',
  r: 'Ranged Attack Roll:',
  'm,r': 'Melee or Ranged Attack Roll:',
  'r,m': 'Melee or Ranged Attack Roll:',
};

const ABILITY = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};

const ORDINAL = ['', 'First', 'Second', 'Third', 'Fourth'];

/** Tags that carry meaning rather than a cross-reference. */
const SPECIAL = {
  h: () => 'Hit: ',
  hom: () => 'Hit or Miss: ',
  hit: (p) => (p.startsWith('-') ? p : `+${p}`),
  dc: (p) => `DC ${p}`,
  atkr: (p) => ATTACK[p.replace(/\s/g, '')] ?? 'Attack Roll:',
  actSave: (p) => `${ABILITY[p] ?? p} Saving Throw:`,
  actSaveFail: (p) => (p ? `${ORDINAL[Number(p)] ?? p} Failure:` : 'Failure:'),
  actSaveFailBy: (p) => `Failure by ${p} or More:`,
  actSaveSuccess: () => 'Success:',
  actSaveSuccessOrFail: () => 'Failure or Success:',
  actTrigger: () => 'Trigger:',
  /* The `d` flavour runs straight on into what follows — "Response—Wisdom
     Saving Throw: DC 15" — so it ends in a dash rather than a colon. */
  actResponse: (p) => (p === 'd' ? 'Response—' : 'Response:'),
  recharge: (p) => (p ? `(Recharge ${p}–6)` : '(Recharge 6)'),
  damage: (p) => p.split('|')[0],
  dice: (p) => p.split('|')[0],
  scaledamage: (p) => p.split('|').pop(),
  scaledice: (p) => p.split('|').pop(),
  chance: (p) => `${p.split('|')[0]} percent`,
};

/**
 * A cross-reference renders as its display text: the third pipe field when
 * one is given, else the name with any disambiguating `[bracket]` removed.
 * `{@variantrule Cone [Area of Effect]|XPHB|Cone}` is simply "Cone".
 */
function reference(payload) {
  const parts = payload.split('|');
  const shown = parts[2] || parts[0] || '';
  return shown.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}

/** Turn one 5etools string into the plain words a stat block prints. */
export function detag(text) {
  if (typeof text !== 'string') return '';
  let out = text;
  /* Tags do not nest in this data, but loop anyway so that a future one that
     does is unwrapped rather than left half-rendered on the page. */
  for (let pass = 0; pass < 4 && out.includes('{@'); pass++) {
    out = out.replace(/\{@(\w+)(?:\s+([^{}]*))?\}/g, (_, tag, payload = '') => {
      const special = SPECIAL[tag];
      return special ? special(payload.trim()) : reference(payload);
    });
  }
  return out
    .replace(/\{=[^}]*\}/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;:])/g, '$1')
    .trim();
}
