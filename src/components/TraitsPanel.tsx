import { useMemo } from 'react';
import { NumberField } from './Fields.tsx';
import { InfoButton } from './Popover.tsx';
import type { PopoverContent } from './Popover.tsx';
import { TRAITS, STAT_TRAITS, NO_EFFECT_TRAITS, SPELLCASTING_NOTE } from '../lib/traits.ts';
import type { Tier, Trait } from '../lib/types.ts';

interface Props {
  traits: Record<string, boolean>;
  traitValues: Record<string, number>;
  tier: Tier;
  search: string;
  showNoEffect: boolean;
  onSearch: (q: string) => void;
  onToggleTrait: (id: string, on: boolean) => void;
  onSetValue: (id: string, value: number) => void;
  onToggleNoEffect: () => void;
}

function TraitRow({
  trait, checked, gated, value, onToggle, onSetValue,
}: {
  trait: Trait;
  checked: boolean;
  gated: boolean;
  value: number;
  onToggle: (on: boolean) => void;
  onSetValue: (n: number) => void;
}) {
  const content: PopoverContent = {
    title: trait.name,
    ...(trait.example ? { example: trait.example } : {}),
    desc: trait.desc,
    effect: trait.effect,
    gated,
  };
  const cls = ['trait'];
  if (checked) cls.push('checked');
  if (gated) cls.push('gated');

  return (
    <div className={cls.join(' ')}>
      <label className="trait-main">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="trait-name">{trait.name}</span>
      </label>
      {trait.value && (
        <NumberField
          value={value}
          min={trait.value.min}
          max={trait.value.max}
          ariaLabel={`${trait.name} — ${trait.value.label}`}
          onCommit={onSetValue}
        />
      )}
      <InfoButton content={content} label={`What ${trait.name} does`} />
    </div>
  );
}

export function TraitsPanel({
  traits, traitValues, tier, search, showNoEffect,
  onSearch, onToggleTrait, onSetValue, onToggleNoEffect,
}: Props) {
  const q = search.trim().toLowerCase();

  const matches = useMemo(() => {
    const hit = (t: { name: string; example?: string; desc: string; effect?: string }) =>
      !q || `${t.name} ${t.example ?? ''} ${t.desc} ${t.effect ?? ''}`.toLowerCase().includes(q);
    return {
      stats: STAT_TRAITS.filter(hit),
      scoring: [...TRAITS].filter(hit).sort((a, b) => a.name.localeCompare(b.name)),
      none: NO_EFFECT_TRAITS.filter(hit),
    };
  }, [q]);

  const count = Object.values(traits).filter(Boolean).length;
  /* A search that matches the hidden group opens it, so hits are never
     silently withheld. */
  const noEffectOpen = showNoEffect || q.length > 0;
  const nothingFound =
    !matches.stats.length && !matches.scoring.length && !matches.none.length;

  const renderTrait = (trait: Trait) => (
    <TraitRow
      key={trait.id}
      trait={trait}
      checked={Boolean(traits[trait.id])}
      gated={Boolean(traits[trait.id] && trait.lowLevel && !tier.lowLevel)}
      value={traitValues[trait.id] ?? trait.value?.def ?? 0}
      onToggle={(on) => onToggleTrait(trait.id, on)}
      onSetValue={(n) => onSetValue(trait.id, n)}
    />
  );

  return (
    <section className="traits">
      <div className="colhead">
        Creature Traits &amp; Abilities
        <span className={`pill${count > 0 ? ' on' : ''}`}>{count}</span>
      </div>
      <div className="searchbar">
        <input
          type="search"
          placeholder="Search traits…"
          aria-label="Search traits"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <p className="tip">
        Hover or tap <span className="info-btn static" aria-hidden="true">i</span> for what a
        trait does and how it changes the CR.
      </p>

      <div className="trait-list">
        {matches.stats.map(renderTrait)}
        {matches.stats.length > 0 && matches.scoring.length > 0 && (
          <div className="grouphead">Traits</div>
        )}
        {matches.scoring.map(renderTrait)}

        {matches.none.length > 0 && (
          <>
            <button
              type="button"
              className="grouphead grouptoggle"
              aria-expanded={noEffectOpen}
              aria-controls="noEffectGroup"
              onClick={onToggleNoEffect}
            >
              {noEffectOpen ? '▾ ' : '▸ '}No effect on CR ({matches.none.length + 1})
            </button>
            <div className="noeffect-group" id="noEffectGroup" hidden={!noEffectOpen}>
              <div className="trait readonly">
                <span className="trait-name">{SPELLCASTING_NOTE.name}</span>
                <InfoButton
                  content={{
                    title: SPELLCASTING_NOTE.name,
                    desc: SPELLCASTING_NOTE.desc,
                    effect: SPELLCASTING_NOTE.effect,
                  }}
                  label="How to handle spellcasting"
                />
              </div>
              {matches.none.map((t) => (
                <div className="trait readonly" key={t.name}>
                  <span className="trait-name">{t.name}</span>
                  <InfoButton
                    content={{
                      title: t.name,
                      ...(t.example ? { example: t.example } : {}),
                      desc: t.desc,
                      effect: 'None. This trait does not change the challenge rating.',
                    }}
                    label={`What ${t.name} does`}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {nothingFound && <p className="tip">No traits match “{search}”.</p>}
      </div>
    </section>
  );
}
