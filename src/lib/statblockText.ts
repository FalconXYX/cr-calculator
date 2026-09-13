/* Turning a stat block into text you can paste somewhere else. */

import {
  ABILITIES, ABILITY_LABEL, ACTION_KIND_HEADING, ENTRY_HEADING, ENTRY_SECTIONS,
  actionsByKind,
  languagesText, legendaryIntro, metaText, savesText, sensesText, skillsText, sign, speedText,
} from './statblock.ts';
import type { Derived, StatBlock } from './statblock.ts';

interface Line { key: string; value: string; }

/** The lines shared by both formats, so the two can never drift apart. */
function lines(sb: StatBlock, d: Derived): { top: Line[]; mid: Line[] } {
  const opt = (key: string, value: string): Line[] => (value ? [{ key, value }] : []);
  return {
    top: [
      { key: 'Armor Class', value: `${d.ac}${sb.acNote ? ` (${sb.acNote})` : ''}` },
      { key: 'Initiative', value: `${sign(d.initiativeBonus)} (${d.initiativeScore})` },
      { key: 'Hit Points', value: `${d.hp}${sb.showHitDice ? ` (${d.hitDice.text})` : ''}` },
      { key: 'Speed', value: speedText(sb.speeds) },
    ],
    mid: [
      ...opt('Saving Throws', savesText(sb, d)),
      ...opt('Skills', skillsText(sb, d)),
      ...opt('Damage Vulnerabilities', sb.vulnerabilities.join(', ')),
      ...opt('Damage Resistances', sb.resistances.join(', ')),
      ...opt('Damage Immunities', sb.damageImmunities.join(', ')),
      ...opt('Condition Immunities', sb.conditionImmunities.join(', ')),
      { key: 'Senses', value: sensesText(sb.senses, d.passivePerception) },
      { key: 'Languages', value: languagesText(sb.languages, sb.telepathy) },
      { key: 'Challenge', value: `${d.cr} (${d.xp} XP)` },
      { key: 'Proficiency Bonus', value: sign(d.pb) },
    ],
  };
}

/** Homebrewery and GM Binder both read this dialect. */
export function toMarkdown(sb: StatBlock, d: Derived): string {
  const { top, mid } = lines(sb, d);
  const out: string[] = [
    `> ## ${sb.name || 'Unnamed'}`,
    `> *${metaText(sb)}*`,
    '> ___',
    ...top.map((l) => `> - **${l.key}** ${l.value}`),
    '> ___',
    `> |${ABILITIES.map((a) => ABILITY_LABEL[a]).join('|')}|`,
    `> |${ABILITIES.map(() => ':---:').join('|')}|`,
    `> |${ABILITIES.map((a) => `${sb.abilities[a]} (${sign(d.mods[a])})`).join('|')}|`,
    '> ___',
    ...mid.map((l) => `> - **${l.key}** ${l.value}`),
    '> ___',
  ];

  const quoted = (list: typeof sb.entries.trait) => {
    for (const e of list) {
      out.push(`> ***${e.name || 'Unnamed'}.*** ${e.text.replace(/\n+/g, ' ')}`, '>');
    }
  };

  for (const section of ENTRY_SECTIONS) {
    const list = sb.entries[section];
    if (!list.length) continue;
    if (section === 'action') {
      for (const g of actionsByKind(list)) {
        out.push(`> ### ${ACTION_KIND_HEADING[g.kind]}`);
        quoted(g.entries);
      }
      continue;
    }
    const heading = ENTRY_HEADING[section];
    if (heading) out.push(`> ### ${heading}`);
    if (section === 'legendary') out.push(`> ${legendaryIntro(sb)}`, '>');
    quoted(list);
  }


  /* A trailing blockquote marker is just an empty line in the output. */
  return out.filter((l, i) => !(l === '>' && out[i + 1] === undefined)).join('\n');
}

export function toPlainText(sb: StatBlock, d: Derived): string {
  const { top, mid } = lines(sb, d);
  const out: string[] = [
    sb.name || 'Unnamed',
    metaText(sb),
    '',
    ...top.map((l) => `${l.key} ${l.value}`),
    '',
    ABILITIES.map((a) => `${ABILITY_LABEL[a]} ${sb.abilities[a]} (${sign(d.mods[a])})`).join('  '),
    '',
    ...mid.map((l) => `${l.key} ${l.value}`),
    '',
  ];

  const plain = (list: typeof sb.entries.trait) => {
    for (const e of list) out.push(`${e.name || 'Unnamed'}. ${e.text.replace(/\n+/g, ' ')}`, '');
  };

  for (const section of ENTRY_SECTIONS) {
    const list = sb.entries[section];
    if (!list.length) continue;
    if (section === 'action') {
      for (const g of actionsByKind(list)) {
        out.push(ACTION_KIND_HEADING[g.kind].toUpperCase(), '');
        plain(g.entries);
      }
      continue;
    }
    const heading = ENTRY_HEADING[section];
    if (heading) out.push(heading.toUpperCase(), '');
    if (section === 'legendary') out.push(legendaryIntro(sb), '');
    plain(list);
  }

  return out.join('\n').trimEnd();
}
