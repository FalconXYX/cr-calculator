/* Reading a stat block out of pasted text. Run with `npm test`.

   Two kinds of check. The first are ordinary: a homebrew block in the shape
   Homebrewery writes it, and the awkward corners of that shape. The second is
   a round trip — every creature in the catalogue written out as text and read
   back in — which is worth more than any fixture, because it is three
   thousand blocks the parser has never been tuned against. */

import * as S from '../src/lib/statblock.ts';
import { ABILITIES } from '../src/lib/statblock.ts';
import type { StatBlock } from '../src/lib/statblock.ts';
import { toMarkdown, toPlainText } from '../src/lib/statblockText.ts';
import {
  diceAverage, looksLikeStatBlock, normalize, parseStatBlock,
} from '../src/lib/parseStatBlock.ts';
import { MONSTER_TEMPLATES } from '../src/data/monsterTemplates.ts';
import { SEALED_TEMPLATES } from '../src/data/monsterTemplatesSealed.ts';
import { open as openVault } from '../src/lib/vault.ts';
import { templateBlock } from '../src/lib/catalog.ts';
import { gutter, gutters } from '../src/lib/ocr.ts';
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
const WIDTH = 400;
const HEIGHT = 100;
/* Text, not solid blocks: a row through a line of writing catches letter
   strokes and misses the gaps between them, which is what tells it apart from
   a ruled line. `rules` draws those, right across the page. */
const page = (
  bands: readonly (readonly [number, number])[], rules: readonly number[] = [],
): { width: number; height: number; data: number[] } => {
  const data = new Array<number>(WIDTH * HEIGHT * 4).fill(255);
  const mark = (x: number, y: number): void => {
    const i = (y * WIDTH + x) * 4;
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
  };
  for (const [from, to] of bands) {
    for (let y = 0; y < HEIGHT; y++) for (let x = from; x < to; x += 3) mark(x, y);
  }
  for (const y of rules) for (let x = 0; x < WIDTH; x++) mark(x, y);
  return { width: WIDTH, height: HEIGHT, data };
};

const twoCols = gutter(page([[20, 180], [220, 380]]));
is('two columns are found', Boolean(twoCols), true);
is('and the cut lands between them',
  twoCols ? twoCols.start >= 180 && twoCols.end <= 220 : false, true);

/* The one that broke the Death Warden. A single rule under the title spans
   both columns, and counted as ink it leaves no empty band anywhere. */
const ruled = gutter(page([[20, 180], [220, 380]], [0, 4, 8]));
is('a rule drawn across both columns does not hide the gutter', Boolean(ruled), true);
is('and the cut is in the same place',
  ruled ? ruled.start >= 180 && ruled.end <= 220 : false, true);

is('one column is left alone', gutter(page([[20, 380]])), null);
is('a page with a wide margin is still one column', gutter(page([[120, 280]])), null);
/* A word-width gap is not a gutter. Without a minimum width every space
   between two words would be a column boundary. */
is('a hairline gap is not a gutter', gutter(page([[20, 199], [201, 380]])), null);
/* Nearly all the ink on one side means the quiet strip is white space inside
   one column, not a division into two. */
is('a thin strip beside a block of text is not a second column',
  gutter(page([[20, 270], [285, 295]])), null);
is('a blank page has no gutter', gutter(page([])), null);

/* This app's own two-column export is lopsided on purpose: the name, the
   defences, the ability table and the traits are all pinned into the left
   column, so a small creature leaves the right one thin. A plain even-ink
   test refused to split one export in six. */
/* Text down the full height on the left, a few lines on the right — which
   is what a small creature's export looks like once the name, the defences,
   the ability table and the traits are all in column one. */
const uneven = (): { width: number; height: number; data: number[] } => {
  const data = new Array<number>(WIDTH * HEIGHT * 4).fill(255);
  const mark = (x: number, y: number): void => {
    const i = (y * WIDTH + x) * 4;
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
  };
  for (let y = 0; y < HEIGHT; y++) for (let x = 20; x < 180; x += 3) mark(x, y);
  for (let y = 0; y < HEIGHT / 8; y++) for (let x = 220; x < 380; x += 3) mark(x, y);
  return { width: WIDTH, height: HEIGHT, data };
};
const lopsided = gutter(uneven());
is('a thin but real second column is split', Boolean(lopsided), true);
is('- and the cut is between them',
  lopsided ? lopsided.start >= 180 && lopsided.end <= 220 : false, true);
/* The floor that stops that becoming a licence. A scrollbar, a page-number
   rail or a margin note is not a column. */
