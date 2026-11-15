# EXTRADIMENSIONAL

An original horizontal bullet-hell shmup. A lone fighter in a flat 2-D universe can rise into the 3rd dimension
("phase"): while above the plane it is invincible to everything 2-D, enemies render as inked cutaways, and its
weapon detonates inside their hulls on internal systems, bypassing armour and shields.

Plain HTML canvas + classic JavaScript. No build step, no libraries, no network. It must keep working by
double-clicking `index.html` from `file://`.

`MODDING.md` is the full content reference (every definition field, worked examples). This file is the short
orientation; when the two disagree, the code wins, then `MODDING.md`.

## Hard constraints

- Classic `<script src>` files only. No ES modules, no bundler, no TypeScript source, no CDN.
- Everything lives on one global, `window.XD`. Each file is an IIFE that destructures what it needs from `XD`.
- Fixed-timestep simulation: 60 logic steps per second (`XD.DT`), logical resolution 1280 x 720 scaled to the window.
- `window.__game` (in `js/debug.js`) is the test API. Bots depend on the shape of `state()` and `debug()`:
  add fields, never rename or remove.
- The game must run with the concept-art JPG missing (procedural fallback).
- Audio must never throw when `AudioContext` is unavailable or suspended.
- This directory is not a git repository. Take a copy before a large pass (earlier passes left theirs in
  `playtest/restructure/index.before.html` and `playtest/fix2/backup/`).

## Architecture

`index.html` holds the canvas and the script tags, in three groups. Order between groups matters.

| Group | Files | Role |
|---|---|---|
| Engine | `js/core.js` | `XD` namespace, constants, state `G`, player `P`, entity arrays, input, registries, asset loader, `XD.validate()` / `XD.warn` |
| | `js/audio.js` | synthesized sound effects and step-sequencer music |
| | `js/fx.js` | shake, particles, explosions, popups, banners, `addScore` |
| | `js/bullets.js` | enemy bullets and emitters (`fireB`, `ring`, `fan`, `wall`), lasers, gap walls, player shots, shards |
| | `js/pickups.js` | pickup drop, drift, collect |
| | `js/enemies.js` | `spawn`, hull test, damage, death, movement behaviours (`ai`), update loop |
| | `js/bosses.js` | generic phased-boss engine (contains no boss id and no stage number) |
| | `js/player.js` | ship movement, phase drive, re-entry |
| | `js/arsenal.js` | main guns, charge shot, tether drone, absorb burst |
| | `js/stage.js` | run and stage flow, stage-script helpers, continues, victory hand-off |
| | `js/sprites.js` | procedural hull and cutaway sprites, image art with fallback, backdrop |
| | `js/render.js` | world drawing (largest file) |
| | `js/hud.js` | HUD, title, pause, game over, victory |
| | `js/debug.js` | `window.__game` |
| Data | `data/assets.js` | image manifest |
| | `data/systems.js` | internal system kinds and what destroying each does |
| | `data/weapons.js` | the four guns, plus drone / charge / absorb tuning |
| | `data/pickups.js` | pickups and drop rules |
| | `data/patterns.js` | bullet patterns of ordinary enemies |
| | `data/enemies.js` | the nine enemy types |
| | `data/bosses.js` | the three bosses, including the flagship's concept-art wiring |
| | `data/stages.js` | the three stages, title and victory screen settings |
| Boot | `js/main.js` | scene keys, fixed-step loop, builds sprites from the registries. Must be last. |

Other paths:

- `mods/example/example.js` — the worked example from `MODDING.md` (enemy, pattern, pickup, weapon, boss, 4th
  stage). Its script tag in `index.html` is commented out.
- `tools/harness.mjs` — headless test helper (Playwright driving the installed Chrome).
- `playtest/` — bots, logs and screenshots from each development pass. Disposable; only `fix2/` and `verify2/`
  are current (see Commands).
- `Gemini_Generated_Image_lzbbd7lzbbd7lzbb.jpg` — the user's concept art; used by the flagship and the title.

### Registries (all in `js/core.js`)

Data files only register; ids are resolved when the game runs. Redefining an id replaces the earlier definition.

