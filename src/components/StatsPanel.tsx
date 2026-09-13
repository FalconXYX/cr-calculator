import { NumberField, OutCell, Row, signed } from './Fields.tsx';
import { InfoButton } from './Popover.tsx';
import { DamageTable } from './DamageTable.tsx';
import { HELP } from '../lib/help.ts';
import { VibeReportStrip } from './VibeReport.tsx';
import type { CalcState, Result } from '../lib/types.ts';
import type { VibeReport } from '../lib/vibeCheck.ts';

interface Props {
  state: CalcState;
  result: Result;
  set: <K extends keyof CalcState>(key: K, value: CalcState[K]) => void;
  onSetDamage: (which: 'primary' | 'secondary', index: number, value: number) => void;
  onAddRound: () => void;
  onRemoveRound: () => void;
  vibeReport: VibeReport | null;
  onDismissVibe: () => void;
}

export function StatsPanel({
  state, result, set, onSetDamage, onAddRound, onRemoveRound, vibeReport, onDismissVibe,
}: Props) {
  const { effective: eff, defensive: def, offensive: off } = result;
  const usingAttack = off.offenseBy === 'attack';

  return (
    <section className="stats">
      <div className="colhead">Creature Stats</div>

      <div className="sechead">Defensive Ability</div>

      <Row>
        <div className="cell">
          <label htmlFor="ac">Actual AC</label>
          <NumberField id="ac" value={state.ac} min={1} max={40}
            onCommit={(n) => set('ac', n)} />
        </div>
        <OutCell label="Effective AC" value={eff.ac} />
      </Row>
      <Row>
        <div className="cell">
          <label htmlFor="hp">Actual HP</label>
          <NumberField id="hp" value={state.hp} min={1} max={2000}
            onCommit={(n) => set('hp', n)} />
        </div>
        <OutCell label="Effective HP" value={eff.hp} />
      </Row>
      <Row>
        <OutCell label="Defensive CR by HP" value={def.hpRow.cr} />
        <OutCell label="Expected AC for HP CR" value={def.expectedAC} adjust={def.acShift} />
      </Row>
      <Row>
        <OutCell label="Defensive CR" value={def.row.cr} wide result />
      </Row>

      <div className="sechead">Offensive Ability</div>

      <Row>
        <div className="cell">
          <label htmlFor="attackBonus">Actual Attack Bonus</label>
          <NumberField id="attackBonus" value={state.attackBonus} min={-5} max={30}
            onCommit={(n) => set('attackBonus', n)} />
        </div>
        <OutCell label="Effective Attack Bonus" value={signed(eff.attack)} />
      </Row>

      <DamageTable
        roundCount={state.roundCount}
        primary={state.primary}
        secondary={state.secondary}
        onSet={onSetDamage}
        onAddRound={onAddRound}
        onRemoveRound={onRemoveRound}
      />

      <Row>
        <div className="cell">
          <label htmlFor="extraDamage">Off-turn damage / round</label>
          <InfoButton content={HELP.extra!} label="What counts as off-turn damage?" />
          <NumberField id="extraDamage" value={state.extraDamage} min={0} max={1000}
            onCommit={(n) => set('extraDamage', n)} />
        </div>
        <OutCell label="Effective Damage / Round" value={eff.damage} />
      </Row>

      <Row>
        <div className="cell">
          <label htmlFor="saveDC">Actual Save DC</label>
          <NumberField id="saveDC" value={state.saveDC} min={1} max={40}
            onCommit={(n) => set('saveDC', n)} />
        </div>
        <OutCell label="Effective Save DC" value={eff.saveDC} />
      </Row>
      <Row>
        <OutCell label="Offensive CR by Dmg/Round" value={off.dmgRow.cr} wide />
      </Row>
      <Row>
        <OutCell label="Expected Attack for Dmg CR" value={signed(off.expectedAtk)} adjust={off.atkShift} />
        <OutCell label="Offensive CR by Attack" value={off.byAttackRow.cr} dimmed={!usingAttack} />
      </Row>
      <Row>
        <OutCell label="Exp. Save DC for Dmg CR" value={off.expectedDC} adjust={off.dcShift} />
        <OutCell label="Offensive CR by Save DC" value={off.bySaveRow.cr} dimmed={usingAttack} />
      </Row>
      <Row>
        <OutCell label="Offensive CR" value={off.row.cr} wide result />
      </Row>

      {vibeReport && <VibeReportStrip report={vibeReport} onDismiss={onDismissVibe} />}
    </section>
  );
}
