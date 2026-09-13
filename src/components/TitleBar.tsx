import { InfoButton } from './Popover.tsx';
import { HELP } from '../lib/help.ts';
import { TIERS } from '../lib/crTable.ts';
import type { TierId } from '../lib/types.ts';

interface Props {
  tierId: TierId;
  onTier: (id: TierId) => void;
  theme: 'light' | 'dark';
  onTheme: () => void;
  onReset: () => void;
  onVibeCheck: () => void;
  profileNames: string[];
  currentProfile: string;
  onLoadProfile: (name: string) => void;
  onSaveProfile: () => void;
  onDeleteProfile: () => void;
}

export function TitleBar({
  tierId, onTier, theme, onTheme, onReset, onVibeCheck,
  profileNames, currentProfile, onLoadProfile, onSaveProfile, onDeleteProfile,
}: Props) {
  return (
    <div className="titlebar">
      <h1>CR Calculator</h1>
      <div className="titlebar-right">
        <span className="tb-group">
          <select
            id="profileSelect"
            aria-label="Saved profiles"
            value={currentProfile}
            onChange={(e) => onLoadProfile(e.target.value)}
          >
            <option value="">{profileNames.length ? 'Load…' : 'No profiles'}</option>
            {profileNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="btn" type="button" onClick={onSaveProfile}>Save</button>
          <button
            className="btn"
            type="button"
            aria-label="Delete this profile"
            title="Delete this profile"
            disabled={!currentProfile}
            onClick={onDeleteProfile}
          >
            ×
          </button>
        </span>
        <span className="tb-group">
          <label htmlFor="tier">Target CR</label>
          <select
            id="tier"
            aria-label="Target CR range"
            value={tierId}
            onChange={(e) => onTier(e.target.value as TierId)}
          >
            {TIERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <InfoButton content={HELP.tier!} label="What does the target CR range change?" />
        </span>
        <span className="tb-group">
          <button className="btn vibe" type="button" onClick={onVibeCheck}>
            Vibe Check CR
          </button>
          <InfoButton content={HELP.vibe!} label="What does a vibe check do?" />
        </span>
        <button className="btn" type="button" onClick={onReset}>Reset</button>
        <button
          className="icon-btn"
          type="button"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          onClick={onTheme}
        >
          ◐
        </button>
      </div>
    </div>
  );
}
