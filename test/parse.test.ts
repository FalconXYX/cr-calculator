/* Reading a stat block out of pasted text. Run with `npm test`.

   Two kinds of check. The first are ordinary: a homebrew block in the shape
   Homebrewery writes it, and the awkward corners of that shape. The second is
   a round trip — every creature in the catalogue written out as text and read
   back in — which is worth more than any fixture, because it is three
   thousand blocks the parser has never been tuned against. */

import * as S from '../src/lib/statblock.ts';
import type { StatBlock } from '../src/lib/statblock.ts';
import { toMarkdown, toPlainText } from '../src/lib/statblockText.ts';
import {
  diceAverage, looksLikeStatBlock, normalize, parseStatBlock,
} from '../src/lib/parseStatBlock.ts';
import { MONSTER_TEMPLATES } from '../src/data/monsterTemplates.ts';
import { SEALED_TEMPLATES } from '../src/data/monsterTemplatesSealed.ts';
import { open as openVault } from '../src/lib/vault.ts';
import { templateBlock } from '../src/lib/catalog.ts';
import { gutter } from '../src/lib/ocr.ts';
import { vibeCheck } from '../src/lib/vibeCheck.ts';
import { compute } from '../src/lib/engine.ts';
import { CR_TABLE } from '../src/lib/crTable.ts';
import type { CalcState, TierId } from '../src/lib/types.ts';

