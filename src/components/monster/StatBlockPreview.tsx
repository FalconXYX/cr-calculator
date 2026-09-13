import type { ReactNode } from 'react';
import {
  ABILITIES, ABILITY_LABEL, ACTION_KIND_HEADING, ENTRY_HEADING, ENTRY_SECTIONS,
  actionsByKind,
  languagesText, legendaryIntro, metaText, savesText, sensesText, skillsText, sign, speedText,
} from '../../lib/statblock.ts';
import type { Derived, Entry, EntrySection, StatBlock } from '../../lib/statblock.ts';

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sb-line">
      <span className="sb-key">{label}</span> {children}
    </div>
  );
}

/** A blank line is left out entirely rather than printed with an em dash. */
function OptLine({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return <Line label={label}>{value}</Line>;
}

/** Entry bodies are free text, so honour the paragraph breaks the user typed. */
function Body({ text }: { text: string }) {
  const paras = text.split(/\n{2,}/).filter((p) => p.trim());
  if (!paras.length) return null;
  return (
    <>
      {paras.map((p, i) => (
        <span key={i} className={i ? 'sb-para' : undefined}>
          {p.split('\n').map((l, j) => (j ? <span key={j}><br />{l}</span> : l))}
        </span>
      ))}
    </>
  );
}

function Entries({ list }: { list: Entry[] }) {
  return (
    <>
      {list.map((e) => (
        <p className="sb-entry" key={e.id}>
          <b className="sb-entry-name">{e.name || 'Unnamed'}.</b>{' '}
          <Body text={e.text} />
        </p>
      ))}
    </>
  );
}

function EntryGroup({ sb, section }: { sb: StatBlock; section: EntrySection }) {
  const list = sb.entries[section];
  if (!list.length) return null;

  /* One authored list, printed under the heading each entry belongs to. */
  if (section === 'action') {
    return (
      <>
        {actionsByKind(list).map((g) => (
          <div key={g.kind}>
            <h3 className="sb-head">{ACTION_KIND_HEADING[g.kind]}</h3>
            <Entries list={g.entries} />
          </div>
        ))}
      </>
    );
  }

  const heading = ENTRY_HEADING[section];
  return (
    <>
      {heading && <h3 className="sb-head">{heading}</h3>}
      {section === 'legendary' && <p className="sb-entry">{legendaryIntro(sb)}</p>}
      <Entries list={list} />
    </>
  );
}

interface Props { sb: StatBlock; d: Derived; }

export function StatBlockPreview({ sb, d }: Props) {
  const saves = savesText(sb, d);
  const skills = skillsText(sb, d);

  return (
    <article className="sb" aria-label="Stat block preview">
      <h2 className="sb-name">{sb.name || 'Unnamed'}</h2>
      <p className="sb-meta">{metaText(sb)}</p>
      <div className="sb-rule" />

      <Line label="Armor Class">
        {d.ac}{sb.acNote && ` (${sb.acNote})`}
      </Line>
      <Line label="Initiative">
        {sign(d.initiativeBonus)} ({d.initiativeScore})
      </Line>
      <Line label="Hit Points">
        {d.hp}{sb.showHitDice && ` (${d.hitDice.text})`}
      </Line>
      <Line label="Speed">{speedText(sb.speeds)}</Line>

      <div className="sb-rule" />
      <table className="sb-abilities">
        <thead>
          <tr>{ABILITIES.map((a) => <th key={a} scope="col">{ABILITY_LABEL[a]}</th>)}</tr>
        </thead>
        <tbody>
          <tr>
            {ABILITIES.map((a) => (
              <td key={a}>{sb.abilities[a]} ({sign(d.mods[a])})</td>
            ))}
          </tr>
        </tbody>
      </table>
      <div className="sb-rule" />

      <OptLine label="Saving Throws" value={saves} />
      <OptLine label="Skills" value={skills} />
      <OptLine label="Damage Vulnerabilities" value={sb.vulnerabilities.join(', ')} />
      <OptLine label="Damage Resistances" value={sb.resistances.join(', ')} />
      <OptLine label="Damage Immunities" value={sb.damageImmunities.join(', ')} />
      <OptLine label="Condition Immunities" value={sb.conditionImmunities.join(', ')} />
      <Line label="Senses">{sensesText(sb.senses, d.passivePerception)}</Line>
      <Line label="Languages">{languagesText(sb.languages, sb.telepathy)}</Line>
      <Line label="Challenge">{d.cr} ({d.xp} XP)</Line>
      <Line label="Proficiency Bonus">{sign(d.pb)}</Line>

      <div className="sb-rule" />
      {ENTRY_SECTIONS.map((s) => <EntryGroup key={s} sb={sb} section={s} />)}

    </article>
  );
}
