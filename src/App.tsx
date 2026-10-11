import { useCallback, useEffect, useMemo, useState } from 'react';
import { compute, engineInput, tierById } from './lib/engine.ts';
import type { CalcState, TierId } from './lib/types.ts';
import { usePersistentState, readStored, watchStored, writeStored } from './hooks/usePersistentState.ts';
import { DEFAULTS, reviveState } from './lib/calcState.ts';
import { PROFILE_KEY, dropProfile, putProfile, readProfiles } from './lib/sync.ts';
import { useGoogleSync } from './hooks/useGoogleSync.ts';
import { PopoverProvider } from './components/Popover.tsx';
import { TitleBar } from './components/TitleBar.tsx';
import { BaselineStrip } from './components/BaselineStrip.tsx';
import { vibeCheck } from './lib/vibeCheck.ts';
import type { VibeReport } from './lib/vibeCheck.ts';
import { StatsPanel } from './components/StatsPanel.tsx';
import { VibeReportPanel } from './components/VibeReport.tsx';
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

  const [profiles, setProfiles] = useState<Record<string, CalcState>>(readProfiles);
  const [currentProfile, setCurrentProfile] = useState('');

  /* Profiles can now also change because another device changed them, so the
     shelf is read back whenever anything writes to it rather than only when
     this tab is the one doing the writing. */
  useEffect(() => watchStored((key) => {
    if (key !== PROFILE_KEY) return;
    const shelf = readProfiles();
    setProfiles(shelf);
    setCurrentProfile((name) => (name && !shelf[name] ? '' : name));
  }), []);

  const sync = useGoogleSync();

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

  const result = useMemo(() => compute(engineInput(state)), [state]);

  /* ---- Profiles ---- */

  const saveProfile = useCallback(() => {
    const suggested = currentProfile || `Monster ${Object.keys(profiles).length + 1}`;
    const name = window.prompt('Save this calculation as:', suggested)?.trim();
    if (!name) return;
    setProfiles(putProfile(name, state));
    setCurrentProfile(name);
  }, [currentProfile, profiles, state]);

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
    setProfiles(dropProfile(currentProfile));
    setCurrentProfile('');
  }, [currentProfile]);

  /* Reads the block below and overwrites the calculator with it. The report
     of what it could and could not work out goes in the space under Offensive
     CR — anywhere above the panes it would take its height out of the trait
     list, since the calculator is pinned to exactly one screen. */
  /* Takes a block, so that something which has only just been read out of
     pasted text can be scored without waiting a render for state to catch up. */
  const runVibeCheck = useCallback((block?: StatBlock) => {
    const { next, report } = vibeCheck(block ?? statblock, state);
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
            onVibeCheck={() => runVibeCheck()}
            profileNames={profileNames}
            currentProfile={currentProfile}
            onLoadProfile={loadProfile}
            onSaveProfile={saveProfile}
            onDeleteProfile={deleteProfile}
            sync={sync}
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

        {vibeReport && (
          <VibeReportPanel report={vibeReport} onDismiss={() => setVibeReport(null)} />
        )}

        <MonsterMaker
          open={monsterOpen}
          onToggle={() => setMonsterOpen((v) => !v)}
        >
          <MonsterMakerBody
            sb={statblock}
            onChange={setStatblock}
            onScore={runVibeCheck}
            row={result.final.row}
            synced={sync.phase === 'ready' || sync.phase === 'working'}
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
