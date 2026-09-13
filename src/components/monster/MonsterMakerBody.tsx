import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ABILITIES, ABILITY_LABEL, ALIGNMENTS, CONDITIONS, CREATURE_TYPES, DAMAGE_TYPES,
  NEXT_TIER, LANGUAGES, SIZES, SKILLS,
  UNUSUAL_CONDITION_IMMUNITIES, UNUSUAL_DAMAGE_IMMUNITIES, UNUSUAL_RESISTANCES,
  abilityMod, derive, sign, unusualPicks,
} from '../../lib/statblock.ts';
import type {
  Ability, EntrySection, Entry, ProficiencyTier, SizeId, StatBlock,
} from '../../lib/statblock.ts';
import type { CrRow } from '../../lib/types.ts';
import { toMarkdown, toPlainText } from '../../lib/statblockText.ts';
import { roll20Filename, toRoll20Json } from '../../lib/roll20.ts';
import { StatBlockPreview } from './StatBlockPreview.tsx';
import {
  CheckField, ChipPicker, EntryList, NumField, Section, SelectField,
  TextField, TierPicker, Warnings,
} from './EditorBits.tsx';
import type { TierRow } from './EditorBits.tsx';

/** Initiative shares the skills list, so it needs an id that no skill uses. */
const INITIATIVE_ID = '@initiative';

interface Props {
  sb: StatBlock;
  onChange: (next: StatBlock) => void;
  row: CrRow;
}

