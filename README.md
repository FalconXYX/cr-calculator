# CR Calculator

Works out a D&D 5e monster's challenge rating from its statistics, following
the Dungeon Master's Guide procedure — and writes the stat block for you.

**[Live demo](https://parthjain.ca/cr-calculator/)**

3,772 published creatures to start from, 94 documented traits, and a reader
that takes a stat block out of pasted text or a screenshot and scores it.

## The Idea

Challenge rating is a **ladder**, not a number line: 0, ⅛, ¼, ½, 1, 2 … 30.
The DMG's "adjust by 1 for every 2 points" means one *rung*, so a CR ⅛ monster
with a strong AC steps to ¼ rather than to 1. Every adjustment happens in
rung-index space, which is the difference between agreeing with the book and
drifting badly at the low end.

Defensive CR comes from effective hit points adjusted by AC, offensive CR from
damage per round adjusted by attack bonus or save DC, and the rating is the
average of the two snapped back to a real rung. Set the target CR range first:
resistance multipliers and the "level 10 or lower" bonuses all scale by it.

## What It Does

- **Paste a Stat Block**: reads one out of text from Homebrewery, D&D Beyond
  or a document — or off a screenshot — and scores it in the calculator above.
- **Start From a Monster**: loads any of the 3,772 into the editor to take
  apart. Renaming offers to rename what the prose calls it, so a winter wolf
  made into an inferno drake stops calling itself the wolf.
- **94 Documented Traits**: each says both what it does at the table *and*
  what it does to the rating, with every other named trait in circulation
  listed underneath for reference.
- **Vibe Check CR**: scores the finished block and reports what it read, what
  it decided, and what it could not work out.
- **Exports**: Markdown, plain text, a PNG onto the clipboard, Roll20 JSON or
  5etools homebrew JSON — in one column or two, as the printed books do.
- **Saves**: to the browser, or to a Google account so they follow you between
  devices.

## Engineering Highlights

- **Damage That Adds vs Damage That Replaces**: the book writes both the same
  way — "2d8 + 7 Slashing *plus* 2d4 Fire" sums, "2d6 + 4, *or* 4d6 + 4 with
  Advantage" does not. Who chooses decides the worth: the creature takes its
  heaviest option, a die averages over every option including the duds.
- **Action Economy, Not a Sum**: Multiattack parses into routines —
  alternation, addition, and "can replace one with X", which buys a seat off
  the weakest attack rather than adding one. Recharge actions go in round 1
  and the routine in rounds 2 and 3.
- **Measured, Not Asserted**: every creature is written out as text and read
  back in, in both export formats, and scored against the original — **99%
  return on the same rating**, AC and hit points exactly. The DMG procedure
  itself lands within one rung of the printed rating for **86%** of Monster
  Manual creatures. `npm test` holds floors under both.
- **Nothing Guessed Quietly**: what cannot be found is reported missing, and
  what fails a cross-check — hit points that disagree with their own hit dice,
  an attack bonus those abilities cannot reach — is reported doubtful.
- **A Pure Core**: the engine, parser, canvas layout and sync merge import
  nothing from React and touch no DOM, so 700-odd assertions run under plain
  Node with no browser and no test framework.

## The Creature Catalogue

Generated, not written. `npm run bestiary` rebuilds it from
[5etools' bestiary data](https://github.com/5etools-mirror-3/5etools-src)
across 110 books, dropping reprints and resolving the quarter of the bestiary
stored as a difference from another creature. 3,772 survive from 4,559 in
print.

None of it is Wizards of the Coast's to give away, so the 336 creatures in
**SRD 5.2** ship with the site and the other 3,436 are encrypted — gzipped,
then AES-256-GCM under a key stretched by 310,000 rounds of PBKDF2. What is
committed is ciphertext and the password comes from the environment at build
time. Filtering would not have been a gate: the blocks would still sit in the
bundle for anyone who opened the network tab.

```js
crCalc.unlock('…')   // opens them, and the browser remembers
crCalc.lock()        // shuts it, and forgets the password
```

## Syncing to a Google Account

Optional, and absent unless configured. The small Google mark in the title bar
keeps saved calculations and monsters in the user's own Drive, in
`appDataFolder` — a hidden per-app folder nothing else can see. No database
and no server of ours; revoking access in their Google settings is the whole
of deleting it.

Both devices have usually been edited since they last spoke, so a snapshot is
not a backup to lay over the other: every record carries the moment it was
saved, every deletion leaves a dated gravestone, and merging keeps the later
of each.

**Setup**: a Google Cloud project with the Drive API enabled, an OAuth **Web
application** client ID listing your origins, the `drive.appdata` scope on the
consent screen, and the ID in `.env.local` as `VITE_GOOGLE_CLIENT_ID`. No
redirect URI and no client secret — the browser token flow uses neither.

**One caveat**: `drive.appdata` is a scope Google classes as *sensitive*. In
Testing it caps you at 100 accounts listed by email; publishing without
Google's review shows everyone else an unverified-app warning.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Graphics**: HTML5 Canvas 2D
- **OCR**: Tesseract.js, fetched from a CDN on first use and never before
- **Crypto**: Web Crypto — AES-256-GCM, PBKDF2-SHA256
- **Data**: 5etools bestiary, SRD 5.2

## Getting Started

```
npm install
npm run dev       # dev server
npm test          # engine, stat block, catalogue, parser, library, sync
npm run build     # typecheck + production build into dist/
```

Rebuilding the catalogue needs the password the sealed half is encrypted with,
which is deliberately not in this repository:

```
BESTIARY_PASSWORD=… npm run bestiary
```

`npm test` runs without it and says so, checking the open creatures only.
Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`,
which runs the tests before it builds.

## Credit

Creature data from [5etools](https://github.com/5etools-mirror-3/5etools-src).
SRD 5.2 content © Wizards of the Coast, used under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Optical recognition
by [Tesseract](https://tesseract.projectnaptha.com/). Page views counted with
[Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/),
which is cookieless and anonymous, so there is no consent banner.