`defineEnemy`, `definePattern`, `defineAI`, `defineBoss`, `defineStage`, `defineSystem`, `definePickup`,
`defineWeapon`, `defineAssets`, `defineScreens`, and the tuning setters `setDropRules`, `setArsenal`,
`setChainRules`, `setRunRules`, `setStartWeapon`.

Stage count, stage names, boss per stage, music key and tempo, backdrop hue, bullet-speed scaling and the victory
trigger all derive from the ordered stage list (`XD.STAGES`). `defineStage(def)` appends;
`defineStage(def, { before | after | replace: id })` positions it.

### Frame flow

`main.js` accumulates real time and runs whole 1/60 s steps (scaled by `G.timeScale`), then renders once.
A step updates: player and phase drive, arsenal, enemies and bosses, shots, bullets and lasers, pickups, effects,
stage timeline. Scene is one of `title`, `play`, `pause`, `gameover`, `victory`.

## How to make changes

| To change | Edit |
|---|---|
| Add or tune an enemy, pattern, boss, stage, pickup, weapon | the matching `data/*.js` file, or a new file under `mods/` with a script tag before `js/main.js` |
| Wave timing in a stage | `script(s)` in `data/stages.js` using `s.motes`, `s.swoop`, `s.lancers`, `s.hold`, `s.msg`, `s.spawn`, `s.at` |
| Boss phases, systems, anchors, fire patterns | `phases` in `data/bosses.js` |
| What destroying a system does | `data/systems.js` |
| Gun damage, charge shot, drone, absorb numbers | `data/weapons.js` (`defineWeapon`, `setArsenal`) |
| Score multiplier curve | `setChainRules` (`XD.CHAIN`) |
| Lives, continues, continue gun floor | `setRunRules` (`XD.RULES`) |
| Phase drive timing (drain, recharge, entry cost) | constants at the top of `js/player.js` |
| Key bindings | `GAMEKEYS` and `inp` in `js/core.js` |
| HUD layout, title, pause, game-over text | `js/hud.js` |
| Tutorial prompt text | `js/hud.js` (triggered by any enemy spawned with `tutorial: true`) |
| Bullet kinds (size, colour) | `XD.BK` in `js/bullets.js` |
| Sound and music synthesis | `js/audio.js` |

Working rules:

1. Prefer a data change over an engine change. If a data change needs an `if` on a specific id in `js/`, add a
   field to the definition instead.
2. After any edit, run the syntax check and the regression (below). After a balance change, also run a no-cheat
   bot; the regression bot is invincible and says nothing about difficulty.
3. Look at screenshots for anything visual. Passing checks do not show overlap, clutter or unreadable text.
4. Keep `MODDING.md` in step with any change to a definition field, registry or `__game` hook.
5. New files: add the script tag in the right group in `index.html`.
6. Do not copy any existing game's names, characters, art, levels or music.

## Commands and expected results

