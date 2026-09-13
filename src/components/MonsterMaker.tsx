import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
}

/**
 * Stat block creator.
 *
 * Collapsed by default, like the reference table: the page is a calculator
 * first, and a second tool unfolding under it should be something you ask
 * for rather than something you have to scroll past.
 */
export function MonsterMaker({ open, onToggle, children }: Props) {
  return (
    <section className={`panel monster${open ? ' open' : ''}`}>
      <button
        className="colhead mm-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="monsterBody"
        onClick={onToggle}
      >
        <span className="mm-title">
          Monster Maker
          <span className="beta">Beta</span>
        </span>
      </button>
      <div className="mm-body" id="monsterBody" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
