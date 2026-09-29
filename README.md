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
- Every other named trait in circulation is listed underneath them for
  reference, so the answer to "what about X?" is visible rather than
  missing.
- **Profiles** save a calculation to the browser so it can be reloaded.

The **Monster Maker** below it writes a stat block and scores it:

- **Paste a Stat Block** reads one out of text from anywhere — Homebrewery,
  D&D Beyond, a document — or off a screenshot dropped onto it, and scores it
  in the calculator above.
- **Start From a Monster** loads a published creature into the editor, to
  take apart and change. Renaming it offers to rename what the prose calls
  it, too — a winter wolf made into an inferno drake stops calling itself
  the wolf.
- **Browse traits** fills a trait from a catalogue of every named trait,
  one row each.
- **Vibe Check CR** reads the finished block — its armour, hit points,
  attack bonuses, save DCs and damage — into the calculator above, and
  reports in a panel of its own what it read, what it decided, and what it
  could not work out.
- Reads in **one column or two**, which is what the printed books do with a
  big monster and for the same reason.
- Copies out as Markdown, plain text, or a **PNG straight onto the
  clipboard**; downloads as **Roll20 JSON**, **5etools homebrew JSON**, or a
  PNG file. The picture follows whichever column count is on screen.

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
npm test         # engine, stat block and catalogue regression tests
npm run build    # typecheck + production build into dist/
```

Rebuilding the creature catalogue needs the password the sealed half is
encrypted with, which is deliberately not in this repository:

```
BESTIARY_PASSWORD=… npm run bestiary
```

`npm test` runs without it and says so, checking the open creatures only.

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

## Reading damage out of a stat block

`src/lib/damageText.ts` turns stat block prose into numbers, and almost all of
it is about telling damage that **adds** from damage that **replaces**. The
book writes both the same way:

- "16 (2d8 + 7) Slashing damage **plus** 5 (2d4) Fire damage" — 21.
- "11 (2d6 + 4) Piercing damage, **or** 18 (4d6 + 4) if it had Advantage" — 18,
  not 29.

The cues that mark a replacement are a trailing "or", a `Miss:`, a numbered
item off a menu, and a later failure on the same save. A choice is scoped to
the sentence it was written in, so a swarm's "14, or 8 if Bloodied" does not
swallow the separate 7 its grapple deals in the sentence after.

Who does the choosing decides what the choice is worth:

- **The creature picks** — the heaviest option, because it will.
- **A die picks** — the average over every option, including the ones that
  deal nothing. A beholder's ten eye rays are a d10 and four of them do no
  damage; the die is what says there are ten, so counting only the six that
  hurt would rate it as though it never rolled a dud.

The same reading is applied a level up, because an action list is a menu too:

- **Multiattack** is read where it says something plain — "makes one Bite
  attack and three other attacks, using Claw or Tail in any combination", and
  the "or it makes …" form that is a second routine rather than more attacks.
  All but one creature in the book parses; the hydra makes as many bites as it
  has heads, and that is reported rather than guessed at.
- **Without a Multiattack** a creature takes one action a turn, so the routine
  is the heaviest one, not the sum. A bandit fires its crossbow *or* swings
  its scimitar.
- **A recharge or daily action** goes in round 1 and the routine in rounds 2
  and 3, which is what the round table is for and what the DMG does with a
  breath weapon.
- **Legendary actions** are a menu spent `legendaryCount` times a round, and
  an option that says it cannot be taken again is worth one use.
- An entry with no dice of its own can still name one: "Pounce. … it makes one
  Rend attack" is worth a Rend.

Across the whole Monster Manual this lands **within one rung of the printed
rating for 85%** of creatures, which `npm test` asserts a floor for. It is not
a claim that the DMG procedure agrees with the designers — it does not, and
2024 dragons come out low however carefully they are read — but a change that
makes the reading worse shows up there.

## Reading a block back in

`src/lib/parseStatBlock.ts` turns pasted text into a stat block. The text
comes from anywhere, so the first thing that happens is the dressing comes
off — Homebrewery's blockquote gutter, markdown bold, table pipes and rules —
and what is left is read with patterns loose enough to cope with the rest.

Three things it has to get right that are not obvious:

- **Ability scores are laid out two ways.** Most blocks put the score beside
  its name; a table puts all six names on one row and all six scores on the
  next, where "the first number after STR" is the Strength of nothing at all.
  Each cell also states the modifier it implies — `18 (+4)` — so the bracket
  comes off before any number is taken.
- **A heading does not always get a line to itself.** Homebrewery writes
  `### Actions` hard against the trait above it. Left alone, the heading is
  swallowed into that trait's text and every action below stays filed as a
  trait.
