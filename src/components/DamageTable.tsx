import { NumberField } from './Fields.tsx';
import { InfoButton } from './Popover.tsx';
import { HELP } from '../lib/help.ts';

interface Props {
  roundCount: number;
  primary: number[];
  secondary: number[];
  onSet: (which: 'primary' | 'secondary', index: number, value: number) => void;
  onAddRound: () => void;
  onRemoveRound: () => void;
}

export function DamageTable({
  roundCount, primary, secondary, onSet, onAddRound, onRemoveRound,
}: Props) {
  const rounds = Array.from({ length: roundCount }, (_, i) =>
    (primary[i] ?? 0) + (secondary[i] ?? 0));
  const average = Math.round((rounds.reduce((a, b) => a + b, 0) / roundCount) * 10) / 10;

  return (
    <table className="dmg">
      <thead>
        <tr>
          <th scope="col">Round</th>
          <th scope="col">Primary</th>
          <th scope="col">Secondary</th>
          <th scope="col">By Round</th>
        </tr>
      </thead>
      <tbody>
        {rounds.map((total, i) => (
          <tr key={i}>
            <td>{i + 1}</td>
            <td>
              <NumberField
                value={primary[i] ?? 0}
                min={0}
                max={1000}
                ariaLabel={`Primary damage, round ${i + 1}`}
                onCommit={(n) => onSet('primary', i, n)}
              />
            </td>
            <td>
              <NumberField
                value={secondary[i] ?? 0}
                min={0}
                max={1000}
                ariaLabel={`Secondary damage, round ${i + 1}`}
                onCommit={(n) => onSet('secondary', i, n)}
              />
            </td>
            <td className="by-round">{total}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2} className="dmg-actions">
            <button type="button" className="mini" onClick={onAddRound} disabled={roundCount >= 6}>
              + round
            </button>
            <button type="button" className="mini" onClick={onRemoveRound} disabled={roundCount <= 1}>
              − round
            </button>
          </td>
          <td className="dmg-avg-lbl">
            Average over {roundCount} round{roundCount === 1 ? '' : 's'}
            <InfoButton content={HELP.damage!} label="How damage per round is averaged" />
          </td>
          <td className="by-round strong">{average}</td>
        </tr>
      </tfoot>
    </table>
  );
}