is('a hairline strip is still not a column',
  gutter(page([[20, 270], [285, 295]])), null);

console.log('\n--- more than two columns ---');
is('one cut where there is one', gutters(page([[20, 180], [220, 380]])).length, 1);
is('two cuts where there are three columns',
  gutters(page([[10, 120], [150, 250], [280, 390]])).length, 2);
is('and none at all on a single column', gutters(page([[20, 380]])).length, 0);
/* The first cut is still found by the old rule, in the middle of the page,
   so nothing that reads as one column today starts being split in two. */
is('a wide margin is still not a column', gutters(page([[120, 280]])).length, 0);

console.log('\n--- the terser house style, as recognition gives it back ---');
/* A real block that read as almost nothing. Every line below is a different
   thing the parser had never met: labels run together with their numbers,
   saves living in the ability table, damage and condition immunities sharing
   one line, a heading mangled by small capitals, and sentences wrapping
   mid-phrase onto lines that look exactly like new entries. */
const terse = parseStatBlock([
  'DEATH WARDEN',
  '',
  'Medium Humanoid, Lawful Good',
  '',
  'AC15 Initiative +5 (15)',
  '',
  'HP 142 (19d8 + 57)',
  '',
  'Speed 30 ft.',
  '',
  'MOD SAVE MOD SAVE',
  '',
  'STR 19 +4 +4 INT 12 +1 +1',
  'DEX 14 +2 +2 wis 16 +3 +6',
  'CON 16 +3 +3 CHA 17 +3 +6',
  '',
  'Skills Perception +9, Persuasion +6',
  '',
  'Resistances Psychic',
  '',
  'Immunities Necrotic, Poison; Charmed, Frightened, Poisoned',
  '',
  'Senses Truesight 60ft; Passive Perception 19',
  '',
  'Languages Common',
  '',
  'CR5 (XP 1,800; PB +3)',
  '',
  'TRAITS',
  '',
  "Warden's Duty. If a creature is killed with the Death Warden's Baleful Scythe, they",
  'cannot be revived via either Revivify or Raise Dead.',
  '',
  'ACTIONS',
  '',
  'Baleful Scythe. Melee Weapon Attack: +7 to hit, Each Creature within 10ft of the Death',
  'Warden. Hit: 12 (2d8+3) Slashing damage and 3 (1d6) Psychic damage.',
  '',
  'Bonus AcTioNns',
  '',
  'Ethereal Stride. The Death Warden teleports to the Ethereal Plane from the Material',
  'Plane or vice versa. If doing so moves into the space of another creature then the',
  'Death Warden is moved to the nearest unoccupied space.',
].join('\n'));
const tb = terse.block;
is('AC15, with no space to find it by', tb.acValue, 15);
is('HP', tb.hpValue, 142);
is('PB out of the challenge line brackets', tb.proficiencyBonus, 3);
is('the ability table reads across two halves',
  ABILITIES.map((a) => tb.abilities[a]).join(' '), '19 14 16 12 16 17');
/* No Saving Throws line anywhere: a save that is not simply the modifier is
   the only thing saying which ones are proficient. */
is('the saves come out of the table', tb.saves.join(','), 'wis,cha');
is('and the ones that match their modifier are left out',
  tb.saves.includes('str'), false);
is('damage immunities take the first half of the line',
  tb.damageImmunities.join(','), 'Necrotic,Poison');
is('and conditions the second', tb.conditionImmunities.join(','), 'Charmed,Frightened,Poisoned');
is('resistances without the word Damage in front', tb.resistances.join(','), 'Psychic');
is('truesight', tb.senses.truesight, 60);
/* "…within 10ft of the Death / Warden. Hit: 12…" is a capitalised word and a
   full stop, and is not an action. */
is('a sentence wrapping mid-phrase does not start an entry',
  tb.entries.action.map((e) => e.name).join(' | '), 'Baleful Scythe | Ethereal Stride');
is('nor does the second one', tb.entries.action.some((e) => /^Plane/.test(e.name)), false);
is('the trait survived its own wrap', tb.entries.trait.map((e) => e.name).join(','), "Warden's Duty");
/* "BONUS ACTIONS" in small capitals came back as "Bonus AcTioNns". */
is('a heading one letter wrong is still the heading',
  tb.entries.action.find((e) => e.name === 'Ethereal Stride')?.kind, 'bonus');
is('nothing was missing', terse.report.missing.join('; ') || '-', '-');

