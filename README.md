# CR Calculator

Works out a D&D 5e monster's challenge rating from its defensive and
offensive statistics, following the "Creating a Monster Stat Block"
procedure in the Dungeon Master's Guide.

No build step and no dependencies — open `index.html`, or serve the folder.

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

## Layout

```
index.html        markup
css/styles.css    five-colour palette, light and dark
js/data.js        CR table, target tiers, trait catalogue
js/engine.js      the maths — pure functions, no DOM
js/app.js         interface wiring
```

`js/engine.js` deliberately touches no DOM so the challenge-rating logic can
be tested on its own.

## Analytics

Page views are counted with [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/),
loaded from a small inline snippet at the bottom of `index.html`. It is
cookieless and anonymous, so no consent banner is required.

The snippet does nothing until a beacon token is set — no request, no
errors — so the site runs fine without one. To enable it, get a token from
the Cloudflare dashboard under **Analytics & Logs → Web Analytics → Add a
site** and paste it into the `token` variable in that snippet. The token is
not a secret; it only identifies which site the beacon reports to.

## Credit
