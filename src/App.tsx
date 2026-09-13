import { useCallback, useEffect, useMemo, useState } from 'react';
import { compute, tierById } from './lib/engine.ts';
import type { CalcState, TierId } from './lib/types.ts';
import { usePersistentState, readStored, writeStored } from './hooks/usePersistentState.ts';
import { PopoverProvider } from './components/Popover.tsx';
import { TitleBar } from './components/TitleBar.tsx';
import { BaselineStrip } from './components/BaselineStrip.tsx';
import { vibeCheck } from './lib/vibeCheck.ts';
import type { VibeReport } from './lib/vibeCheck.ts';
import { StatsPanel } from './components/StatsPanel.tsx';
import { TraitsPanel } from './components/TraitsPanel.tsx';
import { MonsterMaker } from './components/MonsterMaker.tsx';
import { MonsterMakerBody } from './components/monster/MonsterMakerBody.tsx';
import { defaultStatBlock, reviveStatBlock } from './lib/statblock.ts';
import type { StatBlock } from './lib/statblock.ts';
import { ReferencePanel } from './components/ReferencePanel.tsx';
import { OverallBar } from './components/OverallBar.tsx';

const STATE_KEY = 'cr-calc-state-v3';
const THEME_KEY = 'cr-calc-theme';
const REF_KEY = 'cr-calc-ref-open';
const MONSTER_KEY = 'cr-calc-monster-open';
const STATBLOCK_KEY = 'cr-calc-statblock-v1';
const PROFILE_KEY = 'cr-calc-profiles';

const DEFAULTS: CalcState = {
  tierId: '0-4',
  ac: 13,
  hp: 75,
  attackBonus: 4,
  saveDC: 12,
  extraDamage: 0,
  roundCount: 1,
  primary: [5, 0, 0, 0, 0, 0],
  secondary: [5, 0, 0, 0, 0, 0],
  traits: {},
  traitValues: {},
};

/** Saved state may predate a field, so merge rather than trust it wholesale. */
function reviveState(raw: unknown): CalcState {
  const saved = (raw ?? {}) as Partial<CalcState>;
  return {
    ...DEFAULTS,
    ...saved,
    traits: { ...(saved.traits ?? {}) },
    traitValues: { ...(saved.traitValues ?? {}) },
    primary: Array.isArray(saved.primary) ? saved.primary.slice(0, 6) : [...DEFAULTS.primary],
    secondary: Array.isArray(saved.secondary) ? saved.secondary.slice(0, 6) : [...DEFAULTS.secondary],
  };
}