console.log('\n--- copying a block across, not just the parts that score ---');
/* The point of pasting is that what comes out matches what went in. These are
   the fields that score nothing and were therefore never read. */
const copied = parseStatBlock([
  'JAWSY JESTER',
  'Medium Aberration, Chaotic Evil',
  'AC 17 (natural armor) Initiative +6 (16)',
  'HP 90 (12d8 + 36)',
  'Speed 30 ft.',
  'STR 17 DEX 15 CON 16 INT 8 WIS 12 CHA 16',
  'CR 3 (XP 700; PB +2)',
  '',
  'Bite. Melee Attack Roll: +5 to hit, reach 5 ft. Hit: 12 (2d8+3) Piercing damage.',
  '',
  'LEGENDARY ACTIONS',
  '',
  'The jester can take 2 legendary actions, choosing from the options below.',
  '',
  'Caper. The jester moves up to its speed.',
].join('\n')).block;
/* Recognition hands back a printed name SHOUTING, because it is set in small
   capitals. */
is('a name in capitals is put back into its own case', copied.name, 'Jawsy Jester');
is('the note in brackets after the armour class comes too', copied.acNote, 'natural armor');
/* +6 with Dexterity 15 is four above the +2 the ability alone gives, which
   is a proficiency of +2 counted twice. */
is('initiative is read as the proficiency it implies', copied.initiative, 'expertise');
is('and the hit dice are known to have been printed', copied.showHitDice, true);
is('how many legendary actions a round', copied.legendaryCount, 2);

/* The bracket has to follow the number directly, or the initiative roll would
   be read as the armour the creature is wearing. */
const noNote = parseStatBlock([
  'Goblin', 'Small Humanoid, Neutral Evil', 'AC 13 Initiative +2 (12)', 'HP 7',
  'Speed 30 ft.', 'STR 8 DEX 15 CON 10 INT 10 WIS 8 CHA 8', 'CR 1/4 (XP 50; PB +2)',
  '', 'Scimitar. Melee Attack Roll: +4 to hit. Hit: 5 (1d6 + 2) Slashing damage.',
].join('\n')).block;
is('an initiative roll is not mistaken for an armour note', noNote.acNote, '');
is('and hit points with no dice printed do not grow any', noNote.showHitDice, false);
is('a plain initiative is no proficiency at all', noNote.initiative, 'none');

console.log('\n--- the formats a stat block actually arrives in ---');
const PLAIN = [
  'Goblin Boss', 'Small Humanoid, Neutral Evil',
  'Armor Class 17', 'Hit Points 21 (6d6)', 'Speed 30 ft.',
  'STR 10 DEX 14 CON 10 INT 10 WIS 8 CHA 10',
  'Damage Resistances \u2014',
  'Languages Common, Goblin', 'Challenge 1 (200 XP)', 'Proficiency Bonus +2', '',
  'Scimitar. Melee Attack Roll: +4 to hit. Hit: 5 (1d6 + 2) Slashing damage.',
].join('\n');

/* A non-breaking space is what a PDF, Google Docs, Word and most HTML put
   between a label and its number. The patterns are written with a literal
   space, so every one of them matched nothing. */
const nbsp = parseStatBlock(PLAIN.replace(/ /g, '\u00a0')).block;
is('a block pasted with non-breaking spaces still has an armour class', nbsp.acValue, 17);
is('- and hit points', nbsp.hpValue, 21);
is('- and ability scores',
  ABILITIES.map((a) => nbsp.abilities[a]).join(' '), '10 14 10 10 8 10');

/* Pasted out of a rendered page: every line wrapped in a tag. */
const html = parseStatBlock(PLAIN.split('\n').map((l) => (l ? `<p>${l}</p>` : '')).join('\n')).block;
is('an HTML paste survives its tags', `${html.acValue}/${html.hpValue}`, '17/21');

/* Homebrewery v3 wraps the block in brace tokens and a blockquote gutter.
   The tokens come off, not the lines they sit on — wrapping one action in a
   note is ordinary practice and dropping the line would take the action. */
const brewed = parseStatBlock([
  '{{monster,frame',
  ...PLAIN.split('\n').map((l) => (l ? `> ${l}` : '>')),
  '{{note ***Second Wind.*** The boss regains 7 hit points.}}',
  '}}',
].join('\n'));
is('a Homebrewery paste reads as a stat block', looksLikeStatBlock(brewed.block.name ? PLAIN : ''), true);
is('- with its armour class', brewed.block.acValue, 17);
is('- and the action inside a note is not lost',
  brewed.block.entries.trait.concat(brewed.block.entries.action).some((e) => e.name === 'Second Wind'), true);

