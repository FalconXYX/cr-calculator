import { CR_TABLE } from '../lib/crTable.ts';

interface Props {
  open: boolean;
  onToggle: () => void;
  currentCr: string;
}

/** Collapsed by default: it is a lookup, not something you read while working. */
export function ReferencePanel({ open, onToggle, currentCr }: Props) {
  return (
    <aside className="panel reference">
      <button
        className="colhead ref-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="refScroll"
        onClick={onToggle}
      >
        <span>Standard CR Reference</span>
      </button>
      <div className="ref-scroll" id="refScroll" hidden={!open}>
        <table className="ref">
          <colgroup>
            <col className="c-cr" /><col className="c-xp" /><col className="c-pb" /><col className="c-ac" />
            <col className="c-hp" /><col className="c-atk" /><col className="c-dmg" /><col className="c-dc" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">CR</th><th scope="col">XP</th><th scope="col">PB</th>
              <th scope="col">AC</th><th scope="col">HP</th>
              <th scope="col">Atk</th><th scope="col">Dmg</th><th scope="col">DC</th>
            </tr>
          </thead>
          <tbody>
            {CR_TABLE.map((r) => (
              <tr key={r.cr} className={r.cr === currentCr ? 'is-current' : undefined}>
                <td>{r.cr}</td>
                <td>{r.xpLabel}</td>
                <td>+{r.prof}</td>
                <td>{r.cap ? `≤${r.ac}` : r.ac}</td>
                <td>{r.hpMin}–{r.hpMax}</td>
                <td>{r.cap ? `≤+${r.atk}` : `+${r.atk}`}</td>
                <td>{r.dmgMin}–{r.dmgMax}</td>
                <td>{r.cap ? `≤${r.dc}` : r.dc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </aside>
  );
}
