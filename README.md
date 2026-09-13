# CR Calculator

Works out a D&D 5e monster's challenge rating from its defensive and
offensive statistics, following the "Creating a Monster Stat Block"
procedure in the Dungeon Master's Guide.

React + TypeScript, built with Vite.

## What it does

- **Defensive CR** from effective hit points, adjusted by effective AC.
- **Offensive CR** from effective damage per round, adjusted by attack
  bonus or save DC, whichever is higher.
- **Overall CR** is the average of the two, snapped to a real rating.
- 94 documented traits. Hovering the **i** on any of them shows both what
  the trait does at the table _and_ what it does to the challenge rating.
- **Profiles** save a calculation to the browser so it can be reloaded.

The target CR range matters and has to be set first — resistance
multipliers, Undead Fortitude, Relentless and the two "level 10 or lower"
bonuses are all scaled by it.

## How the maths works

Challenge rating is a **ladder**, not a number line: 0, ⅛, ¼, ½, 1, 2 … 30.
The DMG says to adjust a CR "by 1 for every 2 points" of difference, which
means one _rung_, so a CR ⅛ monster with a strong AC steps to ¼ rather than
to 1. All adjustment happens in rung-index space, and a gap of exactly one
point is worth nothing in either direction.

Two more details worth knowing:

- Damage is averaged over however many rounds are shown, including rounds
  where the creature deals nothing. One-off bursts such as a breath weapon
  are spread across that average rather than counted whole.
- Hit point multipliers stack additively, so "double" plus "double" is
  triple rather than quadruple.

At CR 0 the reference table lists ceilings rather than targets (AC ≤13,
attack ≤+3, DC ≤13), so falling below them is not penalised.

## Running it

```
npm install
npm run dev      # local dev server
npm test         # engine regression tests
npm run build    # typecheck + production build into dist/
```

Deploys itself to GitHub Pages on every push to `main` via
`.github/workflows/deploy.yml`. The workflow runs the engine tests first, so
a change that breaks the CR maths never reaches the site.

## Layout

```
index.html              Vite entry
src/main.tsx            React root
src/App.tsx             state, and the only place it lives
src/lib/types.ts        shared shapes
src/lib/crTable.ts      Monster Statistics by CR, and the target tiers
src/lib/traits.ts       the 94-entry feature catalogue
src/lib/engine.ts       the maths — pure functions, no DOM, no React
src/components/         Popover, panels, fields
test/engine.test.ts     regression tests, one block per historic bug
```

`src/lib/engine.ts` deliberately imports nothing from React and touches no
DOM, so the challenge-rating logic can be tested on its own — `npm test`
runs it directly under Node with no browser and no test framework.

## Analytics

Page views are counted with [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/),
via the beacon snippet at the bottom of `index.html`. It is cookieless and
anonymous, so no consent banner is required.

The beacon token in that snippet is not a secret. It only identifies which
site the beacon reports to, and is visible in the page source of every site
using Cloudflare's analytics.

Note that the beacon fires from any host, local development included, so
opening the page while working on it is counted as a view.

## Credit
