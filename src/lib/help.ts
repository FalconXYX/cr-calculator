import type { PopoverContent } from "../components/Popover.tsx";

/** Explanations for the controls that are not traits. */
export const HELP: Record<string, PopoverContent> = {
  vibe: {
    title: "Vibe Check CR",
    desc: "Reads the monster built in the Monster Maker below and fills this calculator in from it. It reads the numbers it can in any traits that have been matching names, but is not able to read everything",
    effect:
      "Overwrites what is currently in the calculator, then tells you what it took and what it could not work out.\u2019s.",
  },
  tier: {
    title: "Target CR Range",
    desc: "The band you are aiming for. Several features are worth more against a low-level party than a high-level one, so this has to be set before the rest of the numbers mean anything.",
    effect:
      "Sets the HP multiplier for resistances and immunities, the value of Relentless and Undead Fortitude, and whether the flying and fear bonuses apply at all.",
  },
  extra: {
    title: "Off-turn damage",
    desc: "Damage the creature deals outside its own action: damaging auras, reactions, legendary actions and lair actions. A fire aura that burns whoever melees it, for instance.",
    effect:
      "Added to effective damage every round. Assume one character is in range and triggering it each round.",
  },
  damage: {
    title: "Damage per round",
    desc: "Add up the average damage of everything the creature does in a round, using its most effective attack routine. Assume attacks hit and that targets fail their saves.",
    effect:
      "Averaged over however many rounds you show. Add rounds when the damage varies — a breath weapon on round one and claws after, say.",
  },
};
