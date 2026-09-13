import type { VibeReport } from '../lib/vibeCheck.ts';

interface Props {
  report: VibeReport;
  onDismiss: () => void;
}

/**
 * What the vibe check read out of the stat block, and what it could not.
 *
 * It lives in the space left under Offensive CR, which the stats column has
 * spare. Put anywhere above the panes it would take its height out of the
 * trait list instead, since the calculator is pinned to exactly one screen.
 *
 * The second list is the important one: the calculator will happily score a
 * monster whose Multiattack was never counted, and the answer will look right.
 */
export function VibeReportStrip({ report, onDismiss }: Props) {
  return (
    <div className="vibe-report" role="status">
      <div className="vibe-head">
        <b>Vibe check</b>
        <button type="button" className="mini" onClick={onDismiss} aria-label="Dismiss">×</button>
      </div>
      <div className="vibe-col">
        <span>Taken from the block</span>
        <ul>{report.took.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </div>
      {report.skipped.length > 0 && (
        <div className="vibe-col warn">
          <span>Check these yourself</span>
          <ul>{report.skipped.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