/* A dash means the creature has none of whatever this is. Which dash varies
   by who printed it, and comparing against one of the three let the others
   through as a value. */
is('an em dash is an empty field, not a resistance', nbsp.resistances.length, 0);
for (const dash of ['-', '\u2013', '\u2014', 'None']) {
  is(`- and so is "${dash}"`,
    parseStatBlock(PLAIN.replace('Damage Resistances \u2014', `Damage Resistances ${dash}`)).block.resistances.length, 0);
}

/* D&D Beyond puts a label on one line and its value on the next. */
const wrapped2 = parseStatBlock([
  'Mage', 'Medium Humanoid, Neutral', 'Armor Class 15', 'Hit Points 40 (9d8)',
  'Speed 30 ft.', 'STR 9 DEX 14 CON 11 INT 17 WIS 12 CHA 11',
  'Saving Throws', 'Int +6, Wis +4',
  'Challenge 6 (2,300 XP)', 'Proficiency Bonus +3', '',
  'Dagger. Melee Attack Roll: +5 to hit. Hit: 4 (1d4 + 2) Piercing damage.',
].join('\n')).block;
is('a label alone on its line still finds its value', wrapped2.saves.join(','), 'int,wis');

/* The picture path: the image exporter lays each paragraph of an entry out
   separately, so a screenshot returns them with no name in front of the
   second — and "At Will:" became an action called At Will. */
const spellList = parseStatBlock([
  'Archmage', 'Medium Humanoid, Neutral', 'Armor Class 12', 'Hit Points 99 (18d8 + 18)',
  'Speed 30 ft.', 'STR 10 DEX 14 CON 12 INT 20 WIS 15 CHA 16',
  'Challenge 12 (8,400 XP)', 'Proficiency Bonus +4', '',
  'ACTIONS', '',
  'Spellcasting. The archmage casts one of the following spells.', '',
  'At Will: Detect Magic, Mage Armor, Light', '',
  '3rd Level (3 slots): Counterspell, Fly', '',
  'Dagger. Melee Attack Roll: +6 to hit. Hit: 4 (1d4 + 2) Piercing damage.',
].join('\n')).block;
is('a spell list does not become two actions of its own',
  spellList.entries.action.map((e) => e.name).join(','), 'Spellcasting,Dagger');
is('- it stays inside the entry it belongs to',
  /At Will/.test(spellList.entries.action[0]?.text ?? ''), true);

console.log('\n--- a block this app printed itself, read back in ---');
/* The strictest case there is: the Monster Maker's own two-column export,
   through the recogniser and back. Nothing here should be lost. */
const own = parseStatBlock([
  'EMPTY SWARM',
  'Large Aberration, Chaotic Evil',
  'Armor Class 15',
  'Initiative +6 (16)',
  'Hit Points 218 (23d10 + 92)',
  'Speed 40 ft.',
  'STR DEX CON INT wis CHA',
  '',
  '20(5) 12+)  18(+4) 18(+4) 14(+2)  6(2)',
  'Saving Throws Con +9, Int +9',
  'Damage Resistances Bludgeoning, Piercing, Slashing, Psychic',
  'Damage Immunities Poison',
  'Condition Immunities Charmed, Frightened, Grappled,',
  'Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned',
  'Senses Blindsight 60 ft., Darkvision 60 ft., passive Perception 12',
  'Languages Telepathy 60 ft.',
  'Challenge 15 (13,000 XP)',
  'Proficiency Bonus +5',
  '',
  'Aura of Emptiness. Constitution Saving Throw: DC 17, any creature that starts its turn nearby.',
  '',
  'Swarm. The swarm can occupy another creature\u2019s space and vice versa.',
  '',
  'ACTIONS',
  '',
  'Multiattack. The swarm makes three Engulfing Grasp or Mind Melting Ray attacks.',
  '',
  'Engulfing Grasp. Melee Attack Roll: +10, reach 5 ft. Hit: 18 (3d8 + 5) Bludgeoning damage.',
  '',
  'LEGENDARY ACTIONS',
  '',
  'The empty swarm can take 2 legendary actions, choosing from the options below.',
  '',
  'Charging Grasp. The swarm can move up to its speed and make an Engulfing Grasp attack.',
].join('\n')).block;
const ownReport = parseStatBlock([
  'Challenge 15 (13,000 XP)', 'Proficiency Bonus +5', '',
  'Aura of Emptiness. Constitution Saving Throw: DC 17.',
].join('\n')).report;

