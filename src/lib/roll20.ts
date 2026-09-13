/* Export to the JSON Roll20 accepts when you drag a file onto a character.
   Shape reverse-engineered from ianjsikes' unofficial importer for
   Giffyglyph's Monster Maker: https://gist.github.com/ianjsikes/7578a03a6c06c2a2c5abe2805f4510d0 */

import {
  ABILITIES, ACTION_KIND_LABEL, SKILLS, actionsByKind, kindOf,
  languagesText, legendaryIntro, metaText, sensesText, speedText,
} from './statblock.ts';
import type { Ability, Derived, StatBlock } from './statblock.ts';
import { parseSaveDC, parseToHit } from './vibeCheck.ts';

/* Roll20's own id scheme: a time-ordered prefix plus a random tail, over a
   64-character alphabet. Sequential calls in the same millisecond carry a
   counter so ids never collide. */
const ALPHABET = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

function makeUuidGenerator(): () => string {
  let previous = 0;
  const tail: number[] = [];
  return function generateUUID(): string {
    let now = Date.now();
    const sameMs = now === previous;
    previous = now;

    const head = new Array<string>(8);
    for (let i = 7; i >= 0; i--) {
      head[i] = ALPHABET.charAt(now % 64);
      now = Math.floor(now / 64);
    }
    let out = head.join('');

    if (sameMs) {
      let i = 11;
      for (; i >= 0 && tail[i] === 63; i--) tail[i] = 0;
      if (i >= 0) tail[i] = (tail[i] ?? 0) + 1;
    } else {
      for (let i = 0; i < 12; i++) tail[i] = Math.floor(64 * Math.random());
    }
    for (let i = 0; i < 12; i++) out += ALPHABET.charAt(tail[i] ?? 0);
    return out;
  };
}

export interface Roll20Attrib {
  name: string;
  current: string | number;
  max: string | number;
  id: string;
}

export interface Roll20Character {
  schema_version: number;
  oldId: string;
  name: string;
  avatar: string;
  bio: string;
  gmnotes: string;
  defaulttoken: string;
  tags: string;
  controlledby: string;
  inplayerjournals: string;
  attribs: Roll20Attrib[];
  abilities: unknown[];
}

/** Roll20 measures tokens in squares, and size decides how many. */
const TOKEN_SQUARES: Record<string, number> = {
  tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4,
};

/** Roll20's attribute keys for the skills, which are snake_case throughout. */
const ROLL20_SKILL: Record<string, string> = Object.fromEntries(
  SKILLS.map((s) => [s.id, s.name.toLowerCase().replace(/\s+/g, '_')]));

const ABILITY_FULL: Record<Ability, string> = {
  str: 'strength', dex: 'dexterity', con: 'constitution',
  int: 'intelligence', wis: 'wisdom', cha: 'charisma',
};

/** Roll20's NPC sheet has no bonus-action or lair-action list of its own. */
function actionRows(sb: StatBlock): { name: string; detail: string }[] {
  const rows: { name: string; detail: string }[] = [];
  for (const group of actionsByKind(sb.entries.action)) {
    if (group.kind === 'reaction') continue;
    for (const e of group.entries) {
      const suffix = group.kind === 'bonus' ? ` (${ACTION_KIND_LABEL.bonus})` : '';
      rows.push({ name: `${e.name || 'Unnamed'}${suffix}`, detail: e.text });
    }
  }
  for (const e of sb.entries.lair) {
    rows.push({ name: `${e.name || 'Unnamed'} (Lair Action)`, detail: e.text });
  }
  return rows;
}