export function MonsterMakerBody({ sb, onChange, row }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));

  const d = useMemo(() => derive(sb, row), [sb, row]);

  /* "Copied" is a transient label on the button that pressed it. The timer is
     held in a ref so a second press restarts it instead of stacking. */
  const [copied, setCopied] = useState<'md' | 'txt' | 'fail' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback((which: 'md' | 'txt') => {
    const text = which === 'md' ? toMarkdown(sb, d) : toPlainText(sb, d);
    clearTimeout(timer.current);
    void navigator.clipboard.writeText(text)
      .then(() => setCopied(which))
      .catch(() => setCopied('fail'))
      .finally(() => { timer.current = setTimeout(() => setCopied(null), 1600); });
  }, [sb, d]);

  /* Roll20 imports a file, not pasted text, so this one downloads. */
  const downloadRoll20 = useCallback(() => {
    const blob = new Blob([toRoll20Json(sb, d)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = roll20Filename(sb);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [sb, d]);

  const set = <K extends keyof StatBlock>(key: K, value: StatBlock[K]) => {
    onChange({ ...sb, [key]: value });
  };
  const setEntries = (section: EntrySection, list: Entry[]) => {
    onChange({ ...sb, entries: { ...sb.entries, [section]: list } });
  };
  /* Initiative rides with the skills: it is the same kind of d20 check, and
     a creature can be proficient or expert at it the same way. */
  const checkRows: TierRow[] = [
    {
      id: INITIATIVE_ID,
      name: 'Initiative (Dex)',
      tier: sb.initiative,
      bonus: d.initiativeBonus,
    },
    ...SKILLS.map((skill) => ({
      id: skill.id,
      name: skill.name,
      tier: sb.skills[skill.id] ?? ('none' as ProficiencyTier),
      bonus: d.skillBonus[skill.id] ?? d.mods[skill.ability],
    })),
  ];

  const trainedCount = checkRows.filter((r) => r.tier !== 'none').length;

  const cycleCheck = (id: string) => {
    if (id === INITIATIVE_ID) { set('initiative', NEXT_TIER[sb.initiative]); return; }
    const next = NEXT_TIER[sb.skills[id] ?? 'none'];
    const skills = { ...sb.skills };
    if (next === 'none') delete skills[id];
    else skills[id] = next;
    set('skills', skills);
  };

  const sec = (id: string, title: string, count?: number) => ({
    title, count, open: open === id, onToggle: () => toggle(id),
  });

  /* The hit dice are chosen to land as close to the hit points as they can,
     but the dice are integers, so an exact match is not always available. */
  const diceGap = d.hitDice.average - d.hp;

  return (
    <div className="mm-panes">
      <div className="mm-editor">
        <Section {...sec('description', 'Description')}>
          <TextField label="Name" value={sb.name} onChange={(v) => set('name', v)} placeholder="Monster" />
          <SelectField
            label="Size" value={sb.size} options={SIZES}
            onChange={(v) => set('size', v as SizeId)}
          />
          <SelectField
            label="Type" value={sb.type} options={CREATURE_TYPES}
            onChange={(v) => set('type', v)}
          />
          <SelectField
            label="Alignment" value={sb.alignment} options={ALIGNMENTS}
            onChange={(v) => set('alignment', v)}
          />
        </Section>

        <Section {...sec('armor', 'Armor')}>
          <NumField label="Armor Class" value={sb.acValue} min={0} max={40}
            onChange={(n) => set('acValue', n)} />
          <TextField
            label="Note" value={sb.acNote} onChange={(v) => set('acNote', v)}
            placeholder="Natural Armor"
          />
        </Section>

        <Section {...sec('hp', 'Hit Points')}>
          <NumField label="Hit Points" value={sb.hpValue} min={1} max={2000}
            onChange={(n) => set('hpValue', n)} />
          <CheckField label="Show hit dice" checked={sb.showHitDice} onChange={(b) => set('showHitDice', b)} />
          {sb.showHitDice && (
            <p className="mm-note">
              <b>{d.hitDice.text}</b> — {d.hitDice.count} {sb.size.toLowerCase()} dice at
              Constitution {sign(d.mods.con)}.
              {diceGap !== 0 && <> These average <b>{d.hitDice.average}</b>, {Math.abs(diceGap)} {diceGap > 0 ? 'above' : 'below'} the stated hit points.</>}
            </p>
          )}
        </Section>

        <Section {...sec('speed', 'Speed')}>
          <NumField label="Walk" value={sb.speeds.walk} min={0} max={200} suffix="ft."
            onChange={(n) => set('speeds', { ...sb.speeds, walk: n })} />
          <NumField label="Burrow" value={sb.speeds.burrow} min={0} max={200} suffix="ft."
            onChange={(n) => set('speeds', { ...sb.speeds, burrow: n })} />
          <NumField label="Climb" value={sb.speeds.climb} min={0} max={200} suffix="ft."
            onChange={(n) => set('speeds', { ...sb.speeds, climb: n })} />
          <NumField label="Fly" value={sb.speeds.fly} min={0} max={200} suffix="ft."
            onChange={(n) => set('speeds', { ...sb.speeds, fly: n })} />
          <NumField label="Swim" value={sb.speeds.swim} min={0} max={200} suffix="ft."
            onChange={(n) => set('speeds', { ...sb.speeds, swim: n })} />
          <CheckField label="Can hover" checked={sb.speeds.hover}
            onChange={(b) => set('speeds', { ...sb.speeds, hover: b })} />
        </Section>

        <Section {...sec('abilities', 'Ability Scores')}>
          <div className="mm-ability-grid">
            {ABILITIES.map((a) => (
              <div className="mm-ability" key={a}>
                <NumField
                  label={ABILITY_LABEL[a]} value={sb.abilities[a]} min={1} max={30}
                  onChange={(n) => set('abilities', { ...sb.abilities, [a]: n })}
                />
                <span className="mm-mod">{sign(abilityMod(sb.abilities[a]))}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section {...sec('saves', 'Saving Throws', sb.saves.length)}>
          <p className="mm-note">Proficient saves add the proficiency bonus of {sign(d.pb)}.</p>
          <ChipPicker
            options={ABILITIES.map((a) => ABILITY_LABEL[a])}
            selected={sb.saves.map((a) => ABILITY_LABEL[a])}
            onChange={(labels) => set('saves',
              ABILITIES.filter((a) => labels.includes(ABILITY_LABEL[a])) as Ability[])}
          />
        </Section>

        <Section {...sec('skills', 'Skills & Initiative', trainedCount)}>
          <p className="mm-note">
            Click once for proficiency, again for expertise. Each check adds the
            proficiency bonus of {sign(sb.proficiencyBonus)} to its own ability —
            twice over, for expertise.
          </p>
          <TierPicker rows={checkRows} onCycle={cycleCheck} />
        </Section>

        <Section {...sec('vuln', 'Vulnerabilities', sb.vulnerabilities.length)}>
          <ChipPicker options={DAMAGE_TYPES} selected={sb.vulnerabilities} custom
            onChange={(v) => set('vulnerabilities', v)} />
        </Section>

        <Section {...sec('resist', 'Resistances', sb.resistances.length)}>
          <ChipPicker options={DAMAGE_TYPES} selected={sb.resistances} custom
            onChange={(v) => set('resistances', v)} />
          <Warnings picks={unusualPicks(sb.resistances, UNUSUAL_RESISTANCES)} />
        </Section>

        <Section {...sec('dmgImm', 'Immunities (Damage)', sb.damageImmunities.length)}>
          <ChipPicker options={DAMAGE_TYPES} selected={sb.damageImmunities} custom
            onChange={(v) => set('damageImmunities', v)} />
          <Warnings picks={unusualPicks(sb.damageImmunities, UNUSUAL_DAMAGE_IMMUNITIES)} />
        </Section>

        <Section {...sec('condImm', 'Immunities (Conditions)', sb.conditionImmunities.length)}>
          <ChipPicker options={CONDITIONS} selected={sb.conditionImmunities} custom
            onChange={(v) => set('conditionImmunities', v)} />
          <Warnings picks={unusualPicks(sb.conditionImmunities, UNUSUAL_CONDITION_IMMUNITIES)} />
        </Section>

        <Section {...sec('senses', 'Senses')}>
          <NumField label="Darkvision" value={sb.senses.darkvision} min={0} max={500} suffix="ft."
            onChange={(n) => set('senses', { ...sb.senses, darkvision: n })} />
          <NumField label="Blindsight" value={sb.senses.blindsight} min={0} max={500} suffix="ft."
            onChange={(n) => set('senses', { ...sb.senses, blindsight: n })} />
          {sb.senses.blindsight > 0 && (
            <CheckField label="Blind beyond this radius" checked={sb.senses.blindBeyond}
              onChange={(b) => set('senses', { ...sb.senses, blindBeyond: b })} />
          )}
          <NumField label="Tremorsense" value={sb.senses.tremorsense} min={0} max={500} suffix="ft."
            onChange={(n) => set('senses', { ...sb.senses, tremorsense: n })} />
          <NumField label="Truesight" value={sb.senses.truesight} min={0} max={500} suffix="ft."
            onChange={(n) => set('senses', { ...sb.senses, truesight: n })} />
          <p className="mm-note">
            Passive Perception <b>{d.passivePerception}</b> — 10 + Wisdom {sign(d.mods.wis)}
            {sb.skills['perception'] && <>, with Perception {sb.skills['perception']}</>}.
          </p>
        </Section>

        <Section {...sec('languages', 'Languages', sb.languages.length)}>
          <ChipPicker options={LANGUAGES} selected={sb.languages} custom
            onChange={(v) => set('languages', v)} />
          <NumField label="Telepathy" value={sb.telepathy} min={0} max={500} suffix="ft."
            onChange={(n) => set('telepathy', n)} />
        </Section>

        <Section {...sec('challenge', 'Challenge')}>
          <NumField label="Proficiency" value={sb.proficiencyBonus} min={2} max={9}
            onChange={(n) => set('proficiencyBonus', n)} />
          <p className="mm-note">
            The block's own bonus, used for its saves and skills.
            {d.crPb !== d.pb && (
              <>
                {' '}The calculator's CR of {d.cr} would imply {sign(d.crPb)}.{' '}
                <button type="button" className="mini"
                  onClick={() => set('proficiencyBonus', d.crPb)}>
                  Use {sign(d.crPb)}
                </button>
              </>
            )}
          </p>
          <div className="mm-readout">
            <span>Calculator says</span><b>CR {d.cr}</b>
            <span>XP</span><b>{d.xp}</b>
          </div>
          <p className="mm-note">
            Build the monster here, then press <b>Vibe Check CR</b> up in the
            calculator to score it.
          </p>
        </Section>

        <Section {...sec('traits', 'Traits', sb.entries.trait.length)}>
          <EntryList
            entries={sb.entries.trait} onChange={(l) => setEntries('trait', l)}
            addLabel="Add trait" namePlaceholder="Pack Tactics"
            textPlaceholder="What the trait does at the table."
          />
        </Section>

        <Section {...sec('actions', 'Actions', sb.entries.action.length)}>
          <p className="mm-note">
            Mark each one as an action, a bonus action or a reaction. The block
            files them under the right heading. “Load a preset” fills the entry
            you are working on, to edit from there.
          </p>
          <EntryList
            kinded
            entries={sb.entries.action} onChange={(l) => setEntries('action', l)}
            addLabel="Add action" namePlaceholder="Greatsword"
            textPlaceholder="Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 10 (2d6 + 3) slashing damage."
          />
        </Section>

        <Section {...sec('legendary', 'Legendary Actions', sb.entries.legendary.length)}>
          <NumField label="Actions per round" value={sb.legendaryCount} min={1} max={5}
            onChange={(n) => set('legendaryCount', n)} />
          <p className="mm-note">The standard preamble is written for you in the block.</p>
          <EntryList
            entries={sb.entries.legendary} onChange={(l) => setEntries('legendary', l)}
            addLabel="Add legendary action" namePlaceholder="Detect"
            textPlaceholder="The creature makes a Wisdom (Perception) check."
          />
        </Section>

        <Section {...sec('lair', 'Lair Actions', sb.entries.lair.length)}>
          <EntryList
            entries={sb.entries.lair} onChange={(l) => setEntries('lair', l)}
            addLabel="Add lair action" namePlaceholder="Grasping Roots"
            textPlaceholder="What happens on initiative count 20."
          />
        </Section>

      </div>

      <div className="mm-preview">
        <div className="mm-tools">
          <button type="button" className="mini" onClick={() => copy('md')}>
            {copied === 'md' ? 'Copied' : 'Copy Markdown'}
          </button>
          <button type="button" className="mini" onClick={() => copy('txt')}>
            {copied === 'txt' ? 'Copied' : 'Copy text'}
          </button>
          <button type="button" className="mini" onClick={downloadRoll20}>
            Roll20 JSON
          </button>
          {copied === 'fail' && <span className="mm-note">Clipboard blocked by the browser.</span>}
        </div>
        <StatBlockPreview sb={sb} d={d} />
      </div>
    </div>
  );
}