export default function App() {
  const [state, setState] = usePersistentState<CalcState>(STATE_KEY, DEFAULTS, reviveState);
  const [search, setSearch] = useState('');
  const [vibeReport, setVibeReport] = useState<VibeReport | null>(null);
  const [showNoEffect, setShowNoEffect] = useState(false);

  /* Chrome preferences live in their own keys, not the calculation state, so
     loading a profile does not yank the theme or the reference panel about. */
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = readStored<string | null>(THEME_KEY, null);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [refOpen, setRefOpen] = useState(() => readStored<boolean>(REF_KEY, false));
  const [monsterOpen, setMonsterOpen] = useState(() => readStored<boolean>(MONSTER_KEY, false));
  const [statblock, setStatblock] = usePersistentState<StatBlock>(
    STATBLOCK_KEY, defaultStatBlock(), reviveStatBlock);

  const [profiles, setProfiles] = useState<Record<string, CalcState>>(
    () => readStored<Record<string, CalcState>>(PROFILE_KEY, {}));
  const [currentProfile, setCurrentProfile] = useState('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeStored(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => { writeStored(REF_KEY, refOpen); }, [refOpen]);
  useEffect(() => { writeStored(MONSTER_KEY, monsterOpen); }, [monsterOpen]);

  const set = useCallback(<K extends keyof CalcState>(key: K, value: CalcState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, [setState]);

  const setDamage = useCallback((which: 'primary' | 'secondary', index: number, value: number) => {
    setState((prev) => {
      const next = [...prev[which]];
      next[index] = value;
      return { ...prev, [which]: next };
    });
  }, [setState]);

  const addRound = useCallback(() => {
    setState((prev) => ({ ...prev, roundCount: Math.min(6, prev.roundCount + 1) }));
  }, [setState]);

  const removeRound = useCallback(() => {
    setState((prev) => ({ ...prev, roundCount: Math.max(1, prev.roundCount - 1) }));
  }, [setState]);

  const toggleTrait = useCallback((id: string, on: boolean) => {
    setState((prev) => {
      const traits = { ...prev.traits };
      if (on) traits[id] = true;
      else delete traits[id];
      return { ...prev, traits };
    });
  }, [setState]);

  const setTraitValue = useCallback((id: string, value: number) => {
    setState((prev) => ({ ...prev, traitValues: { ...prev.traitValues, [id]: value } }));
  }, [setState]);

  const result = useMemo(() => compute({
    tierId: state.tierId,
    ac: state.ac,
    hp: state.hp,
    damageResistance: Boolean(state.traits.damageResistance),
    damageImmunity: Boolean(state.traits.damageImmunity),
    flyAndRanged: Boolean(state.traits.flyAndRanged),
    saveProficiencies: state.traits.saveProficiencies
      ? (state.traitValues.saveProficiencies ?? 3)
      : 0,
    attackBonus: state.attackBonus,
    saveDC: state.saveDC,
    offenseBy: 'auto',
    damageMode: 'rounds',
    roundCount: state.roundCount,
    rounds: Array.from({ length: state.roundCount }, (_, i) =>
      (state.primary[i] ?? 0) + (state.secondary[i] ?? 0)),
    extraDamage: state.extraDamage,
    traits: state.traits,
    traitValues: state.traitValues,
  }), [state]);

  /* ---- Profiles ---- */

  const persistProfiles = useCallback((next: Record<string, CalcState>) => {
    setProfiles(next);
    writeStored(PROFILE_KEY, next);
  }, []);

  const saveProfile = useCallback(() => {
    const suggested = currentProfile || `Monster ${Object.keys(profiles).length + 1}`;
    const name = window.prompt('Save this calculation as:', suggested)?.trim();
    if (!name) return;
    persistProfiles({ ...profiles, [name]: state });
    setCurrentProfile(name);
  }, [currentProfile, profiles, state, persistProfiles]);

  const loadProfile = useCallback((name: string) => {
    if (!name) { setCurrentProfile(''); return; }
    const saved = profiles[name];
    if (!saved) return;
    setState(reviveState(saved));
    setCurrentProfile(name);
    setSearch('');
  }, [profiles, setState]);

  const deleteProfile = useCallback(() => {
    if (!currentProfile) return;
    if (!window.confirm(`Delete the profile “${currentProfile}”?`)) return;
    const next = { ...profiles };
    delete next[currentProfile];
    persistProfiles(next);
    setCurrentProfile('');
  }, [currentProfile, profiles, persistProfiles]);

  /* Reads the block below and overwrites the calculator with it. The report
     of what it could and could not work out goes in the space under Offensive
     CR — anywhere above the panes it would take its height out of the trait
     list, since the calculator is pinned to exactly one screen. */
  const runVibeCheck = useCallback(() => {
    const { next, report } = vibeCheck(statblock, state);
    setState(next);
    setVibeReport(report);
    setCurrentProfile('');
  }, [statblock, state, setState]);

  const reset = useCallback(() => {
    setState(structuredClone(DEFAULTS));
    setCurrentProfile('');
    setSearch('');
    setVibeReport(null);
  }, [setState]);

  const profileNames = useMemo(
    () => Object.keys(profiles).sort((a, b) => a.localeCompare(b)),
    [profiles]);

  return (
    <PopoverProvider>
      <div className={`app${refOpen ? ' ref-open' : ''}`}>
        <div className="panel calc">
          <TitleBar
            tierId={state.tierId}
            onTier={(id: TierId) => set('tierId', id)}
            theme={theme}
            onTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            onReset={reset}
            onVibeCheck={runVibeCheck}
            profileNames={profileNames}
            currentProfile={currentProfile}
            onLoadProfile={loadProfile}
            onSaveProfile={saveProfile}
            onDeleteProfile={deleteProfile}
          />
          <BaselineStrip tier={tierById(state.tierId)} />

          <div className="panes">
            <StatsPanel
              state={state}
              result={result}
              set={set}
              onSetDamage={setDamage}
              onAddRound={addRound}
              onRemoveRound={removeRound}
              vibeReport={vibeReport}
              onDismissVibe={() => setVibeReport(null)}
            />
            <TraitsPanel
              traits={state.traits}
              traitValues={state.traitValues}
              tier={result.tier}
              search={search}
              showNoEffect={showNoEffect}
              onSearch={setSearch}
              onToggleTrait={toggleTrait}
              onSetValue={setTraitValue}
              onToggleNoEffect={() => setShowNoEffect((v) => !v)}
            />
          </div>

          <OverallBar result={result} />
        </div>

        <MonsterMaker
          open={monsterOpen}
          onToggle={() => setMonsterOpen((v) => !v)}
        >
          <MonsterMakerBody
            sb={statblock}
            onChange={setStatblock}
            row={result.final.row}
          />
        </MonsterMaker>

        <ReferencePanel
          open={refOpen}
          onToggle={() => setRefOpen((v) => !v)}
          currentCr={result.final.row.cr}
        />
      </div>
    </PopoverProvider>
  );
}