export function toRoll20(sb: StatBlock, d: Derived): Roll20Character {
  const uuid = makeUuidGenerator();
  /* Repeating-row ids may not contain an underscore: Roll20 splits the
     attribute name on it. */
  const rowId = () => uuid().replace(/_/g, 'Z');

  const squares = TOKEN_SQUARES[sb.size.toLowerCase()] ?? 1;
  const oldId = uuid();

  const obj: Roll20Character = {
    schema_version: 2,
    oldId,
    name: sb.name || 'Unnamed',
    avatar: '',
    bio: metaText(sb),
    gmnotes: '',
    defaulttoken: '',
    tags: JSON.stringify([]),
    controlledby: '',
    inplayerjournals: '',
    attribs: [],
    abilities: [],
  };

  const set = (name: string, current: string | number, max: string | number = '') => {
    obj.attribs.push({ name, current, max, id: uuid() });
  };

  /* Sheet plumbing. These are what make the NPC sheet render at all. */
  set('npc_options-flag', '0');
  set('npc', 1);
  set('l1mancer_status', 'completed');
  set('rtype', '{{always=1}} {{r2=[[1d20');
  set('wtype', '@{whispertoggle}');
  set('dtype', 'full');
  set('init_tiebreaker', '@{dexterity}/100');
  set('global_save_mod_flag', 1);
  set('global_skill_mod_flag', 1);
  set('global_attack_mod_flag', 1);
  set('global_damage_mod_flag', 1);
  set('charname_output', '{{charname=@{character_name}}}');
  set('npc_name_flag', 0);
  set('showleveler', 0);
  set('invalidXP', 0);
  set('reaction_flag', 0);

  set('cd_bar1_m', d.hp);
  set('cd_bar1_v', d.hp);
  set('cd_bar2_v', d.ac);
  set('token_size', squares);

  set('npc_name', obj.name);
  set('npc_sizebase', sb.size);
  set('npc_typebase', sb.type);
  set('npc_alignmentbase', sb.alignment);
  set('npc_type', metaText(sb));

  set('npc_ac', d.ac);
  if (sb.acNote) set('npc_actype', sb.acNote);

  const formula = sb.showHitDice ? d.hitDice.text : '';
  set('hp', '', d.hp);
  set('npc_hpbase', formula ? `${d.hp} (${formula})` : String(d.hp));
  set('npcd_hp', d.hp);
  if (formula) {
    set('npc_hpformula', formula);
    set('npcd_hpformula', `(${formula})`);
  }

  set('npc_speed', speedText(sb.speeds));
  set('initiative_bonus', d.initiativeBonus);

  for (const a of ABILITIES) {
    const full = ABILITY_FULL[a];
    set(`${full}_base`, sb.abilities[a]);
    set(full, sb.abilities[a]);
    set(`${full}_mod`, d.mods[a]);
    if (sb.saves.includes(a)) {
      set(`npc_${a}_save`, d.saveBonus[a]);
      set(`npcd_${a}_save`, d.saveBonus[a]);
      set(`npc_${a}_save_flag`, 1);
      set(`npc_${a}_save_base`, d.saveBonus[a]);
    }
  }
  set('npc_saving_flag', 1);

  for (const [id, bonus] of Object.entries(d.skillBonus)) {
    const key = ROLL20_SKILL[id];
    if (!key) continue;
    set(`${key}_bonus`, bonus);
    set(`npc_${key}`, bonus);
    set(`npc_${key}_base`, bonus);
    set(`npc_${key}_flag`, 1);
  }
  set('npc_skills_flag', 1);

  set('npc_vulnerabilities', sb.vulnerabilities.join(', '));
  set('npc_resistances', sb.resistances.join(', '));
  set('npc_immunities', sb.damageImmunities.join(', '));
  set('npc_condition_immunities', sb.conditionImmunities.join(', '));

  set('npc_senses', sensesText(sb.senses, d.passivePerception));
  set('npc_languages', languagesText(sb.languages, sb.telepathy));
  set('npc_challenge', d.cr);
  set('npc_xp', d.xp.replace(/,/g, ''));

  /* Neither is written down anywhere in the block, so take whatever the
     actions state, the same way the vibe check does. */
  const text = [...sb.entries.trait, ...sb.entries.action,
    ...sb.entries.legendary, ...sb.entries.lair]
    .map((e) => `${e.name} ${e.text}`).join('\n');
  set('npcspellcastingflag', 0);
  set('npc_spelldc', parseSaveDC(text) ?? 8 + d.pb);
  set('npc_spellattackmod', parseToHit(text) ?? d.pb);

  const reactions = sb.entries.action.filter((e) => kindOf(e) === 'reaction');
  set('npcreactionsflag', reactions.length ? 1 : 0);
  set('npc_legendary_actions', sb.entries.legendary.length ? sb.legendaryCount : 0);

  const row = (prefix: string, name: string, detailKey: string, detail: string) => {
    const id = rowId();
    set(`repeating_${prefix}_${id}_name`, name);
    set(`repeating_${prefix}_${id}_${detailKey}`, detail);
  };

  for (const t of sb.entries.trait) row('npctrait', t.name || 'Unnamed', 'desc', t.text);
  for (const a of actionRows(sb)) row('npcaction', a.name, 'description', a.detail);
  for (const r of reactions) row('npcreaction', r.name || 'Unnamed', 'description', r.text);
  if (sb.entries.legendary.length) {
    row('npcaction-l', 'Legendary Actions', 'description', legendaryIntro(sb));
    for (const l of sb.entries.legendary) {
      row('npcaction-l', l.name || 'Unnamed', 'description', l.text);
    }
  }

  obj.defaulttoken = JSON.stringify({
    width: squares * 70,
    height: squares * 70,
    bar1_value: d.hp,
    bar1_max: d.hp,
    bar2_value: d.ac,
    represents: oldId,
    name: obj.name,
    imgsrc: '/images/character.png',
  });

  return obj;
}

export const toRoll20Json = (sb: StatBlock, d: Derived): string =>
  JSON.stringify(toRoll20(sb, d), null, 2);

/** A filename Roll20 and every filesystem will accept. */
export const roll20Filename = (sb: StatBlock): string =>
  `${(sb.name || 'monster').replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '_') || 'monster'}.json`;
