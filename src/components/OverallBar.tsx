import type { Result } from '../lib/types.ts';

export function OverallBar({ result }: { result: Result }) {
  const { final, tier } = result;
  return (
    <div className="overall">
      <span className="overall-lbl">Overall CR</span>
      <b className="overall-cr">{final.row.cr}</b>
      <span className="overall-meta">
        {final.row.xpLabel} XP &nbsp;·&nbsp; Prof +{final.row.prof}
      </span>
      {!final.inTarget && <span className="flag">Outside {tier.label}</span>}
    </div>
  );
}
