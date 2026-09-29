import { useEffect, useRef } from "react";
import type { VibeReport } from "../lib/vibeCheck.ts";

interface ColumnProps {
  title: string;
  note: string;
  lines: string[];
  tone?: "judged" | "warn";
}

function Column({ title, note, lines, tone }: ColumnProps) {
  if (!lines.length) return null;
  return (
    <div className={`vibe-col${tone ? ` ${tone}` : ""}`}>
      <h3 className="vibe-col-head">{title}</h3>
      <p className="vibe-col-note">{note}</p>
      <ul>
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

interface Props {
  report: VibeReport;
  onDismiss: () => void;
}

/**
 * What the vibe check made of the block, in a panel of its own.
 *
 * It used to be a strip inside the stats column, which was the wrong shape
 * twice over. The calculator is pinned to exactly one screen, so anything put
 * inside it takes its height straight out of the trait list; and there is far
 * more to say now than would fit in a gap. Down here it can run as long as it
 * needs to, and it borrows the Monster Maker's roomier type rather than the
 * calculator's deliberate density — if the page is going to be scrolled to
 * reach this at all, it may as well be comfortable to read.
 */
export function VibeReportPanel({ report, onDismiss }: Props) {
  const ref = useRef<HTMLElement>(null);

  /* It appears below the fold, under a calculator that fills the window, so
     bring it into view — the least that will do it, which keeps as much of
     the calculator on screen as will fit alongside. */
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [report]);

  return (
    <section
      className="panel vibe"
      ref={ref}
      role="status"
      aria-label="Vibe check report"
    >
      <div className="colhead vibe-head">
        <span className="mm-title">
          Vibe Check
          <span className="vibe-sub">
            what the calculator made of the block
          </span>
        </span>
        <button type="button" className="mini" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      <div className="vibe-body">
        <Column
          title="Read off the block"
          note="Stated plainly enough that there was nothing to decide."
          lines={report.took}
        />
        <Column
          title="Judgement calls"
          tone="judged"
          note="The block says what a creature can do. The calculator wants one number for what it does in a round. Everything below is how one became the other."
          lines={report.judged}
        />
        <Column
          title="Left for you"
          tone="warn"
          note="The calculator will score a monster with a hole in it quite happily, and the answer will look right."
          lines={report.skipped}
        />
      </div>
    </section>
  );
}