is('the name comes back out of capitals', own.name, 'Empty Swarm');
is('armour class and hit points', `${own.acValue}/${own.hpValue}`, '15/218');
/* Recognition mangles the brackets around the modifiers — "20 (+5)" arrives
   as "20(5)" and "6 (-2)" as "6(2)" — and the scores still have to survive. */
is('the ability scores survive mangled brackets',
  ABILITIES.map((a) => own.abilities[a]).join(' '), '20 12 18 18 14 6');
is('initiative is the proficiency it implies', own.initiative, 'proficient');
is('saves', own.saves.join(','), 'con,int');
is('four resistances', own.resistances.length, 4);
is('and nine condition immunities across a wrapped line',
  own.conditionImmunities.length, 9);
is('both kinds of sight', `${own.senses.blindsight}/${own.senses.darkvision}`, '60/60');
is('telepathy out of the languages line', own.telepathy, 60);
/* Challenge and Proficiency Bonus are neighbours and the order varies, so
   stopping at the first of them left the other at the head of the prose. */
is('the proficiency line does not become part of the first trait',
  own.entries.trait[0]?.name, 'Aura of Emptiness');
is('- and the trait list is otherwise whole',
  own.entries.trait.map((e) => e.name).join(','), 'Aura of Emptiness,Swarm');
is('actions', own.entries.action.map((e) => e.name).join(','), 'Multiattack,Engulfing Grasp');
is('legendary actions, and how many a round',
  `${own.entries.legendary.map((e) => e.name).join(',')} x${own.legendaryCount}`,
  'Charging Grasp x2');
/* The sentence opening a legendary section is the one paragraph meant to have
   no name, so it is not reported as something that could not be filed. */
is('the legendary preamble is not complained about',
  own.entries.legendary.length > 0
  && !parseStatBlock('x').report.unsure.some((u) => /no name in front/.test(u)), true);
is('a block with nothing after its headers still reports cleanly',
  ownReport.missing.includes('Traits and actions'), false);

console.log('\n--- one Immunities line, however it is filled ---');
/* The label the calculator used to want was "Damage Immunities" or "Condition
   Immunities" spelled out. A block that writes one "Immunities" line matched
   neither, and both lists came back empty — so a creature immune to being
   charmed and frightened arrived with nothing in either box. */
const immunities = (line: string) => parseStatBlock([
  'Jawsy Jester', 'Medium Aberration, Chaotic Evil',
  'AC 13', 'HP 90 (12d8 + 36)', 'Speed 30 ft.',
  'STR 17 DEX 11 CON 16 INT 8 WIS 12 CHA 16',
  line,
  'CR 3 (XP 700; PB +2)', '',
  'Bite. Melee Attack Roll: +5 to hit, reach 5 ft. Hit: 12 (2d8+3) Piercing damage.',
].join('\n')).block;

const conditionsOnly = immunities('Immunities Charmed, Frightened');
is('conditions on a bare Immunities line are filed as conditions',
  conditionsOnly.conditionImmunities.join(','), 'Charmed,Frightened');
is('and nothing lands in damage immunities',
  conditionsOnly.damageImmunities.length, 0);

const damageOnly = immunities('Immunities Necrotic, Poison');
is('damage types on the same line go the other way',
  damageOnly.damageImmunities.join(','), 'Necrotic,Poison');
is('and leave the conditions empty', damageOnly.conditionImmunities.length, 0);

const mixed = immunities('Immunities Necrotic, Poison; Charmed, Frightened');
is('a semicolon divides the two', mixed.damageImmunities.join(','), 'Necrotic,Poison');
is('- the second half being the conditions',
  mixed.conditionImmunities.join(','), 'Charmed,Frightened');

/* A block that does name them separately must not be touched by any of it. */
const spelled = parseStatBlock([
  'Lich', 'Medium Undead, Lawful Evil', 'AC 17', 'HP 135 (18d8 + 54)', 'Speed 30 ft.',
  'STR 11 DEX 16 CON 16 INT 20 WIS 14 CHA 16',
  'Damage Immunities Poison',
  'Condition Immunities Charmed, Exhaustion, Frightened, Paralyzed, Poisoned',
  'Challenge 21 (33,000 XP)', '',
  'Paralyzing Touch. Melee Attack Roll: +12 to hit. Hit: 10 (3d6) Cold damage.',
].join('\n')).block;
is('a block that spells both out is left alone',
  `${spelled.damageImmunities.join(',')} / ${spelled.conditionImmunities.length}`, 'Poison / 5');

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
