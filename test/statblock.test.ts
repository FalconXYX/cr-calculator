/* Monster Maker regression tests. Run with `npm test`. */

import * as S from '../src/lib/statblock.ts';
import { toMarkdown, toPlainText } from '../src/lib/statblockText.ts';
import { parseDamage, parseSaveDC, parseToHit, vibeCheck } from '../src/lib/vibeCheck.ts';
import * as P from '../src/lib/actionPresets.ts';
import { roll20Filename, toRoll20, toRoll20Json } from '../src/lib/roll20.ts';
import type { CalcState } from '../src/lib/types.ts';
import { CR_TABLE } from '../src/lib/crTable.ts';

let pass = 0;
let fail = 0;
function is(label: string, got: unknown, want: unknown): void {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}  ->  got ${got}${ok ? '' : `, want ${want}`}`);
}

const CR1 = CR_TABLE[4]!;   // prof +2
const CR10 = CR_TABLE[13]!; // prof +4

console.log('--- ability modifiers ---');
is('score 10 is +0', S.abilityMod(10), 0);
is('score 11 is +0', S.abilityMod(11), 0);
is('score 9 is -1', S.abilityMod(9), -1);
is('score 1 is -5', S.abilityMod(1), -5);
is('score 30 is +10', S.abilityMod(30), 10);
is('sign renders +0', S.sign(0), '+0');
is('sign keeps minus', S.sign(-2), '-2');

console.log('\n--- hit dice ---');
const hd = S.hitDice(45, 'Medium', 2);
is('45 hp Medium con+2 -> 7d8 + 14', hd.text, '7d8 + 14');
is('and that averages back to 45', hd.average, 45);

const hd2 = S.hitDice(75, 'Medium', 2);
is('75 hp Medium con+2 -> 12d8 + 24', hd2.text, '12d8 + 24');
is('nearest reachable average is 78', hd2.average, 78);
is('11 dice would be further off',
  Math.abs(78 - 75) < Math.abs((Math.floor(11 * 4.5) + 22) - 75), true);

is('con +0 omits the modifier', S.hitDice(28, 'Small', 0).text, '8d6');
is('size picks the die', S.hitDice(100, 'Gargantuan', 0).die, 20);
is('negative con subtracts', S.hitDice(40, 'Large', -1).conTotal < 0, true);

/* A big enough Constitution penalty makes the per-die contribution negative,
   where no dice count reaches the target. It must still produce something. */
const cursed = S.hitDice(10, 'Tiny', -4);
is('impossible con still gives >=1 die', cursed.count >= 1, true);
is('impossible con still gives >=1 hp', cursed.average >= 1, true);
is('hp of 0 does not divide by zero', S.hitDice(0, 'Medium', 0).count >= 1, true);

console.log('\n--- derived bonuses ---');
const sb = S.defaultStatBlock();
sb.abilities = { str: 16, dex: 12, con: 15, int: 13, wis: 14, cha: 11 };
sb.saves = ['dex', 'wis'];
sb.skills = { stealth: 'proficient' };
sb.acValue = 13;
sb.hpValue = 75;
sb.proficiencyBonus = 2;
const d = S.derive(sb, CR1);
is('proficiency is the block\u2019s own', d.pb, 2);
is('unproficient save is the bare modifier', d.saveBonus.str, 3);
is('proficient save adds the bonus', d.saveBonus.wis, 4);
is('skill adds the bonus', d.skillBonus['stealth'], 3);
is('passive Perception without proficiency', d.passivePerception, 12);

sb.skills = { perception: 'proficient', stealth: 'proficient' };
const dPerc = S.derive(sb, CR1);
is('passive Perception with proficiency', dPerc.passivePerception, 14);

const dHigh = S.derive(sb, CR10);
is('a different calculator CR does NOT move the block\u2019s bonus', dHigh.pb, 2);
is('so proficient saves stay put', dHigh.saveBonus.wis, 4);
is('but the CR\u2019s own bonus is reported for comparison', dHigh.crPb, 4);
sb.proficiencyBonus = 4;
is('raising it on the block does move them', S.derive(sb, CR1).saveBonus.wis, 6);
sb.proficiencyBonus = 2;

console.log('\n--- skills: proficiency and expertise ---');
const sk = S.defaultStatBlock();
sk.abilities = { str: 10, dex: 16, con: 10, int: 18, wis: 12, cha: 8 };
sk.proficiencyBonus = 3;
sk.skills = { arcana: 'proficient', stealth: 'expertise', athletics: 'proficient' };
const skd = S.derive(sk, CR1);

/* Each skill keys off its OWN ability, not a shared one. */
is('Arcana is Intelligence plus proficiency', skd.skillBonus['arcana'], 7);
is('Stealth is Dexterity plus twice proficiency', skd.skillBonus['stealth'], 9);
is('Athletics is Strength plus proficiency', skd.skillBonus['athletics'], 3);

sk.skills = { arcana: 'expertise' };
is('expertise doubles only the proficiency bonus, not the ability',
  S.derive(sk, CR1).skillBonus['arcana'], 10);

is('an untrained skill has no entry', 'medicine' in S.derive(sk, CR1).skillBonus, false);

/* Every skill must key off the right ability. */
const ABILITY_OF: Record<string, string> = {
  acrobatics: 'dex', animalHandling: 'wis', arcana: 'int', athletics: 'str',
  deception: 'cha', history: 'int', insight: 'wis', intimidation: 'cha',
  investigation: 'int', medicine: 'wis', nature: 'int', perception: 'wis',
  performance: 'cha', persuasion: 'cha', religion: 'int', sleightOfHand: 'dex',
  stealth: 'dex', survival: 'wis',
};
is('all 18 skills map to the right ability',
  S.SKILLS.every((x) => ABILITY_OF[x.id] === x.ability), true);
is('and the map covers every skill', Object.keys(ABILITY_OF).length, S.SKILLS.length);

const pairs = S.defaultStatBlock();
pairs.proficiencyBonus = 2;
pairs.abilities = { str: 20, dex: 18, con: 16, int: 14, wis: 12, cha: 10 };
pairs.skills = Object.fromEntries(S.SKILLS.map((x) => [x.id, 'proficient' as const]));
const pd = S.derive(pairs, CR1);
is('every skill reads its own ability modifier',
  S.SKILLS.every((x) => pd.skillBonus[x.id] === pd.mods[x.ability] + 2), true);

/* Skills were a flat list of proficient ids before expertise existed. */
const oldSkills = S.reviveStatBlock({ skills: ['stealth', 'perception'] });
is('an old skill list becomes proficiencies', oldSkills.skills['stealth'], 'proficient');
is('and every entry in it', oldSkills.skills['perception'], 'proficient');
is('a tiered object survives',
  S.reviveStatBlock({ skills: { stealth: 'expertise' } }).skills['stealth'], 'expertise');
is('a junk tier is dropped',
  'stealth' in S.reviveStatBlock({ skills: { stealth: 'mastery' } }).skills, false);

console.log('\n--- initiative ---');
const init = S.defaultStatBlock();
init.abilities = { str: 10, dex: 16, con: 10, int: 10, wis: 10, cha: 10 };
init.proficiencyBonus = 3;

init.initiative = 'none';
is('untrained is just Dexterity', S.derive(init, CR1).initiativeBonus, 3);
is('and the score is 10 plus that', S.derive(init, CR1).initiativeScore, 13);

init.initiative = 'proficient';
is('proficient adds the bonus once', S.derive(init, CR1).initiativeBonus, 6);
is('score follows', S.derive(init, CR1).initiativeScore, 16);

init.initiative = 'expertise';
is('expertise adds it twice', S.derive(init, CR1).initiativeBonus, 9);
is('score follows', S.derive(init, CR1).initiativeScore, 19);

/* It leans on the block's own proficiency bonus, not the calculator's. */
init.proficiencyBonus = 5;
is('a bigger proficiency bonus doubles through', S.derive(init, CR1).initiativeBonus, 13);
is('the calculator CR does not change it', S.derive(init, CR10).initiativeBonus, 13);

init.abilities.dex = 8;
init.initiative = 'none';
is('a Dexterity penalty carries', S.derive(init, CR1).initiativeBonus, -1);
is('and the score with it', S.derive(init, CR1).initiativeScore, 9);

is('initiative doubles under expertise too', (() => {
  const e = S.defaultStatBlock();
  e.abilities.dex = 16; e.proficiencyBonus = 4; e.initiative = 'expertise';
  return S.derive(e, CR1).initiativeBonus;
})(), 11);
is('an older block defaults to untrained', S.reviveStatBlock({ name: 'Old' }).initiative, 'none');
is('a nonsense value falls back', S.reviveStatBlock({ initiative: 'wizardry' }).initiative, 'none');
is('a real value survives', S.reviveStatBlock({ initiative: 'expertise' }).initiative, 'expertise');
is('every tier has a label', S.PROFICIENCY_TIERS.every((t) => t in S.PROFICIENCY_LABEL), true);

console.log('\n--- the block owns its own defences ---');
sb.acValue = 17; sb.hpValue = 200;
is('AC is the block\u2019s own', S.derive(sb, CR1).ac, 17);
is('HP is the block\u2019s own', S.derive(sb, CR1).hp, 200);
is('hit dice follow that HP', S.derive(sb, CR1).hitDice.average > 150, true);
sb.acValue = 13; sb.hpValue = 75;

console.log('\n--- line formatting ---');
is('speed lists only what it has',
  S.speedText({ walk: 30, burrow: 0, climb: 0, fly: 60, swim: 0, hover: true }),
  '30 ft., Fly 60 ft. (hover)');
is('no hover, no parenthetical',
  S.speedText({ walk: 30, burrow: 0, climb: 0, fly: 60, swim: 0, hover: false }),
  '30 ft., Fly 60 ft.');
is('senses always end with passive Perception',
  S.sensesText({ darkvision: 60, blindsight: 0, tremorsense: 0, truesight: 0, blindBeyond: false }, 12),
  'Darkvision 60 ft., passive Perception 12');
is('blindsight rider appears',
  S.sensesText({ darkvision: 0, blindsight: 30, tremorsense: 0, truesight: 0, blindBeyond: true }, 11)
    .includes('(blind beyond this radius)'), true);
is('no languages prints an em dash', S.languagesText([], 0), '—');
is('telepathy joins the language list', S.languagesText(['Common'], 60), 'Common, Telepathy 60 ft.');

const meta = S.defaultStatBlock();
meta.size = 'Large'; meta.type = 'Fiend'; meta.alignment = 'Chaotic Evil';
is('meta line', S.metaText(meta), 'Large Fiend, Chaotic Evil');
meta.alignment = '';
is('no alignment, no comma', S.metaText(meta), 'Large Fiend');

const order = S.defaultStatBlock();
order.saves = ['wis', 'dex'];
is('saves print in ability order', S.savesText(order, S.derive(order, CR1)), 'Dex +2, Wis +2');

console.log('\n--- revive ---');
const revived = S.reviveStatBlock({ name: 'Old Save', abilities: { str: 18 } });
is('keeps what was saved', revived.name, 'Old Save');
is('keeps a partial nested value', revived.abilities.str, 18);
is('fills a missing nested value', revived.abilities.cha, 10);
is('fills a field added later', revived.legendaryCount, 3);
is('entry groups always exist', Array.isArray(revived.entries.lair), true);
is('garbage in gives defaults out', S.reviveStatBlock(null).name, 'Monster');
/* Blocks saved before the vocabularies were capitalised. */
is('a lowercase type is folded onto the canonical spelling',
  S.reviveStatBlock({ type: 'humanoid' }).type, 'Humanoid');
is('a lowercase alignment likewise',
  S.reviveStatBlock({ alignment: 'chaotic evil' }).alignment, 'Chaotic Evil');
is('the old bare Neutral becomes True Neutral',
  S.reviveStatBlock({ alignment: 'Neutral' }).alignment, 'True Neutral');
is('Unaligned survives now that it is back',
  S.reviveStatBlock({ alignment: 'unaligned' }).alignment, 'Unaligned');
is('an unknown value is kept rather than snapped',
  S.reviveStatBlock({ type: 'Aberrant Horror' }).type, 'Aberrant Horror');
is('undefined gives defaults out', S.reviveStatBlock(undefined).size, 'Medium');

console.log('\n--- unusual choices ---');
is('Incapacitated immunity is flagged',
  S.unusualPicks(['Incapacitated'], S.UNUSUAL_CONDITION_IMMUNITIES).length, 1);
is('Stunned immunity is flagged',
  S.unusualPicks(['Stunned'], S.UNUSUAL_CONDITION_IMMUNITIES).length, 1);
is('both at once give two notes',
  S.unusualPicks(['Stunned', 'Incapacitated'], S.UNUSUAL_CONDITION_IMMUNITIES).length, 2);
is('an ordinary condition immunity is not flagged',
  S.unusualPicks(['Poisoned', 'Charmed'], S.UNUSUAL_CONDITION_IMMUNITIES).length, 0);
is('Force resistance is flagged',
  S.unusualPicks(['Force'], S.UNUSUAL_RESISTANCES).length, 1);
is('Force immunity is flagged',
  S.unusualPicks(['Force'], S.UNUSUAL_DAMAGE_IMMUNITIES).length, 1);
is('an ordinary resistance is not flagged',
  S.unusualPicks(['Cold', 'Fire'], S.UNUSUAL_RESISTANCES).length, 0);
is('nothing picked, nothing flagged',
  S.unusualPicks([], S.UNUSUAL_CONDITION_IMMUNITIES).length, 0);
/* A value typed by hand will not match the canonical capitalisation. */
is('matching ignores case', S.unusualPicks(['force'], S.UNUSUAL_RESISTANCES).length, 1);
is('and surrounding space', S.unusualPicks([' Stunned '], S.UNUSUAL_CONDITION_IMMUNITIES).length, 1);
is('every warning explains itself',
  [...S.UNUSUAL_CONDITION_IMMUNITIES, ...S.UNUSUAL_RESISTANCES, ...S.UNUSUAL_DAMAGE_IMMUNITIES]
    .every((u) => u.why.length > 60), true);
is('every flagged value is a real option',
  S.UNUSUAL_CONDITION_IMMUNITIES.every((u) => S.CONDITIONS.includes(u.value))
  && S.UNUSUAL_RESISTANCES.every((u) => S.DAMAGE_TYPES.includes(u.value))
  && S.UNUSUAL_DAMAGE_IMMUNITIES.every((u) => S.DAMAGE_TYPES.includes(u.value)), true);

console.log('\n--- export ---');
const full = S.defaultStatBlock();
full.name = 'Bog Hag';
full.resistances = ['Cold'];
full.skills = {};
full.entries.trait = [{ id: 't', name: 'Amphibious', text: 'Breathes air and water.' }];
full.entries.action = [{ id: 'a', name: 'Claws', text: 'Melee Weapon Attack: +5 to hit.' }];
full.entries.action.push({ id: 'b', name: 'Shift', text: 'Disengages.', kind: 'bonus' });
full.entries.action.push({ id: 'r', name: 'Parry', text: 'Adds 3 to its AC.', kind: 'reaction' });
full.entries.legendary = [{ id: 'l', name: 'Detect', text: 'Makes a Perception check.' }];
const fd = S.derive(full, CR1);
const md = toMarkdown(full, fd);
const txt = toPlainText(full, fd);

is('markdown heads with the name', md.startsWith('> ## Bog Hag'), true);
is('markdown has an ability table', md.includes('|:---:|'), true);
is('markdown carries the challenge', md.includes('**Challenge** 1 (200 XP)'), true);
is('markdown carries initiative', md.includes('**Initiative** +0 (10)'), true);
is('initiative sits between armour and hit points',
  md.indexOf('**Armor Class**') < md.indexOf('**Initiative**')
  && md.indexOf('**Initiative**') < md.indexOf('**Hit Points**'), true);
is('plain text carries initiative', txt.includes('Initiative +0 (10)'), true);
is('markdown names the action section', md.includes('### Actions'), true);
is('markdown heads each action kind', md.includes('### Bonus Actions') && md.includes('### Reactions'), true);
is('and orders them action, bonus, reaction',
  md.indexOf('### Actions') < md.indexOf('### Bonus Actions')
  && md.indexOf('### Bonus Actions') < md.indexOf('### Reactions'), true);
is('markdown writes the legendary preamble', md.includes('can take 3 legendary actions'), true);
is('markdown omits empty lines like Skills', md.includes('**Skills**'), false);
is('markdown keeps a line that has content', md.includes('**Damage Resistances** Cold'), true);
is('every markdown line is quoted', md.split('\n').every((l) => l.startsWith('>')), true);
is('plain text heads with the name', txt.startsWith('Bog Hag'), true);
is('plain text has no markdown syntax', /[*_|]/.test(txt), false);
is('plain text carries the challenge', txt.includes('Challenge 1 (200 XP)'), true);

/* Newlines inside an entry would break the one-line-per-entry export. */
const multi = S.defaultStatBlock();
multi.entries.trait = [{ id: 'm', name: 'Long', text: 'First para.\n\nSecond para.' }];
const mdMulti = toMarkdown(multi, S.derive(multi, CR1));
is('entry newlines are flattened', mdMulti.includes('First para. Second para.'), true);
is('and still every line is quoted', mdMulti.split('\n').every((l) => l.startsWith('>')), true);

console.log('\n--- one action list, three kinds ---');
const acts = S.defaultStatBlock();
acts.entries.action = [
  { id: '1', name: 'Claw', text: 'Hit: 5 (1d8 + 1) slashing damage.' },
  { id: '2', name: 'Parry', text: 'Adds 2 to AC.', kind: 'reaction' },
  { id: '3', name: 'Bite', text: 'Hit: 7 (1d10 + 2) piercing damage.', kind: 'action' },
  { id: '4', name: 'Shift', text: 'Disengages.', kind: 'bonus' },
];
is('an untagged entry is a plain action', S.kindOf(acts.entries.action[0]!), 'action');
const grouped = S.actionsByKind(acts.entries.action);
is('three groups come back', grouped.length, 3);
is('actions first', grouped[0]!.kind, 'action');
is('then bonus actions', grouped[1]!.kind, 'bonus');
is('then reactions', grouped[2]!.kind, 'reaction');
is('authored order holds inside a group',
  grouped[0]!.entries.map((e) => e.name).join(','), 'Claw,Bite');
is('an empty kind is left out',
  S.actionsByKind([{ id: 'x', name: 'A', text: '' }]).length, 1);
is('an empty list gives no groups', S.actionsByKind([]).length, 0);

/* Bonus actions and reactions used to be lists of their own. */
const oldEntries = S.reviveStatBlock({ entries: {
  action: [{ id: 'a', name: 'Claw', text: '' }],
  bonus: [{ id: 'b', name: 'Shift', text: '' }],
  reaction: [{ id: 'r', name: 'Parry', text: '' }],
} });
is('old lists collapse into one', oldEntries.entries.action.length, 3);
is('the action keeps its kind', S.kindOf(oldEntries.entries.action[0]!), 'action');
is('the bonus action is tagged', S.kindOf(oldEntries.entries.action[1]!), 'bonus');
is('the reaction is tagged', S.kindOf(oldEntries.entries.action[2]!), 'reaction');
is('and nothing is lost',
  oldEntries.entries.action.map((e) => e.name).join(','), 'Claw,Shift,Parry');

console.log('\n--- Roll20 export ---');
const r20 = S.defaultStatBlock();
r20.name = 'Bog Hag';
r20.size = 'Large';
r20.type = 'Fey';
r20.alignment = 'Neutral Evil';
r20.acValue = 16; r20.acNote = 'Natural Armor';
r20.hpValue = 142;
r20.proficiencyBonus = 3;
r20.abilities = { str: 18, dex: 16, con: 16, int: 14, wis: 14, cha: 11 };
r20.saves = ['str', 'wis'];
r20.skills = { stealth: 'expertise', perception: 'proficient', sleightOfHand: 'proficient' };
r20.initiative = 'proficient';
r20.resistances = ['Cold'];
r20.conditionImmunities = ['Charmed'];
r20.languages = ['Common'];
r20.speeds = { walk: 30, burrow: 0, climb: 0, fly: 60, swim: 0, hover: false };
r20.senses = { darkvision: 60, blindsight: 0, tremorsense: 0, truesight: 0, blindBeyond: false };
r20.entries.trait = [{ id: 't', name: 'Amphibious', text: 'Breathes air and water.' }];
r20.entries.action = [
  { id: 'a', name: 'Claws', text: 'Melee Attack Roll: +7, reach 5 ft. Hit: 13 (2d6 + 6) Slashing damage.' },
  { id: 'b', name: 'Shift', text: 'Disengages.', kind: 'bonus' },
  { id: 'c', name: 'Parry', text: 'Adds 3 to AC.', kind: 'reaction' },
];
r20.entries.legendary = [{ id: 'l', name: 'Tail Swipe', text: 'Deals 7 (2d6) damage.' }];
r20.entries.lair = [{ id: 'z', name: 'Grasping Roots', text: 'Roots erupt.' }];
r20.legendaryCount = 3;
const rd = S.derive(r20, CR_TABLE[13]!);
const doc = toRoll20(r20, rd);

const at = (name: string) => doc.attribs.find((x) => x.name === name);
is('schema version 2', doc.schema_version, 2);
is('name at the top level', doc.name, 'Bog Hag');
is('the sheet is marked as an NPC', at('npc')?.current, 1);
is('armour class', at('npc_ac')?.current, 16);
is('armour note', at('npc_actype')?.current, 'Natural Armor');
is('hit points with the dice', at('npc_hpbase')?.current, '142 (17d10 + 51)');
is('hp lives in the max field', at('hp')?.max, 142);
is('speed', at('npc_speed')?.current, '30 ft., Fly 60 ft.');
is('initiative bonus carries', at('initiative_bonus')?.current, 6);
is('ability score', at('strength')?.current, 18);
is('ability modifier', at('strength_mod')?.current, 4);
is('a proficient save is written', at('npc_str_save')?.current, 7);
is('and flagged', at('npc_str_save_flag')?.current, 1);
is('an unproficient save is absent', at('npc_dex_save'), undefined);
is('challenge rating', at('npc_challenge')?.current, '10');
is('xp has no thousands separator', at('npc_xp')?.current, '5900');
is('senses', at('npc_senses')?.current, 'Darkvision 60 ft., passive Perception 15');
is('condition immunities', at('npc_condition_immunities')?.current, 'Charmed');
is('legendary count', at('npc_legendary_actions')?.current, 3);
is('reactions flag is set', at('npcreactionsflag')?.current, 1);
is('the save DC is read out of the actions', at('npc_spelldc')?.current, 11);
is('the attack bonus too', at('npc_spellattackmod')?.current, 7);

/* Roll20's skill keys are snake_case throughout. The source gist used
   String.replace, which only swaps the FIRST space, so "sleight of hand"
   came out as "sleight_of hand" and the sheet ignored it. */
is('a one-word skill', at('npc_stealth')?.current, 9);
is('expertise doubled it', at('npc_stealth')?.current, 9);
is('a two-word skill is fully snake_cased', at('npc_sleight_of_hand')?.current, 6);
is('and not half-converted', at('npc_sleight_of hand'), undefined);
is('skills are flagged on', at('npc_skills_flag')?.current, 1);

const rows = (prefix: string) => doc.attribs
  .filter((x) => x.name.startsWith(`repeating_${prefix}_`) && x.name.endsWith('_name'))
  .map((x) => String(x.current));
is('traits become trait rows', rows('npctrait').join(','), 'Amphibious');
is('bonus actions ride with the actions, labelled',
  rows('npcaction').join(','), 'Claws,Shift (Bonus Action),Grasping Roots (Lair Action)');
is('reactions get their own rows', rows('npcreaction').join(','), 'Parry');
is('legendary actions are preceded by the preamble',
  rows('npcaction-l').join(','), 'Legendary Actions,Tail Swipe');

/* Roll20 splits repeating attribute names on underscores, so a row id
   containing one would silently break the row. */
const rowIds = doc.attribs
  .filter((x) => x.name.startsWith('repeating_'))
  .map((x) => x.name.split('_')[2]!);
is('no row id contains an underscore', rowIds.every((x) => !x.includes('_')), true);
is('every attribute has a unique id',
  new Set(doc.attribs.map((x) => x.id)).size, doc.attribs.length);
is('ids are Roll20 length', doc.attribs.every((x) => x.id.length === 20), true);

const token = JSON.parse(doc.defaulttoken) as Record<string, unknown>;
is('a Large token is two squares wide', token['width'], 140);
is('the token points at the character', token['represents'], doc.oldId);
is('bar 1 is hit points', token['bar1_max'], 142);
is('bar 2 is armour class', token['bar2_value'], 16);

is('the whole thing is valid JSON',
  typeof JSON.parse(toRoll20Json(r20, rd)), 'object');
is('filename is safe', roll20Filename(r20), 'Bog_Hag.json');
is('an awkward name is scrubbed',
  roll20Filename({ ...r20, name: 'Bog/Hag: "Old" #2' }), 'BogHag_Old_2.json');
is('an empty name still gives a file',
  roll20Filename({ ...r20, name: '' }), 'monster.json');

console.log('\n--- vocabulary ---');
is('18 skills', S.SKILLS.length, 18);
is('no duplicate skill ids', new Set(S.SKILLS.map((s) => s.id)).size, S.SKILLS.length);
is('13 damage types', S.DAMAGE_TYPES.length, 13);
is('15 conditions', S.CONDITIONS.length, 15);
const vocab = [...S.DAMAGE_TYPES, ...S.CONDITIONS, ...S.CREATURE_TYPES, ...S.ALIGNMENTS, ...S.LANGUAGES];
is('every vocabulary word is capitalised', vocab.every((w) => /^[A-Z]/.test(w)), true);
is('14 monster types', S.CREATURE_TYPES.length, 14);
is('10 alignments', S.ALIGNMENTS.length, 10);
is('the neutral alignment is True Neutral', S.ALIGNMENTS.includes('True Neutral'), true);
is('Unaligned comes last', S.ALIGNMENTS[S.ALIGNMENTS.length - 1], 'Unaligned');
is('6 sizes, each with a hit die',
  S.SIZES.every((z) => typeof S.HIT_DIE[z] === 'number') && S.SIZES.length === 6, true);
is('every entry section has a heading entry',
  S.ENTRY_SECTIONS.every((x) => x in S.ENTRY_HEADING), true);
is('4 entry sections now', S.ENTRY_SECTIONS.length, 4);
is('3 action kinds, each with a label and a heading',
  S.ACTION_KINDS.every((k) => k in S.ACTION_KIND_LABEL && k in S.ACTION_KIND_HEADING)
  && S.ACTION_KINDS.length === 3, true);
is('traits deliberately have no heading', S.ENTRY_HEADING.trait, '');
is('entry ids are unique', S.newEntryId() !== S.newEntryId(), true);

console.log('\n--- vibe check: reading numbers out of text ---');
is('stated average wins', parseDamage('Hit: 10 (2d6 + 3) slashing damage.'), 10);
is('dice alone are averaged', parseDamage('takes (2d6) fire damage'), 7);
is('dice with a modifier', parseDamage('(2d6 + 3)'), 10);
is('two damage clauses add up',
  parseDamage('Hit: 10 (2d6 + 3) slashing damage plus 7 (2d6) fire damage.'), 17);
is('a reach is not damage', parseDamage('reach 5 ft., one target.'), 0);
is('a save DC is not damage', parseDamage('DC 15 Dexterity saving throw'), 0);
is('a recharge note is not damage', parseDamage('Breath Weapon (Recharge 5-6)'), 0);
is('negative modifiers cannot go below zero', parseDamage('(1d4 - 10)'), 0);

is('to hit is read', parseToHit('+5 to hit, reach 5 ft.'), 5);
is('highest to hit wins', parseToHit('+5 to hit. Also +11 to hit.'), 11);
is('no to hit gives null', parseToHit('The creature hides.'), null);
is('save DC is read', parseSaveDC('DC 15 Dexterity saving throw'), 15);
is('highest DC wins', parseSaveDC('DC 12 ... DC 18 ...'), 18);

console.log('\n--- vibe check: filling the calculator ---');
const blank: CalcState = {
  tierId: '0-4', ac: 1, hp: 1, attackBonus: 0, saveDC: 0, extraDamage: 0,
  roundCount: 3, primary: [9, 9, 9, 0, 0, 0], secondary: [9, 9, 9, 0, 0, 0],
  traits: { staleTrait: true }, traitValues: { staleTrait: 99 },
};

const mon = S.defaultStatBlock();
mon.acValue = 16;
mon.hpValue = 142;
mon.abilities = { str: 18, dex: 14, con: 16, int: 8, wis: 12, cha: 10 };
mon.saves = ['str', 'con', 'wis'];
mon.resistances = ['Cold'];
mon.damageImmunities = ['Poison'];
mon.entries.trait = [
  { id: '1', name: 'Pack Tactics', text: 'Advantage when an ally is within 5 feet.' },
  { id: '2', name: 'Not A Real Trait', text: 'Does nothing the DMG scores.' },
];
mon.entries.action = [
  { id: '3', name: 'Greatsword', text: 'Melee Weapon Attack: +7 to hit, reach 5 ft. Hit: 13 (2d6 + 6) slashing damage.' },
  { id: '4', name: 'Breath Weapon (Recharge 5-6)', text: 'Each creature makes a DC 15 save, taking 45 (10d8) fire damage.' },
];
mon.entries.legendary = [
  { id: '5', name: 'Tail Swipe', text: 'The creature deals 7 (2d6) bludgeoning damage.' },
];
mon.entries.action.push(
  { id: '6', name: 'Riposte', text: 'The creature deals 4 (1d8) piercing damage.', kind: 'reaction' });

mon.proficiencyBonus = 3;
const v = vibeCheck(mon, blank);
is('armour class is taken', v.next.ac, 16);
is('hit points are taken', v.next.hp, 142);
is('the stated to-hit wins over the ability score', v.next.attackBonus, 7);
is('the stated save DC is taken', v.next.saveDC, 15);
is('a matching trait is ticked', v.next.traits['packTactics'], true);
is('a non-matching trait is ignored', 'notarealtrait' in v.next.traits, false);
is('resistances tick the resistance row', v.next.traits['damageResistance'], true);
is('immunities tick the immunity row', v.next.traits['damageImmunity'], true);
is('save proficiencies are counted', v.next.traitValues['saveProficiencies'], 3);
is('stale traits are cleared', 'staleTrait' in v.next.traits, false);

/* Breath Weapon scores its own damage through the trait, so counting it in
   the round as well would charge the monster for it twice. */
is('breath weapon is scored as a trait', v.next.traits['breathWeapon'], true);
is('and carries its damage', v.next.traitValues['breathWeapon'], 45);
is('so the round holds only the greatsword', v.next.primary[0], 13);
is('legendary damage goes to the off-turn field, and so does a reaction',
  v.next.extraDamage, 11);
is('rounds collapse to one', v.next.roundCount, 1);
is('secondary damage is cleared', v.next.secondary[0], 0);
is('the target CR range is left alone', v.next.tierId, '0-4');
is('the report says what it took', v.report.took.length > 5, true);

/* The 2024 books write attack lines differently from the 2014 ones. */
is('2014 wording is read', parseToHit('Melee Weapon Attack: +7 to hit, reach 5 ft.'), 7);
is('2024 wording is read', parseToHit('Melee Attack Roll: +10, reach 5 ft.'), 10);
is('ranged 2024 wording too', parseToHit('Ranged Attack Roll: +6, range 150/600 ft.'), 6);
is('the higher of the two wordings wins',
  parseToHit('Melee Attack Roll: +10. Also +12 to hit.'), 12);
is('a 2024 save line still yields its DC',
  parseSaveDC('Constitution Saving Throw: DC 12, each creature in a 15-foot Cone.'), 12);
is('2024 damage with no stated average is worked out',
  parseDamage('Hit: (4d12 + 5) Force damage.'), 31);

console.log('\n--- action presets ---');
is('every preset has a name and body',
  P.ACTION_PRESETS.every((x) => x.name.length > 0 && x.text.length > 20), true);
is('no duplicate preset ids',
  new Set(P.ACTION_PRESETS.map((x) => x.id)).size, P.ACTION_PRESETS.length);
is('every preset belongs to a listed group',
  P.ACTION_PRESETS.every((x) => P.PRESET_GROUPS.includes(x.group)), true);
is('every preset kind is a real kind',
  P.ACTION_PRESETS.every((x) => S.ACTION_KINDS.includes(x.kind)), true);
is('lookup by id works', P.presetById('slam')?.name, 'Slam');
is('an unknown id gives nothing', P.presetById('nope'), undefined);

/* A preset the vibe check cannot read would be worse than no preset.
   Only actual attack lines count: Parry and Riposte mention an attack roll
   in prose without being one, and must NOT yield a bonus. */
const attackLines = P.ACTION_PRESETS.filter(
  (x) => /attack roll:\s*[+-]?\d/i.test(x.text) || /[+-]?\d+\s*to hit/i.test(x.text));
is('every attack preset yields a to-hit',
  attackLines.every((x) => parseToHit(x.text) !== null), true);
is('and there are several', attackLines.length >= 8, true);
is('prose mentioning an attack roll yields nothing',
  parseToHit(P.presetById('parry')!.text), null);
is('nor does a riposte', parseToHit(P.presetById('riposte')!.text), null);
const damaging = P.ACTION_PRESETS.filter((x) => /damage/i.test(x.text) && /\d+d\d+/.test(x.text));
is('every damaging preset yields damage',
  damaging.every((x) => parseDamage(x.text) > 0), true);
is('and there are some to check', damaging.length > 8, true);

console.log('\n--- vibe check: what it admits it cannot do ---');
const multiAtk = S.defaultStatBlock();
multiAtk.entries.action = [
  { id: 'm', name: 'Multiattack', text: 'The creature makes two claw attacks.' },
  { id: 'c', name: 'Claw', text: 'Melee Weapon Attack: +4 to hit. Hit: 6 (1d8 + 2) slashing damage.' },
];
const vm = vibeCheck(multiAtk, blank);
is('multiattack is flagged, not guessed',
  vm.report.skipped.some((x) => x.toLowerCase().includes('multiattack')), true);
is('only the written damage is counted', vm.next.primary[0], 6);

const flyer = S.defaultStatBlock();
flyer.speeds = { walk: 0, burrow: 0, climb: 0, fly: 60, swim: 0, hover: false };
flyer.entries.action = [{ id: 'f', name: 'Talons', text: 'Melee Weapon Attack: +4 to hit. Hit: 5 (1d6 + 2) slashing damage.' }];
is('flying without reach does not earn the bonus',
  'flyAndRanged' in vibeCheck(flyer, blank).next.traits, false);
is('and it says why',
  vibeCheck(flyer, blank).report.skipped.some((x) => x.includes('fly speed')), true);

flyer.entries.action.push({ id: 'b', name: 'Rock', text: 'Ranged Weapon Attack: +4 to hit, range 30/120 ft. Hit: 5 (1d6 + 2) bludgeoning damage.' });
is('flying with a ranged attack does', vibeCheck(flyer, blank).next.traits['flyAndRanged'], true);

const quiet = S.defaultStatBlock();
quiet.abilities = { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
quiet.proficiencyBonus = 4;
const vq = vibeCheck(quiet, blank);
is('a silent block falls back to Strength plus proficiency', vq.next.attackBonus, 7);
is('and to 8 + proficiency + the best mental score', vq.next.saveDC, 12);
is('and admits it found no damage',
  vq.report.skipped.some((x) => x.includes('No damage')), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