Node 26 is installed at `C:\Program Files\nodejs` but may not be on the shell's PATH. Shell environment does not
persist between calls, so set it each time:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path      # PowerShell
```
```bash
export PATH="/c/Program Files/nodejs:$PATH"              # Git Bash
```

Python 3.13 is at `C:\Users\media\AppData\Local\Programs\Python\Python313\python.exe` (the bare `python` on PATH
can be the Microsoft Store stub, which prints "Python was not found" and exits 49).

### Syntax check (seconds)

```bash
for f in js/*.js data/*.js mods/example/example.js; do node --check "$f" || echo "BAD $f"; done
```

Expected: no output at all. Any line is a failure.

### Start-to-victory regression (about 3 minutes)

```bash
node playtest/verify2/full.mjs            # args: [timescale=4] [blockImages 0|1] [screenshot prefix]
node playtest/verify2/full.mjs 4 1 fn     # same, with images blocked
```

Expected: a stream of JSON event lines (`bossOn`, `bossStage`, `bossOff`, `stage`, `scene`), then a summary line
such as `maxBullets 158 realSec 139 score 4827340`, then a `CHECKS` list of 25 lines that all start `PASS`, ending:

```
PASS ZERO PAGE ERRORS []
PAGE ERRORS 0 []
```

The score is roughly 4.7–5.2M and victory arrives at about 140 s real time. With images blocked, the only allowed
page-error line is Chrome's own "Failed to load resource" for the JPG. The bot is invincible with real phase
energy, so this proves the game completes and transitions are clean; it does not measure difficulty.

Screenshots land in `playtest/verify2/` as `<prefix>_NN_<tag>.png`.

### Other current scripts

| Script | What it does | Expected |
|---|---|---|
| `playtest/fix2/lab.mjs` | each weapon, charge shot, drone, absorb burst in 2-D and 3-D, with numbers and screenshots | 0 page errors |
| `playtest/fix2/modtest.mjs [1]` | plays `mods/example/example.js` to victory, then loads a deliberately broken mod and checks each typo is named | 14/14 with images (`1` = images blocked) |
| `playtest/fix2/fairbot.mjs <stage> [boss\|full] [maxSec] [gun] [tag] [nocharge]` | no-cheat bot using debug geometry | clears stage 1 and the Warden with 0 deaths |
| `playtest/verify2/honest.mjs [tag] [maxSec] [charge 0\|1] [stopAfter] [lagMs]` | no-cheat bot with real key presses, optional reaction lag | with charge and no lag: victory, 0 deaths, about 4.7M |
| `playtest/verify2/docmod.mjs [all\|ab]` | builds a mod from the `MODDING.md` snippets in a throwaway copy and plays it | 11/11 (`all`), 9/9 (`ab`) |

Scripts in `playtest/build`, `improve`, `regress`, `restructure` and `powerups` are stale: they target earlier
builds and some of their checks no longer match.

### Writing a new headless test

```js
import { launch } from 'file:///C:/Users/media/projects/extradimensional/tools/harness.mjs';
const t = await launch({ outDir: 'C:/Users/media/projects/extradimensional/playtest/mytest' });
// options: width, height, blockImages: true, url: 'file:///.../other/index.html'
await t.page.keyboard.press('Enter');        // t.page is a Playwright Page; key events are real and trusted
await t.hold('Space', 800);                  // hold a key for ms
console.log(JSON.stringify(await t.state()));
await t.shot('name');                        // -> <outDir>/name.png
console.log(t.errors);                       // page exceptions + console errors/warnings; should be []
await t.close();
```

`window.__game` hooks: `state()`, `debug()`, `start()`, `setStage(n)`, `skipToBoss()`, `setInvincible(b)`,
`setInfiniteEnergy(b)`, `setTimeScale(x)` (0.1–20), `give(what)`, `drop(id, x, y)`, `stages()`, `weapons()`.

In the browser console, content problems appear as `console.warn` lines starting `XD:`; the title screen shows a
red "CONTENT WARNINGS — PRESS F12" line when there are any.

## Errors hit during development

Environment and tooling:

- **`node` / `npm` not recognised.** The session's PATH predates the install. Prefix PATH as shown above.
- **`python` exits 49 with "Python was not found".** That is the Store alias stub; use the full path.
- **Game pauses itself during tests.** The game auto-pauses on window blur, and several headless browsers running
  in parallel steal focus from each other. Bots must detect scene `paused` and un-pause.
- **"Failed to load resource" trips a zero-errors check.** Chrome logs it when the JPG is deliberately blocked or a
  mod image is missing. The game itself throws nothing; ignore that one line.
- **Agents cut off mid-edit.** A login expiry (API 403) killed a long pass after 27 minutes and left untested,
  half-integrated code across ten files. Check file timestamps and run the syntax check before resuming, and keep
  a backup before large passes.
- **Parallel editors on the same files.** Use small targeted edits and re-read the region first; never rewrite a
  whole file while another pass is running.

Code:

- **TypeError when a laser killed the player while other lasers were active.** The laser loop in `js/bullets.js` kept
  iterating after `hitPlayer()` had changed the laser list. Fixed by breaking out when the player dies. Watch for this shape in any
  loop whose body can call `hitPlayer` or `clearWorld`.
- **A whole mod silently missing.** Declaring the same `const { P } = XD` twice inside one IIFE is a SyntaxError,
  so nothing in the file registers. From `file://` Chrome hides the error text from the page; the title screen can
  only say a script failed, and the file and line are in the F12 console.
- **Bot stalled forever on a live system.** `state()` rounded hp to one decimal, so a system at 0.03 hp read 0 and
  the bot treated it as dead. Fixed: a live system never reads below 0.1. Use `open` and `dead`, not hp, in bots.
- **Charge-shot chain hop damaged the next boss phase** the instant the current one broke. Fixed; hops skip
  systems that were not open when the blast fired.
- **Quit to title while phased or charging left stale state** (tilted grid, hit-stop, flash, held charge) on the
  next run. `startRun()` now resets them; any new per-run state needs the same reset.
- **Re-entry inside a boss hull killed the player.** Now every hull throws the ship clear ahead of the bow, and
  boss hulls push but never kill. Do not reintroduce hull-contact death for bosses.
- **Gap walls spawned on top of the player.** They now emerge from the prow after a telegraph, and no bullet
  spawns within 80 px of the ship.

Testing and balance:

- **A stuck bot is not always a game bug.** Bots stalled because they never shot anchors, or panic-phased so often
  they had no energy to dive. Check the bot's rule before changing the game.
- **Bots dodge better than people.** They read exact bullet geometry from `debug()`. "0 deaths" from a bot does
  not mean easy for a human; no human playthrough has been recorded.
- **Balance changes fight each other.** Adding the charge shot halved boss times; raising boss hp to compensate
  slowed players without it. Re-measure bosses with and without charge after touching either.
- **Headless runs are muted.** Audio has never been listened to.

## Ontology of labels

### Dimensions and the drive

| Label | Meaning |
|---|---|
| the plane, 2-D, flat | the normal play field |
| phase, phased, above the plane, 3-D | the fighter lifted out of the plane: invincible, sees cutaways, weapon acts inside hulls |
| PHASE DRIVE | the energy meter. `G.energy` 0–1; about 2.8 s from full; needs 0.15 to engage |
| DRIVE READY / DRIVE CHARGING / DRIVE EMPTY | meter states |
| forced drop, THE PLANE CLOSES OVER YOU | energy ran out while phased; key must be released before phasing again |
| re-entry, RE-ENTRY SHOCK | dropping back inside a hull: shockwave, then the ship is ejected ahead of the bow with brief invulnerability |
| graze | a bullet passing close in 2-D; refills the drive |
| lock, LOCKED, reticle | the 3-D weapon's target: the nearest open system under the ship |
| cutaway | the 3-D rendering of an enemy showing its internals |

### Defences (enemy definition fields)

| Label | Meaning |
|---|---|
| `armor` | multiplier on 2-D damage taken. `1` = full damage, `0` = immune. Lower is tougher. |
| absolute armour, "ARMOUR — NO EFFECT" | `armor: 0` (and every boss): the 2-D gun does nothing |
| `shield`, SHIELDED | front shield blocking all 2-D fire until its shield generator dies or a charge beam cracks it |
| SHIELD CRACKED | temporary gap opened by a charged beam |
| `fodder` | small craft with a single `core`, killable in 2-D |
| capital ship | any non-fodder ship; has several systems |
| `field`, ANCHOR FIELD — NO PHASE | radius in which phasing cannot start and an active phase drains 3.5x |
| tethered, ANCHOR-TETHERED | a boss system sealed until its anchor is destroyed in 2-D |
| open / SEALED | whether a system can be locked right now (`open` in `state()`) |

### Internal systems (`data/systems.js`)

| Kind | On-screen label | Destroying it |
|---|---|---|
| `core` | CORE | kills a fodder craft |
| `reactor` | REACTOR | kills the ship from inside; its bullets convert to shards |
| `magazine` | MAGAZINE | large blast that damages neighbours and cancels bullets; guns dead; hull breached to 2-D fire |
| `shield` | SHIELD GEN | drops the shield |
| `bridge` | BRIDGE | ship stops firing, drifts, then scuttles |
| `engine` | ENGINES | ship stalls and falls behind off-screen ("LEFT BEHIND") |
| `hangar` | HANGAR | stops fighter launches |

FULL GUT = wrecking a ship's side systems before the fatal one (chain and score bonus).

### Enemies (`data/enemies.js`)

| Id | Class | Defence |
|---|---|---|
| `mote` | fodder | none |
| `lancer` | fodder, dives | none |
| `weaver` | capital | armour 0.35 |
| `bulwark` | capital | front shield |
| `ironclad` | capital | absolute armour (the tutorial ship) |
| `scythe` | capital, laser | armour 0.12 |
| `carrier` | capital, launches motes | armour 0.08 |
| `bastion` | capital, four gun points | armour 0.05 |
| `anchor` | no internals, 2-D only | projects an anchor field |

Movement ids (`ai`): `drift`, `sine`, `swoop`, `dive`, `hold`, `attach`, `boss`. An unknown id falls back to
`drift` without a warning.

### Bosses (`data/bosses.js`)

| Id | Name | Stage |
|---|---|---|
| `warden` | Warden cruiser "Obligation" | 1, THE PICKET LINE |
| `leviathan` | Leviathan carrier "Mother of Knives" | 2, THE FOUNDRY FLEET |
| `maw` | Flagship "The Last Argument" (concept art) | 3, THE ARMADA ENTIRE |

A boss "phase" is one step of its sequence of open systems (`e.stage`, `bossStage` in `state()`). This is
unrelated to the player's phase drive, and `e.stage` is unrelated to the game stage `G.stage`.
`bossStage` 99 in test logs means the boss is dying.

### Bullets, pickups, weapons

Bullet kinds (`XD.BK` index): 0 small pink, 1 medium orange, 2 small yellow needle, 3 large red. The drone blocks
kinds 0–2 only.

| Pickup id | Shown as | Effect |
|---|---|---|
| `E` | cyan hexagon | PHASE CELL: +0.34 drive energy |
| `P` | green | GUN LEVEL up (max 4); score when maxed |
| `L` | 1UP | EXTRA SHIP |
| `D` | cyan pod "D" | tether drone, then upgrades it (Mk 1–3) |
| `W` | cycling capsule | offers the weapons not carried |
| `WS`, `WL`, `WK` | S, L, K | SPREAD, LANCE, SEEKER directly |

Weapons: `pulse` (start), `spread`, `lance`, `seeker`. "The beam" is the 2-D charge-shot release, not the LANCE
weapon (the data key is still `charge.lance`).

Other terms: shard = score/energy fragment from a converted bullet; BANK = bullets absorbed while phased (max 40),
released as the ABSORB BURST on re-entry; DECOY = the drone left in the plane while the ship is phased;
SNAP-BACK = the drone's damaging return; GUT CHAIN = the score multiplier (`G.mult`), raised by internal kills.

### Scenes and state names

| Internal `G.scene` | `__game.state().scene` |
|---|---|
| `title` | `title` |
| `play` | `playing` |
| `pause` | `paused` |
| `gameover` | `gameover` |
| `victory` | `victory` |

Globals on `XD`: `G` (run state), `P` (player), `DRONE`, `enemies`, `bullets`, `shots` (player shots), `lasers`,
`walls`, `pickups`. On an enemy instance: `e.T` is its definition, `e.comps` its systems, `e.tm` / `e.cn` the
timers and counters used by `every(e, key, period)`.

### Controls

Move: arrows or WASD. Phase: hold Space, X or K. Fire: automatic; F toggles manual on Z / J. Charge shot: hold
Z / J (auto-fire mode) or C / L, release to fire. Focus (slow, drone forward, decline weapon pickups): Shift.
Pause: P or Esc (Q quits to title). Mute: M. Start / continue: Enter.

### Test-report vocabulary

| Term | Meaning |
|---|---|
| no-cheat / honest bot | plays with real key presses and no `setInvincible` / `setInfiniteEnergy`; may still read `debug()` |
| traversal bot | invincible bot used by the regression to walk the whole game |
| timescale | `setTimeScale` factor; "game seconds" are simulated time, "real seconds" wall time |
| images blocked | run with the JPG refused, to exercise the procedural fallback |
| lab | scripted scene that sets up one mechanic and measures it |

## Known open issues

- Bosses rarely kill a competent bot; with the charge shot the Warden falls in about 39 s (target was 60–120 s).
- Two full charge beams kill a shielded `bulwark` from outside, skipping the shield lesson.
- The drone's value as a bullet shield is unproven; its decoy role works.
- Weapons look similar above the plane (they differ mainly by reticle colour and the DRILL plate).
- The flagship's collision polygon only approximates its artwork.
- Never tested: a human playthrough, audio, a visible desktop browser, browsers other than Chrome, 144 Hz displays.