- **Optical recognition returns no blank lines at all.** A whole action list
  arrives as one paragraph with a wrapped sentence broken across two lines. So
  entries are found line by line, and what tells an entry from a clause is the
  full stop: a block names its entries `Multiattack.` but writes their parts
  `Hit:` and `Failure:`.

Nothing is guessed quietly. What cannot be found is reported missing, and what
fails a cross-check — hit points that disagree with their own hit dice, an
attack bonus those ability scores cannot reach — is reported doubtful. The
block lands in the editor for correcting, and a wrong number that says nothing
is worse than a gap that does.

**How well it works.** Every creature in the catalogue is written out as text
and read back in, in both formats the app exports, and the two are scored
against each other: **99% come back on the same challenge rating**, and armour
class and hit points come back exactly every time. That is 3,772 blocks the
parser was never tuned against, and `npm test` holds it to 95%.

## Reading a picture

`src/lib/ocr.ts` wraps [Tesseract](https://tesseract.projectnaptha.com/) and
hands what it finds to the same reader. Paste a screenshot, drop one, or pick
a file.

The pictures this is for are screenshots rather than photographs of a book,
which is the case optical recognition is good at: clean pixels at a known
size, with none of the perspective, shadow or page curl that make a photograph
hard. A rendered block goes through in about two seconds and comes back
essentially perfect — what needed work was not the recognition but the shape
it returns, which is the third point above.

The recogniser and its training data are several megabytes and are fetched
from a CDN the first time somebody uses it, never before.

## Going back out as 5etools

`src/lib/fivetools.ts` writes a block as a 5etools homebrew file: a `_meta`
block naming the source, and one creature pointing at it. Fields are the
inverse of what the catalogue importer reads — `Huge` becomes `["H"]`,
`Chaotic Evil` becomes `["C","E"]`, and saves and skills are written as the
totals they print rather than the tiers behind them, which is what 5etools
stores and what lets expertise survive the trip.

The prose has its markup put back on, because text handed over without it
renders flat and unlinked. Every rule runs once and in an order where each
consumes the shape the next would otherwise have matched: the attack line
becomes `{@atkr m} {@hit 14}` before anything goes looking for a loose number,
and dice are wrapped before the bare `DC` rule runs. `DC` is matched
case-sensitively for the same reason — `{@dc 21}` is lower case, so nothing
can wrap what has already been wrapped.

That gives the strongest test available for it: put the result back through
`src/lib/detag.ts`, the same reader the catalogue was built with, and check
the same words come out. Eight representative lines do that in `npm test`.

2024 blocks have no separate lair action list, so lair actions ride along as
actions with `(Lair Action)` in the name rather than being dropped.

## Drawing the block

`src/lib/statblockImage.ts` works out where everything goes; `statblockCanvas.ts`
draws it. The split is the point: the layout is arithmetic over a measuring
function, so the wrapping and the column balance can be tested with a ruler of
ten pixels a character — no canvas, no browser, no font. A picture that comes
out wrong is worse than no picture.

Three things are worth knowing:

- **Small capitals are built by hand.** Canvas takes a CSS font shorthand, but
  browsers disagree about whether `small-caps` inside it does anything, so
  capitals keep their size and lower case becomes capitals at four fifths.
  Measuring and drawing walk the same split, so what is measured is drawn.
- **The split may only fall at the actions or later.** The name, the
  defences, the ability scores and the traits are one thing and stay together
  at the top left, which is how a printed block reads. Past that, blocks go
  into the first column until it has passed half the total and then into the
  second — balance is a preference, that rule is not, and a lopsided pair of
  columns is the right answer when the front matter is long.
- **The picture matches the page.** Colours and fonts are read from the live
  CSS variables, so a block exported in dark mode comes out dark, and the type
  is whatever the preview is already using.
- **Copying hands over a promise, not a picture.** Safari only accepts a
  clipboard write that is still inside the click that asked for it, and
  awaiting the canvas first would let that click end — so the blob goes into
  the `ClipboardItem` unresolved. A browser with no `ClipboardItem` at all is
  told to use Save PNG rather than left wondering.

The preview uses CSS columns rather than this layout, with `columns: 2 320px`
so that two is a maximum rather than a promise — the preview pane is only half
the window, and on a narrow screen the browser drops back to one. The same
rule about the front matter is enforced there by wrapping it in one element
with `break-inside: avoid`, which is what pushes the split down to the
actions wherever balancing would otherwise have put it.

## The Monster Manual catalogue

`src/data/monsterTraits.ts` and `src/data/monsterTemplates.ts` are generated,
not written. `npm run bestiary` rebuilds them from
[5etools' bestiary data](https://github.com/5etools-mirror-3/5etools-src) —
all 110 books of it — and caches the download under `tools/.cache`.

Of **4,559** creatures in print, **3,772** survive two filters:

- **Reprints go.** `reprintedAs` is the data's own record of what was carried
  forward, which is worth far more than matching names: it knows the 2014
  Goblin became the Goblin Warrior, and it knows which handful of creatures in
  otherwise wholly-reprinted books were *not* carried over.
- **Copies are written out.** A quarter of the bestiary is stored as a
  difference — a Flying Dagger is "a Flying Sword, with 'sword' read as
  'dagger' and the Longsword action swapped" — and `tools/resolveCopy.mjs`
  resolves them. All 3,772 come out whole. 187 are built on creature
  templates, which are not followed, and those come out as their base
  creature; the build says so.

The converter does three jobs worth knowing about:

- **Unwrapping the markup.** Upstream stores prose as `{@hit 14}` and
  `{@damage 1d10 + 8}`. Those have to come out as the words the book prints,
  because that text is exactly what the vibe check reads back — a stray tag
  would hide a save DC from it.
- **Working out the tiers.** The book prints finished bonuses; the app stores
  whether a skill is proficient or expert. Both candidates get rebuilt and
  compared against the printed number. Two creatures in the whole book —
  the giant frog and the shambling mound — print a Stealth bonus a point
  above what proficiency explains, and take the nearer tier.
- **One row per trait.** Creatures word the same trait differently — a death
  burst has its own dice and its own save — but a picker that shows Death
  Burst nine times is one nobody can read. One row each, and it says how many
  creatures have it. The wording comes from the 2024 books where there is
  one: there are ten years of older books and one new one, so counting alone
  would have every trait phrased as it was in 2014.
- **Leaving out the defaults.** Anything matching a fresh stat block is
  dropped and put back by `reviveStatBlock`, which is a third off the
  download. A test compares the defaults the data was pruned against with
  the ones the app builds today, so the two cannot drift apart.

The creature catalogue is a chunk of its own and is not fetched until someone
opens the picker. The traits ship with the app, because the calculator's trait
panel lists them too.

## What ships, and what is sealed

None of this is Wizards of the Coast's to give away. 336 of the 3,772
creatures are in the **System Reference Document 5.2**, which is published
under Creative Commons Attribution 4.0, and those ship with the site for
everyone. The other 3,436 are **encrypted**, and a password opens them.

Encrypted rather than filtered, because a gate that only hid the list would
not be a gate: the blocks would still be sitting in the bundle for anyone who
opened the network tab. `tools/build-bestiary.mjs` gzips them, then encrypts
with AES-256-GCM under a key stretched from the password by 310,000 rounds of
PBKDF2-SHA256. What is committed is ciphertext. The password appears nowhere
in this repository — it comes from the environment at build time.

Opening it is a console command rather than a box on the page, because a login
box on the front of a challenge rating calculator only invites the people
without the password to wonder what they are missing:

```js
crCalc.unlock('…')   // opens them, and the browser remembers
crCalc.status()      // says which it is
crCalc.lock()        // shuts it, and forgets the password
```

There is no stored hash to compare against and none is needed: AES-GCM carries
an authentication tag, so a key built from the wrong password fails to decrypt
rather than producing plausible rubbish. The sealed chunk is never fetched
until somebody tries a password.

Coming back on a later visit takes the password up again but does no work with
it: whether it still opens anything is settled the first time the creatures
are actually wanted. Three and a half thousand stat blocks is a megabyte, and
decrypting it on every page load — for exactly the people who use the site
most — would be backwards.

Nothing else is bundled either. The traits are open to everyone and are still
a third of a megabyte, so they arrive when a trait list is opened rather than
sitting in front of the calculator.

**What this is and is not.** It keeps the material away from anyone who has
not been told the password, which is the job. It is not proof against somebody
determined: they have the ciphertext and can guess at a short password offline
for as long as they like. The PBKDF2 rounds put each guess at roughly half a
second, and that is the most a password of this length can buy.

Traits are open to everyone, as are the creature names that appear beside them
as examples.

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