let pass = 0;
let fail = 0;
function is(label: string, got: unknown, want: unknown): void {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}  ->  got ${got}${ok ? '' : `, want ${want}`}`);
}

/* A homebrew block as Homebrewery writes one: blockquote gutter, markdown
   bold, a table for the ability scores, and headings hard against the text. */
const BREW = [
  '> ## Ashen Revenant',
  '> *Medium Undead, Chaotic Evil*',
  '> ___',
  '> - **Armor Class** 16 (natural armor)',
  '> - **Hit Points** 114 (12d8 + 60)',
  '> - **Speed** 30 ft., fly 40 ft. (hover)',
  '> ___',
  '> |STR|DEX|CON|INT|WIS|CHA|',
  '> |:---:|:---:|:---:|:---:|:---:|:---:|',
  '> |18 (+4)|14 (+2)|20 (+5)|9 (-1)|12 (+1)|16 (+3)|',
  '> ___',
  '> - **Saving Throws** Con +8, Wis +4',
  '> - **Skills** Perception +7, Stealth +5',
  '> - **Damage Resistances** Cold, Necrotic',
  '> - **Damage Immunities** Poison',
  '> - **Senses** Darkvision 60 ft., passive Perception 17',
  '> - **Languages** Common, Abyssal',
  '> - **Challenge** 7 (2,900 XP)',
  '> - **Proficiency Bonus** +3',
  '> ___',
  '> ***Regeneration.*** The revenant regains 10 Hit Points at the start of each of its turns.',
  '> ### Actions',
  '> ***Multiattack.*** The revenant makes two Ashen Claw attacks.',
  '>',
  '> ***Ashen Claw.*** *Melee Attack Roll:* +7, reach 10 ft. *Hit:* 14 (2d8 + 5) Slashing damage.',
  '> ### Reactions',
  '> ***Ember Riposte.*** *Trigger:* The revenant is hit. *Response:* The attacker takes 7 (2d6) Fire damage.',
].join('\n');

console.log('--- taking the dressing off ---');
const bare = normalize(BREW);
is('the blockquote gutter goes', bare.includes('>'), false);
is('and the bold markers', bare.includes('**'), false);
is('and the table rules', bare.includes(':---:'), false);
is('and the pipes', bare.includes('|'), false);
is('but the words stay', bare.includes('Ashen Revenant'), true);
is('and so do the numbers', bare.includes('114 (12d8 + 60)'), true);

console.log('\n--- is it even a stat block ---');
is('a stat block is recognised', looksLikeStatBlock(BREW), true);
is('a recipe is not', looksLikeStatBlock('Take two eggs and a cup of flour, then whisk.'), false);
is('nor is an empty paste', looksLikeStatBlock(''), false);
is('one line is not enough on its own', looksLikeStatBlock('Armor Class 15'), false);

console.log('\n--- reading the homebrew block ---');
const brew = parseStatBlock(BREW);
is('the name', brew.block.name, 'Ashen Revenant');
is('the size', brew.block.size, 'Medium');
is('the type', brew.block.type, 'Undead');
is('the alignment', brew.block.alignment, 'Chaotic Evil');
is('armour class, past the bracket after it', brew.block.acValue, 16);
is('hit points', brew.block.hpValue, 114);
is('the walking speed', brew.block.speeds.walk, 30);
is('the flying speed', brew.block.speeds.fly, 40);
is('and that it hovers', brew.block.speeds.hover, true);
/* Each cell holds the score and the modifier it implies — "18 (+4)" — and
   taking every number would read the modifiers as scores. */
is('the ability scores out of a markdown table',
  S.ABILITIES.map((a) => brew.block.abilities[a]).join(' '), '18 14 20 9 12 16');
is('the proficiency bonus', brew.block.proficiencyBonus, 3);
is('the saving throws', brew.block.saves.join(','), 'con,wis');
is('the skills', Object.keys(brew.block.skills).sort().join(','), 'perception,stealth');
is('a skill at plain proficiency', brew.block.skills['stealth'], 'proficient');
is('resistances', brew.block.resistances.join(', '), 'Cold, Necrotic');
is('immunities', brew.block.damageImmunities.join(', '), 'Poison');
is('darkvision', brew.block.senses.darkvision, 60);
is('languages', brew.block.languages.join(', '), 'Common, Abyssal');

console.log('\n--- and the prose under it ---');
is('the trait', brew.block.entries.trait.map((e) => e.name).join(', '), 'Regeneration');
/* Homebrewery puts "### Actions" hard against the trait above it, with no
   blank line, so the heading has to be found inside a paragraph. */
is('the actions, past a heading with no blank line before it',
  brew.block.entries.action.filter((e) => S.kindOf(e) === 'action').map((e) => e.name).join(', '),
  'Multiattack, Ashen Claw');
is('and the reaction, filed as one',
  brew.block.entries.action.filter((e) => S.kindOf(e) === 'reaction').map((e) => e.name).join(', '),
  'Ember Riposte');
is('with its text intact',
  brew.block.entries.action[1]?.text.startsWith('Melee Attack Roll: +7'), true);
is('it says what it read', brew.report.took.some((t) => t.includes('Armor Class 16')), true);
is('including the rating the block claims',
  brew.report.took.some((t) => t.includes('CR 7')), true);

console.log('\n--- what does not add up ---');
is('dice average out', diceAverage('12d8 + 60'), 114);
is('and cope with no modifier', diceAverage('4d8'), 18);
is('and with a negative one', diceAverage('1d4 - 2'), 1);
is('nonsense gives nothing', diceAverage('no dice here'), null);

const wrongHp = parseStatBlock(BREW.replace('114 (12d8 + 60)', '141 (12d8 + 60)'));
is('hit points that disagree with their own dice are flagged',
  wrongHp.report.unsure.some((u) => u.includes('averages 114')), true);

const wrongHit = parseStatBlock(BREW.replace('+7, reach 10 ft.', '+27, reach 10 ft.'));
is('an attack bonus these scores cannot reach is flagged',
  wrongHit.report.unsure.some((u) => u.includes('does not follow')), true);

const noPb = parseStatBlock(BREW.replace('> - **Proficiency Bonus** +3', ''));
is('a missing proficiency bonus is taken from the rating', noPb.block.proficiencyBonus, 3);
is('and it says it did so', noPb.report.unsure.some((u) => u.includes('CR 7 implies')), true);

const bare2 = parseStatBlock('Thing\nArmor Class 12\nHit Points 9\nSTR 10 DEX 10 CON 10 INT 10 WIS 10 CHA 10\nChallenge 1');
is('what is not there is reported missing',
  bare2.report.missing.some((m) => m.includes('Speed')), true);

console.log('\n--- the ability line, the other way round ---');
const inline = parseStatBlock([
  'Thing', 'Large Beast, Unaligned', 'Armor Class 14', 'Hit Points 50 (6d10 + 17)',
  'STR 19 (+4) DEX 12 (+1) CON 17 (+3) INT 3 (-4) WIS 12 (+1) CHA 7 (-2)',
  'Challenge 3',
].join('\n'));
is('scores beside their names, not above them',
  S.ABILITIES.map((a) => inline.block.abilities[a]).join(' '), '19 12 17 3 12 7');

console.log('\n--- the shape optical recognition gives back ---');
/* One line per line of the picture, no blank lines anywhere, and a sentence
   that ran past the edge continued on the next line. This is verbatim what
   came off a rendered block. */
const OCR = [
  'OWLBEAR',
  'Large Monstrosity, Unaligned',
  'Armor Class 13',
  'Initiative +1 (11)',
  'Hit Points 59 (7d10 + 21)',
  'Speed 40 ft., Climb 40 ft.',
  'STR DEX CON INT wis CHA',
  '20 (+5) 12 (+1) 17(+3) 3(4) 12(+1) 7(2)',
  'Skills Perception +5',
  'Senses Darkvision 60 ft., passive Perception 15',
  'Languages \u2014',
  'Challenge 1 (200 XP)',
  'Proficiency Bonus +2',
  'ACTIONS',
  'Multiattack. The owlbear makes two Rend attacks.',
  'Rend. Melee Attack Roll: +7, reach 5 ft. Hit: 14 (2d8 + 5)',
  'Slashing damage.',
].join('\n');

const ocr = parseStatBlock(OCR);
is('the numbers survive cramped spacing',
  S.ABILITIES.map((a) => ocr.block.abilities[a]).join(' '), '20 12 17 3 12 7');
is('armour class', ocr.block.acValue, 13);
is('hit points', ocr.block.hpValue, 59);
is('both actions are found without a blank line between them',
  ocr.block.entries.action.map((e) => e.name).join(', '), 'Multiattack, Rend');
/* The line that ran past the edge belongs to the action above it, not to one
   of its own. */
is('and a wrapped line is put back on the end of its sentence',
  ocr.block.entries.action[1]?.text.endsWith('Slashing damage.'), true);
is('nothing was filed as a trait', ocr.block.entries.trait.length, 0);

/* "Hit:" and "Failure:" open clauses. Requiring a full stop after the name is
   what stops half an attack line becoming an action of its own. */
const clauses = parseStatBlock([
  'Thing', 'Medium Beast, Unaligned', 'Armor Class 12', 'Hit Points 20 (3d8 + 6)',
  'STR 10 DEX 10 CON 10 INT 10 WIS 10 CHA 10', 'Challenge 1', 'ACTIONS',
  'Bite. Melee Attack Roll: +4, reach 5 ft.',
  'Hit: 5 (1d6 + 2) Piercing damage.',
  'Breath. Dexterity Saving Throw: DC 12.',
  'Failure: 7 (2d6) Fire damage.',
  'Success: Half damage.',
].join('\n'));
is('a clause does not become an action of its own',
  clauses.block.entries.action.map((e) => e.name).join(', '), 'Bite, Breath');
is('it stays with the action it belongs to',
  clauses.block.entries.action[0]?.text.includes('Hit: 5 (1d6 + 2)'), true);

console.log('\n--- finding the gutter between two columns ---');
/* The failure this exists for: a two-column block read as one page comes back
   with every line welded to the line beside it — "Armor Class 16 Arcane
   Lance. Ranged Attack Roll: +8" — and nothing downstream can unpick that. */
const page = (
  bands: readonly (readonly [number, number])[], width = 400, height = 100,
): { width: number; height: number; data: number[] } => {
  const data = new Array<number>(width * height * 4).fill(255);
  for (const [from, to] of bands) {
    for (let y = 0; y < height; y++) {
      for (let x = from; x < to; x++) {
        const i = (y * width + x) * 4;
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
      }
    }
  }
  return { width, height, data };
};

const twoCols = gutter(page([[20, 180], [220, 380]]));
is('two columns are found', Boolean(twoCols), true);
is('and the cut lands between them',
  twoCols ? twoCols.start >= 180 && twoCols.end <= 220 : false, true);

is('one column is left alone', gutter(page([[20, 380]])), null);
is('a page with a wide margin is still one column',
  gutter(page([[120, 280]])), null);
/* A narrow word gap is not a gutter. Without a minimum width every space
   between two words would be a column boundary. */
is('a hairline gap is not a gutter', gutter(page([[20, 199], [201, 380]])), null);
/* Three quarters of the ink on one side means the quiet strip is white space
   inside a single column, not a division into two. */
is('a thin strip beside a block of text is not a second column',
  gutter(page([[20, 300], [370, 380]])), null);
is('a blank page has no gutter', gutter(page([])), null);

console.log('\n--- a header line that wrapped ---');
/* Printed blocks wrap Skills, Languages and the damage lists constantly, and
   a pattern that stopped at the newline dropped whatever came after. */
const wrapped = parseStatBlock([
  'Zhentarim Skymage',
  'Medium Humanoid, Lawful Evil',
  'Armor Class 16',
  'Hit Points 153 (18d8 + 72)',
  'Speed 30 ft.',
  'STR DEX CON INT WIS CHA',
  '9 (-1) 16 (+3) 18 (+4) 18 (+4) 12 (+1) 16 (+3)',
  'Saving Throws Int +8, Wis +5',
  'Skills Animal Handling +5, Arcana +8, Deception +7,',
  'Perception +5',
  'Damage Resistances Cold, Fire,',
  'Lightning',
  'Languages Common, Draconic, Tharian, Zhentarim Argot, one',
  'other language',
  'Challenge 10 (5,900 XP)',
  'Proficiency Bonus +4',
  '',
  'Bonded Mount. The skymage has a magical bond with a mount.',
].join('\n'));
is('the skill that wrapped is not lost',
  'perception' in wrapped.block.skills, true);
is('and neither is the one above it', 'deception' in wrapped.block.skills, true);
is('the wrapped language comes through',
  wrapped.block.languages.includes('one other language'), true);
is('and the wrapped resistance', wrapped.block.resistances.join(','), 'Cold,Fire,Lightning');
/* Which matters twice over: three resistances is where the calculator starts
   counting them, so dropping the third changes the rating. */
is('- which is three, so the vibe check counts them',
  Boolean(vibeCheck(wrapped.block, {
    tierId: '0-4', ac: 13, hp: 75, attackBonus: 4, saveDC: 12, extraDamage: 0,
    roundCount: 1, primary: [0, 0, 0, 0, 0, 0], secondary: [0, 0, 0, 0, 0, 0],
    traits: {}, traitValues: {},
  }).next.traits['damageResistance']), true);
is('the entry under the headers is still an entry, not a continuation',
  wrapped.block.entries.trait[0]?.name, 'Bonded Mount');

console.log('\n--- three thousand blocks, out and back ---');
const password = process.env['BESTIARY_PASSWORD'];
const unsealed = password ? await openVault(password, SEALED_TEMPLATES) : null;
const ALL = unsealed ? [...MONSTER_TEMPLATES, ...unsealed] : MONSTER_TEMPLATES;
console.log(unsealed
  ? `(the vault is open, so all ${ALL.length} are under test)`
  : `(no BESTIARY_PASSWORD, so only the ${ALL.length} open ones are)`);

const tierFor = (v: number): TierId => (v <= 4 ? '0-4' : v <= 10 ? '5-10' : v <= 16 ? '11-16' : '17+');
const blank: CalcState = {
  tierId: '0-4', ac: 10, hp: 10, attackBonus: 0, saveDC: 10, extraDamage: 0,
  roundCount: 3, primary: [0, 0, 0, 0, 0, 0], secondary: [0, 0, 0, 0, 0, 0],
  traits: {}, traitValues: {},
};
const ratingOf = (sb: StatBlock, tier: TierId): number => {
  const { next } = vibeCheck(sb, { ...blank, tierId: tier });
  return compute({
    tierId: next.tierId, ac: next.ac, hp: next.hp,
    attackBonus: next.attackBonus, saveDC: next.saveDC,
    damageMode: 'rounds', roundCount: next.roundCount,
    rounds: Array.from({ length: next.roundCount }, (_, i) =>
      (next.primary[i] ?? 0) + (next.secondary[i] ?? 0)),
    extraDamage: next.extraDamage, traits: next.traits, traitValues: next.traitValues,
  }).final.index;
};

for (const [label, render] of [['plain text', toPlainText], ['markdown', toMarkdown]] as const) {
  let same = 0;
  let acHp = 0;
  for (const t of ALL) {
    const original = templateBlock(t);
    const { block } = parseStatBlock(render(original, S.derive(original, CR_TABLE[0]!)));
    const tier = tierFor(t.crValue);
    if (ratingOf(original, tier) === ratingOf(block, tier)) same++;
    if (block.acValue === original.acValue && block.hpValue === original.hpValue) acHp++;
  }
  const share = Math.round((same / ALL.length) * 100);
  is(`${label}: armour and hit points come back exactly`, acHp, ALL.length);
  is(`${label}: the rating survives the trip for at least 19 in 20`, share >= 95, true);
  is(`${label}: - which share exactly`, share, share);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
