/* Starting points for actions, meant to be edited rather than used as written.
   Typing a full attack line from memory is the slowest part of writing a
   monster; correcting one is quick. */

import type { ActionKind } from './statblock.ts';

export interface ActionPreset {
  id: string;
  group: string;
  /** What the dropdown shows. */
  label: string;
  name: string;
  kind: ActionKind;
  text: string;
}

export const ACTION_PRESETS: readonly ActionPreset[] = [
  /* ---- Melee attacks ---- */
  {
    id: 'slam', group: 'Melee attacks', label: 'Slam', name: 'Slam', kind: 'action',
    text: 'Melee Attack Roll: +10, reach 5 ft. Hit: 16 (3d6 + 6) Bludgeoning damage.',
  },
  {
    id: 'bite', group: 'Melee attacks', label: 'Bite', name: 'Bite', kind: 'action',
    text: 'Melee Attack Roll: +7, reach 5 ft. Hit: 11 (2d6 + 4) Piercing damage.',
  },
  {
    id: 'claw', group: 'Melee attacks', label: 'Claw', name: 'Claw', kind: 'action',
    text: 'Melee Attack Roll: +7, reach 5 ft. Hit: 9 (2d4 + 4) Slashing damage.',
  },
  {
    id: 'rend', group: 'Melee attacks', label: 'Rend', name: 'Rend', kind: 'action',
    text: 'Melee Attack Roll: +9, reach 10 ft. Hit: 14 (2d8 + 5) Slashing damage.',
  },
  {
    id: 'greatsword', group: 'Melee attacks', label: 'Greatsword', name: 'Greatsword', kind: 'action',
    text: 'Melee Attack Roll: +6, reach 5 ft. Hit: 10 (2d6 + 3) Slashing damage.',
  },
  {
    id: 'tentacle', group: 'Melee attacks', label: 'Tentacle (grapple)', name: 'Tentacle', kind: 'action',
    text: 'Melee Attack Roll: +8, reach 15 ft. Hit: 12 (2d6 + 5) Bludgeoning damage, and the target has the Grappled condition (escape DC 15).',
  },

  /* ---- Ranged attacks ---- */
  {
    id: 'longbow', group: 'Ranged attacks', label: 'Longbow', name: 'Longbow', kind: 'action',
    text: 'Ranged Attack Roll: +6, range 150/600 ft. Hit: 11 (2d8 + 2) Piercing damage.',
  },
  {
    id: 'rock', group: 'Ranged attacks', label: 'Rock', name: 'Rock', kind: 'action',
    text: 'Ranged Attack Roll: +9, range 60/240 ft. Hit: 20 (3d10 + 4) Bludgeoning damage.',
  },

  /* ---- Spell attacks ---- */
  {
    id: 'eldritchBurstMelee', group: 'Spell attacks',
    label: 'Eldritch Burst (Melee)', name: 'Eldritch Burst (Melee)', kind: 'action',
    text: 'Melee Spell Attack: +12 to hit, reach 5 ft., One Target. Hit: (4d12 + 5) Force damage.',
  },
  {
    id: 'eldritchBurstRanged', group: 'Spell attacks',
    label: 'Eldritch Burst (Ranged)', name: 'Eldritch Burst (Ranged)', kind: 'action',
    text: 'Ranged Spell Attack: +12 to hit, reach 120 ft., One Target. Hit: (4d12 + 5) Force damage.',
  },

  /* ---- Saving throws ---- */
  {
    id: 'coldBreath', group: 'Saving throws',
    label: 'Cold Breath (Recharge 5–6)', name: 'Cold Breath (Recharge 5–6)', kind: 'action',
    text: 'Constitution Saving Throw: DC 12, each creature in a 15-foot Cone. Failure: 18 (4d8) Cold damage. Success: Half damage.',
  },
  {
    id: 'fireBreath', group: 'Saving throws',
    label: 'Fire Breath (Recharge 5–6)', name: 'Fire Breath (Recharge 5–6)', kind: 'action',
    text: 'Dexterity Saving Throw: DC 15, each creature in a 30-foot Cone. Failure: 24 (7d6) Fire damage. Success: Half damage.',
  },
  {
    id: 'frightfulPresence', group: 'Saving throws',
    label: 'Frightful Presence', name: 'Frightful Presence', kind: 'action',
    text: 'Wisdom Saving Throw: DC 15, each enemy in a 120-foot Emanation that can see the creature. Failure: The target has the Frightened condition until the end of its next turn.',
  },

  /* ---- Routine and movement ---- */
  {
    id: 'multiattack', group: 'Routine and movement',
    label: 'Multiattack', name: 'Multiattack', kind: 'action',
    text: 'The dragon makes three Rend attacks.',
  },
  {
    id: 'charge', group: 'Routine and movement',
    label: 'Charge', name: 'Charge', kind: 'action',
    text: 'The troll moves up to half its Speed straight toward an enemy it can see.',
  },
  {
    id: 'teleport', group: 'Routine and movement',
    label: 'Teleport', name: 'Teleport', kind: 'action',
    text: 'The creature teleports up to 60 feet to an unoccupied space it can see.',
  },

  /* ---- Bonus actions ---- */
  {
    id: 'nimbleEscape', group: 'Bonus actions',
    label: 'Nimble Escape', name: 'Nimble Escape', kind: 'bonus',
    text: 'The creature takes the Disengage or Hide action.',
  },
  {
    id: 'leap', group: 'Bonus actions', label: 'Leap', name: 'Leap', kind: 'bonus',
    text: 'The creature jumps up to 30 feet by spending 10 feet of movement.',
  },

  /* ---- Reactions ---- */
  {
    id: 'parry', group: 'Reactions', label: 'Parry', name: 'Parry', kind: 'reaction',
    text: 'Trigger: The creature is hit by a melee attack roll while holding a weapon. Response: The creature adds 3 to its AC against that attack, possibly causing it to miss.',
  },
  {
    id: 'riposte', group: 'Reactions', label: 'Riposte', name: 'Riposte', kind: 'reaction',
    text: 'Trigger: A creature the creature can see misses it with a melee attack roll. Response: The creature makes one Rend attack against the triggering creature.',
  },
];

/** Group names in the order they first appear, for the dropdown. */
export const PRESET_GROUPS: readonly string[] =
  [...new Set(ACTION_PRESETS.map((p) => p.group))];

export const presetById = (id: string): ActionPreset | undefined =>
  ACTION_PRESETS.find((p) => p.id === id);
