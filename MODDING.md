# EXTRADIMENSIONAL — modding guide

The game is plain classic `<script>` files: no modules, no build step, no libraries, no network.
Double-click `index.html` and it runs from `file://`. Everything lives on one global object, **`window.XD`**.

* **Engine** files (`js/`) define the systems and the *registries*.
* **Data** files (`data/`) describe all content by calling the registries: `XD.defineEnemy`, `XD.definePattern`,
  `XD.defineBoss`, `XD.defineStage`, `XD.definePickup`, `XD.defineWeapon`, `XD.setArsenal`, `XD.defineSystem`,
  `XD.defineAssets`, `XD.defineScreens`, `XD.setDropRules`, `XD.setChainRules`, `XD.setRunRules`, `XD.setStartWeapon`.
* Adding content never requires touching an engine file. The stage list is ordered: the game plays the stages in
  list order and shows the victory screen after the last one. A new stage is appended by default, or put anywhere
  with `XD.defineStage(def, { before | after | replace: id })`.
* A complete, working mod ships with the game: **`mods/example/example.js`** (one enemy, pattern, pickup, weapon,
  boss and a 4th stage). Un-comment its `<script>` line in `index.html` to play it; every snippet in (a)–(f) below
  is a piece of that file.
* **If something of yours does not appear, press F12.** At boot the engine checks every id you used
  (`XD.validate()`) and names each mistake on the console; see [If something does not appear](#if-something-does-not-appear).

Contents: [File map](#file-map) · [Load order](#load-order) · [Conventions](#conventions) ·
[(a) enemy + pattern](#a-an-enemy-with-internals-and-a-bullet-pattern) · [(b) stage](#b-a-stage-with-waves-and-a-boss) ·
[(c) boss](#c-a-boss-with-phased-systems) · [(d) image art](#d-an-image-asset-for-an-enemy) · [(e) pickup](#e-a-pickup) ·
[(f) weapon](#f-a-weapon) · [Does not appear?](#if-something-does-not-appear) · [Power-ups](#power-ups-what-they-do-and-where-the-numbers-live) ·
[Reference](#reference) · [Testing](#testing-a-mod) · [Not data-driven](#what-is-not-data-driven)

---

## File map

| File | What is in it |
|---|---|
| `index.html` | The canvas and the ordered list of `<script src>` tags. Nothing else. |
| **Engine** | |
| `js/core.js` | `window.XD`, constants, maths helpers, game state `XD.G`, player `XD.P`, entity arrays, input, `every()`, **all registries**, run rules, engine banner text, the asset loader, `XD.validate` / `XD.warn`. |
| `js/audio.js` | WebAudio sound effects (`XD.sfx(name)`) and the generative music (key / tempo / lead come from the stage definition). |
| `js/fx.js` | Screen shake, particles, explosions, popups, banners, `addScore`, the gut chain (`chainAdd`), beams (`zap`), `later`, `teach`. |
| `js/bullets.js` | Enemy bullets and the emitters patterns use (`fireB`, `ring`, `fan`, `wall`, `addLaser`), player shots, lasers, hull contact, shards. |
| `js/pickups.js` | Dropping, drifting and collecting pickups. |
| `js/enemies.js` | `spawn`, hull tests, damage, death, drops, movement behaviours (`XD.defineAI`), the enemy update loop. |
| `js/bosses.js` | The phased-boss engine: intro, phase advance, tethers, boss death / stage clear. Knows no boss by name. |
| `js/player.js` | The ship: movement, phase drive, death and respawn. |
| `js/arsenal.js` | The power-ups: firing the equipped weapon in 2-D and 3-D, the charge shot, the tether drone, the absorb burst, `XD.give`. |
| `js/stage.js` | Run / stage flow, the stage-script helpers, continue, victory hand-off. |
| `js/sprites.js` | Procedural ink sprites, image art (`def.art`) with fallback, bullet sprites, backdrop. |
| `js/render.js` | Drawing the world (plane tilt, cutaways, bullets, lasers, effects, the ship). |
| `js/hud.js` | HUD, banners, tutorial prompt, title, pause / game-over panels, victory screen. |
| `js/debug.js` | `window.__game` test hooks. |
| `js/main.js` | Scene keys, the fixed-step loop, boot. **Must be loaded last.** |
| **Data** | |
| `data/assets.js` | Image manifest: name → relative path. |
| `data/systems.js` | Internal system kinds (reactor, magazine, bridge, shield, engine, hangar, core): label, colour, icon, consequence. |
| `data/weapons.js` | The main guns (`pulse`, `spread`, `lance`, `seeker`) and every number of the drone, the charge shot and the absorb burst. |
| `data/pickups.js` | Pickups (`E` phase cell, `P` gun upgrade, `L` extra ship, `D` tether drone, `W` weapon capsule) and the drop rules. |
| `data/patterns.js` | Bullet patterns of the ordinary enemies. |
| `data/enemies.js` | The enemy type table. |
| `data/bosses.js` | The three bosses: hull, phases, per-phase pattern functions, anchors, banners, the flagship's image art. |
| `data/stages.js` | The ordered stage list (timelines, boss, hue, music, bullet-speed scale) and title / victory screen settings. |
| **Other** | |
| `Gemini_Generated_Image_lzbbd7lzbbd7lzbb.jpg` | The flagship concept art (asset `flagship`). Optional: the game falls back to procedural art without it. |
| `mods/example/` | The worked example of this guide as one drop-in file (`example.js`) plus its two PNGs (`art/`). Not loaded unless you un-comment its line in `index.html`. |
| `tools/harness.mjs`, `playtest/` | Headless playtest harness and test scripts (not needed to play). |

## Load order

```
js/core.js  js/audio.js  js/fx.js  js/bullets.js  js/pickups.js  js/enemies.js  js/bosses.js
js/player.js  js/arsenal.js  js/stage.js  js/sprites.js  js/render.js  js/hud.js  js/debug.js   <- engine
data/assets.js  data/systems.js  data/weapons.js  data/pickups.js  data/patterns.js
data/enemies.js  data/bosses.js  data/stages.js   [your files here]                   <- data
js/main.js                                                                            <- boot (last)
```

Rules:

1. Every engine file runs before any data file, so a data file can use anything on `XD` at load time.
2. Data files only *register* things; ids are looked up when the game runs, so the order **among data files does not
   matter** — with two soft exceptions. `XD.defineStage(def)` appends, so call order is stage order *unless* you pass
   a position (`{ before | after | replace: id }`, see [defineStage](#xddefinestagedef-where)). `XD.defineWeapon`
   call order is the order the weapon capsule cycles in, and the first weapon defined is the one a run starts with
   *unless* `XD.setStartWeapon(id)` names another.
3. `js/main.js` builds the sprites from the registries and starts the loop, so it must come after all data.
4. Redefining an id replaces the earlier definition (a later file can override a stock enemy, boss, pattern, pickup,
   weapon, system or asset — and a stage, if both definitions carry the same `id`).

To add your own file, put it in `mods/` (or `data/`) and add one line to `index.html` before `js/main.js`:

```html
<script src="mods/mymod/mymod.js"></script>
<script src="js/main.js"></script>
```

Paths you give to `XD.defineAssets` are relative to `index.html`, not to your script.

## Conventions

* A data file is an IIFE that takes what it needs from `XD`:

  ```js
  (function () {
    'use strict';
    const XD = window.XD;
    const { every, fireB, fan, aimP, bs } = XD;
    // XD.defineEnemy(...), XD.definePattern(...), ...
  })();
  ```

* The world is 1280 × 720, y down. Enemies come from the right and **face left**; the player starts near x = 180.
  The simulation runs at a fixed 60 steps per second (`XD.DT` = 1/60 s).
* Angles are radians: `0` = right, `Math.PI` = left (towards the player's side), `PI/2` = down.
* An enemy *instance* `e` has: `e.x, e.y` (hull centre), `e.rw, e.rh` (half extents), `e.t` (seconds alive),
  `e.T` (its definition), `e.type` (its id), `e.hp`, `e.comps` (systems), `e.tm` / `e.cn` (timers / counters for
  `every`), `e.stage` (bosses: current phase index), and any field passed in the spawn overrides.
* Hull polygons are in *unit* coordinates: `[-1..1, -1..1]` scaled by `rw`, `rh`. Component and gun offsets are in
  pixels from the hull centre (negative x = towards the nose).
* Colours are CSS strings. The art direction is high-contrast manga ink: bone/grey hulls, one saturated glow colour
  per ship, cyan reserved for the player.

---

> **The snippets (a)–(f) are pieces of one file**, `mods/example/example.js`. (a) shows the wrapper; (b)–(f) go
> inside the same IIFE and use the names taken from `XD` by this one line at its top:
>
> `const { P, TAU, every, fireB, ring, fan, wall, aimP, gunPos, bs, tier, popup, convertBullets } = XD;`

## (a) An enemy with internals and a bullet pattern

```js
// mods/mymod/mymod.js
(function () {
  'use strict';
  const XD = window.XD;
  const { P, TAU, every, fireB, ring, fan, wall, aimP, gunPos, bs, tier, popup, convertBullets } = XD;

  XD.defineEnemy('hornet', {
    rw: 70, rh: 34,                 // half-size of the hull in pixels
    hp: 90, armor: 0.2,             // 90 hull points; the flat gun does 20% damage
    score: 1200, glow: '#ffd23e', spikes: 5,
    poly: [[-1, 0], [-.4, -.8], [.6, -1], [1, -.3], [1, .3], [.6, 1], [-.4, .8]],
    // internals: [kind, offsetX, offsetY, radius, hp]
    comps: [['reactor', 20, 0, 11, 14],     // destroying it kills the ship (x1.5 score: GUTTED)
            ['engine', 52, 0, 8, 6]],       // destroying it stalls the ship: it falls behind for full credit
    guns: [[-60, 0]],               // one turret on the nose
    pattern: 'hornet',              // (the default would be 'hornet' anyway: same id)
    dropCell: true                  // always drops a phase cell
  });

  XD.definePattern('hornet', e => {
    if (e.x > 1240) return;                       // hold fire until on screen
    const g = gunPos(e, 0);
    // a 3-way aimed fan every 1.4s (5-way from tier 3 up)...
    if (every(e, 'fan', 1.4)) fan(g[0], g[1], aimP(g[0], g[1]), tier() >= 3 ? 5 : 3, 0.5, 210 * bs(), 2, e);
    // ...and a slow two-armed spiral
    if (every(e, 'spin', 0.2)) for (let k = 0; k < 2; k++) fireB(e.x, e.y, e.t * 2 + k * TAU / 2, 110 * bs(), 0, e);
  });
})();
```

That is a complete enemy: the engine draws a procedural hull from `poly`, an inked cutaway with the two systems,
handles armour, the 3-D lock-on, the consequences of each system, scoring and drops. Put it in a stage with
`hold(t, 'hornet', y, tx, stay)` (see below).

## (b) A stage with waves and a boss

```js
XD.defineStage({
  id: 'longway',                       // optional: lets other files say { before: 'longway' }
  name: 'THE LONG WAY ROUND',          // shown under "STAGE 4"
  boss: 'gatekeeper',                  // a boss id (see c); null = the stage just ends
  hue: 150,                            // backdrop hue
  music: { key: 43, bpm: 144, busy: true },
  end: 20,                             // timeline length in seconds; then the boss arrives
  // bulletSpeed, tier, minGun, armadaCount default from the stage's position in the list
  script({ motes, swoop, lancers, hold, msg, spawn, at }) {
    motes(1, 8, 200, { amp: 70 }); motes(1.5, 8, 520, { amp: 70 });       // two snakes of 8 motes
    msg(3, 'HORNET GUNSHIP', 'REACTOR ENDS IT — ENGINES LEAVE IT BEHIND', 3);
    hold(3.5, 'hornet', 240, 1000, 10, { drop: 'B' });                    // parks at x=1000 for 10s; drops pickup 'B'
    hold(4.5, 'hornet', 500, 1040, 10);
    swoop(8, 6, true); lancers(10, [180, 540]);
    spawn(12, 'hornet', 1400, 360, { ai: 'sine', y0: 360, amp: 120, freq: 1.2, spd: 70 });   // any enemy, any movement
  }
});
```

Because it is defined after the three stock stages it becomes **stage 4**: stage 3's boss now leads into it, and the
victory screen follows *its* boss — showing that boss's wreck (its cutaway sprite). Nothing else needs to change: the
stage count, "STAGE n" banners, music, backdrop, bullet-speed scaling, continue rules, rank thresholds and victory all
derive from the ordered list.

* **Victory screen.** Title and line come from `XD.SCREENS.victory`; the wreck is the last stage's boss. The last
  stage may override any of it with its own block: `victory: { title: 'THE GATE IS OPEN', line: '...', backdrop: 'myAsset', sprite: 'gatekeeper' }`
  (the stock stage 3 uses this to show the flagship painting — which is why that painting disappears from the victory
  screen once your stage is the last one).
* **Somewhere other than the end.** The stock stages have ids `'picket'`, `'foundry'`, `'armada'`:
  `XD.defineStage({ id: 'detour', ... }, { after: 'picket' })` inserts a new stage 2,
  `{ before: 'armada' }` likewise, and `{ replace: 'picket' }` (or simply giving your stage `id: 'picket'`)
  replaces stage 1. Fields you leave out (`bulletSpeed`, `tier`, `minGun`, `music`, `armadaCount`) are
  re-derived from each stage's position whenever the list changes; the stock stages set theirs explicitly.
* **No boss.** `boss: null` ends the stage when the timeline has run out and the capital ships are gone — no warning
  banner, straight to "STAGE n CLEAR".
* **Timing.** `hold(t, ...)` *spawns* the ship at `t` just off the right edge; it flies in at up to 270 px/s, so
  it is on station roughly 2 s later (4 s for something as wide as a dreadnought). Give a `msg` about it the same
  `t`. Events scheduled later than `end` still run, and the boss waits for them.

## (c) A boss with phased systems

```js
XD.defineBoss('gatekeeper', {
  name: 'GATE FRIGATE  "NO THROUGH ROAD"',
  rw: 200, rh: 100, score: 20000, glow: '#39d5ff', spikes: 12,
  poly: [[-1, 0], [-.7, -.6], [-.1, -1], [.7, -.9], [1, -.4], [1, .4], [.7, .9], [-.1, 1], [-.7, .6]],
  guns: [[-180, 0], [-120, -60], [-120, 60]],
  tx: 980, bob: 60,                              // stops at x=980, sways 60px
  deathBanner: ['THE GATE IS OPEN', ''],
  phases: [
    {
      // phase 0: one shield generator is open; gap walls + aimed fans
      systems: [['shield', -80, -30, 14, 20]],
      fire(e, B) {                               // B = the stage's bullet-speed scale
        const n = gunPos(e, 0);
        if (every(e, 'a', 3.2)) wall(e.x - e.rw + 12, 360 + 200 * Math.sin(e.cn.a * 1.4), 190, 140 * B, 1, e);
        if (every(e, 'b', 1.6)) fan(n[0], n[1], aimP(n[0], n[1]), 3, 0.4, 220 * B, 2, e);
      }
    },
    {
      // phase 1: the reactor, tethered by an anchor that must be shot down in the plane first
      systems: [['reactor', 90, 10, 18, 34]],
      reward: ['WR', 'P'],                       // drops the RAIL of (f) when this phase opens (a gun upgrade if you carry it already)
      anchors: [{ ax: -360, ay: 0, hp: 40, field: 160 }],
      banner: ['REACTOR TETHERED', 'KILL THE ANCHOR IN THE PLANE, THEN DIVE', 3.2, true],
      fire(e, B) {
        const a = gunPos(e, 1), b = gunPos(e, 2);
        if (every(e, 'a', 1.8)) ring(e.x - 150, e.y, 20, 120 * B, 0, e, e.cn.a * 0.15);
        if (every(e, 'b', 1.1)) { const g = (e.cn.b % 2) ? a : b; fan(g[0], g[1], aimP(g[0], g[1]), 2, 0.15, 260 * B, 2, e); }
      }
    }
  ]
});
```

The engine does the rest: the hull is immune in the plane, only the current phase's systems can be locked (later ones
show as SEALED), destroying them all breaches to the next phase (bullets cancelled, short pause, banner), every
destroyed system drops a phase cell, the boss bar is segmented per phase, and clearing the last phase kills the ship
and clears the stage. Timers (`every`) reset at each phase change.

How long will it last? As a guide, a mid-skill player does about 8–12 damage per second to a boss over a whole fight
(phasing costs travel and recharge time), so 200 total system hit points is roughly a 30–40 s fight with nothing
firing back; the stock bosses have 184 / 250 / 312. A charged detonation does 12 per open system in range (+10% per
gun level) and never more than 40% of one boss system's full hit points.

## (d) An image asset for an enemy

1. Put the image(s) next to the game, e.g. `art/hornet_ext.png`, `art/hornet_cut.png` (ship facing left, transparent
   background).
2. Name them in the manifest (in `data/assets.js` or your own file):

   ```js
   XD.defineAssets({ hornet_ext: 'art/hornet_ext.png', hornet_cut: 'art/hornet_cut.png' });
   ```

3. Reference them from the enemy (or boss) definition:

   ```js
   XD.defineEnemy('hornet', {
     /* ...as in (a)... */
     art: { exterior: 'hornet_ext', cutaway: 'hornet_cut', size: [160, 88] }
   });
   ```

The procedural sprite is always built first and stays until the images have loaded; if a file is missing or fails to
load, the procedural sprite simply stays — nothing breaks (the console gets one `XD: image "name" (path) did not load`
line, and `__game.state().assets` says `'failed'` for it). You may give only `exterior` or only `cutaway`; the other
view stays procedural. `poly`, `rw`, `rh` still define collision, so trace the outline of your art with `poly`.

**An `exterior` image replaces the WHOLE procedural hull** — plating, bone spikes, the turrets drawn for `guns`
and the glowing eye. `guns` still say where bullets come from, so paint the turrets (and anything else you want
seen) into the art at those offsets. The same goes for `cutaway`: the systems, their rings and name plates are
drawn by the engine on top of your image, the decks are not.

**One image + outline polygons** (how the flagship uses its concept art — see `data/bosses.js`):

```js
art: {
  image: 'flagship',                 // one painting of the ship's cross-section
  size: [860, 480],                  // sprite size in world pixels, centred on the hull
  silhouette: [[.04, .44], ...],     // outline of the ship, as fractions (0..1) of the image
  interior:   [[.26, .27], ...],     // region covered with procedural armour plate in the exterior view
  eye: { x: .118, y: .33, r: 34, color: '#ff3636', fade: 'rgba(255,0,0,0)' },   // optional glow painted on the exterior
  blend: 'lighten',                  // for art on a black background
  filter: 'contrast(1.9) brightness(0.97)',   // optional canvas filter applied to the image
  cutTint: '#f4eddb'                 // paper tint multiplied over the cutaway view
}
```

Exterior = the image clipped to `silhouette` with armour plate painted over `interior`; cutaway (seen from above the
plane) = the image itself, tinted to paper, with the systems drawn on top.

Stages and screens can name images too: `defineStage({ backdrop: 'myNebula' })` paints it over the backdrop gradient,
and `XD.defineScreens({ title: { backdrop: 'myTitleArt' } })` sets the title art.

## (e) A pickup

```js
// uses P, popup and convertBullets from the shared line at the top of the file (do not declare them again)
XD.definePickup('B', {
  color: '#ffd23e', label: 'B', shape: 'hex', spin: -2,
  collect() {                                   // runs when the ship touches it
    const n = convertBullets();                 // cancel every bullet on screen (they become score shards)
    popup(P.x, P.y - 60, 'BULLET BOMB  ×' + n, '#ffd23e', true);
  }
});
```

Ways to make it appear:

* a specific enemy carries it: spawn override `{ drop: 'B' }` (e.g. `hold(3.5, 'hornet', 240, 1000, 10, { drop: 'B' })`).
  It drops at the hull centre when the ship is killed — so a kill from inside usually collects it on the spot. A ship
  that is *left behind* (engines destroyed) drops a phase cell instead of its `drop`;
* a boss phase hands it out: `reward: 'B'`;
* from any function: `XD.dropPickup(x, y, 'B')`;
* change what the engine's own rules drop: `XD.setDropRules({ stageClear: [['L', 700, 300], ['B', 700, 420]] })`.

A pickup id that does not exist is not dropped; the console says `XD: dropPickup: unknown pickup id "..."`.
Give a pickup `optional: true` if taking it is a *choice* (the weapon squares are): it is then never pulled towards
the ship, and flying over it with FOCUS (Shift) held leaves it where it is.

The complete example (a–f in one file) is `mods/example/example.js`; `playtest/fix2/modtest.mjs` plays it headlessly to
verify that the fourth stage is reachable and that victory follows it.

## (f) A weapon

A weapon is one `XD.defineWeapon` call: how it fires **in the plane** and how it fires **above it**. Naming a
`pickup` id registers the pickup for you (a lettered square in the weapon's colour), and the weapon joins the cycle of
the `W` capsule automatically.

```js
XD.defineWeapon('rail', {
  name: 'RAIL', letter: 'R', color: '#7dff6a', core: '#ffffff', pickup: 'WR',
  teach: ['RAIL', 'ONE SLOW SLUG THROUGH EVERYTHING  ·  ABOVE: TWO SYSTEMS AT ONCE'],   // banner on first pick-up
  plane: {                                   // 2-D: obeys armour, shields and boss immunity like every flat shot
    interval: 24 / 60, speed: 1600, look: 'beam', len: 90, wid: 6, pierce: 8, armorPierce: 2,
    volley: level => [{ oy: 0, d: 6 + 2 * level }]          // one entry per shot; level = gun level 1..4
  },
  above: { interval: 4 / 60, damage: 0.7, reach: 48, targets: 2, radius: 160, share: 1, fx: '#7dff6a' }   // 3-D
});
```

Its shots are drawn in `color` / `core` whatever the `look` (set `plane.color` / `plane.core` if the shots should
differ from the badge, as the stock LANCE does); `above.fx` tints its detonations, lock line and reticle ring above
the plane.

Then make it appear: `motes(40, 8, 360, { drop: 'WR' })` or a boss phase `reward: 'WR'`. The `W` capsule offers a
weapon only once the run has *met* it (it was equipped, or its own pickup has dropped) — so the capsule never hands
out a later stage's gun early; give the weapon `capsule: 'always'` to have it in the cycle from the start.
`XD.setStartWeapon('rail')` makes it the gun every run starts with. Test it from the console with `__game.give('rail')`.

---

## If something does not appear

Press **F12** and read the console. At boot `XD.validate()` checks the registries, and the engine checks ids again
when it uses them; every problem is one `console.warn` line starting with `XD:` that names the offending id. If
there are any, the title screen also shows a red line along the bottom ("n CONTENT WARNINGS — PRESS F12"), and an
exception while the game runs shows there as "SCRIPT ERROR: ...". Nothing in this list throws:

| You wrote | What happens | The console says |
|---|---|---|
| `hold(3, 'wasq', ...)` / `spawn(..)` of an unknown enemy id | nothing is spawned | `spawn: unknown enemy type "wasq"` |
| `boss: 'portr'` in a stage | the stage ends without a boss (no warning banner) | `stage 4 ("...") names boss "portr", which is not defined` |
| a system kind that is not defined (`'reactr'`) | it behaves like a plain core: destroying it does nothing special | `enemy "x" has a system of unknown kind "reactr"` |
| `pattern: 'nopat'` | the ship never fires | `enemy "x" names pattern "nopat", which is not defined` |
| `drop: 'ZZ'`, `reward: 'ZZ'`, a drop rule naming it | nothing is dropped | `dropPickup: unknown pickup id "ZZ"` (rewards and drop rules: at boot) |
| `art: { exterior: 'noasset' }`, `backdrop: 'noasset'` | procedural art | `... names asset "noasset", which is not in the manifest` |
| an image file that is missing | procedural art | `XD: image "name" (path) did not load` (an info line, not a warning) |
| a boss phase with no `systems` and no `clearWhen` | the fight can never end | `boss "x" phase 1 has no systems and no clearWhen` |
| `{ after: 'nope' }` in `defineStage` | the stage is appended at the end | `defineStage: no stage with id "nope"` |
| a missing required field (`rw`, `poly`, `hp`, ...) | undefined behaviour | `enemy "x" is missing "poly"` |
| a syntax error in your file, or an exception while it registers (e.g. declaring `const { P } = XD` twice in one IIFE) | **nothing** the file defines exists | the browser's own red error line with file and line, plus `a script file stopped with an error while loading` |
| a wrong `src` path in `index.html` | the file is not loaded | `script file "mods/x.js" could not be loaded` |

Not checked: an unknown `ai` id (the ship falls back to `'drift'`), and anything inside your own functions.
Your own code can report through the same channel: `XD.warn('my message')` (each distinct message once).

---

## Power-ups: what they do and where the numbers live

All four are built around the phase drive. The engine side is `js/arsenal.js`; **every number is in
`data/weapons.js`** (`XD.defineWeapon` for the guns, `XD.setArsenal({ drone, charge, absorb })` for the rest — the
call merges, so a mod can override single fields: `XD.setArsenal({ absorb: { cap: 60 } })`).

### Weapons — `XD.defineWeapon(id, def)`

`P.weapon` is the equipped id; the gun level (`P.gun`, pickup `P`) upgrades whichever weapon is equipped and is kept
when weapons are swapped. Dying keeps the weapon (and costs a gun level, as before).

| Weapon | Pickup | In the plane (2-D) | Above the plane (3-D) |
|---|---|---|---|
| `pulse` (start) | — | Straight bolts, 2 / 3 / 5 / 7 barrels by gun level, every 5 ticks. | 1.15 per detonation every 4 ticks into the one locked system; lock reach 48 px. |
| `spread` | `WS` gold **S** | Fan of 5 / 7 / 9 / 9 shots over ±0.30…0.46 rad every 7 ticks: 0.8 each, the centre shot 2.4. Devastating point-blank, thin (but not toothless) at range. | 0.95 into the lock **and** 0.57 into up to 3 more open systems within 320 px of the ship. About 0.8× pulse on one system, well ahead on two or more. Pale-yellow detonations. |
| `lance` | `WL` white **L** | A long white bar every 9 ticks (3.0 / 3.4 damage; three bars from gun 3) that passes through up to 4 hulls after the first and treats armour as ×3 weaker (never absolute armour). The centre bar always kills a mote. | A drill: ×0.7 at first contact, spinning up to ×2.0 after 1.4 s on the **same** system (`DRILL ×n` above the reticle). It spins *down* (3 s per second) while the lock is lost and restarts only on a different system. Lock reach only 38 px. Ice-white detonations. |
| `seeker` | `WK` violet **K** | 2 / 2 / 3 / 4 homing darts (turn 5.5 rad/s, 0.8 each) every 8 ticks; they pick the nearest hull they can actually hurt. | 1.0 per detonation, locks from 150 px away, holds the lock out to 230 px, and when the system dies the lock **jumps** to the next one within 230 px — hitting ×1.5 for the first 0.6 s after each jump. Violet detonations. |

`defineWeapon` fields:

| Field | Meaning | Default |
|---|---|---|
| `name`, `letter` | HUD name; letter on the pickup and the HUD badge. | id in capitals; its first letter |
| `color`, `core` | Outer / inner colour of its shots (every `look`), pickup and HUD badge. | cyan / white |
| `pickup` | Id of the pickup that equips it (registered automatically, shape `'square'`, `optional`). Omit for a weapon that is never picked up. | none |
| `capsule` | `'always'`: the `W` capsule offers it from the start of a run. Otherwise only once the run has met it. | met first |
| `plane.color`, `plane.core` | Shot colours, if they should differ from the weapon's own. | the weapon's |
| `teach` | `[title, subtitle]` banner the first time it is equipped in a run. | none |
| `plane.interval` | Seconds between volleys. | 5/60 |
| `plane.volley(level)` | Returns the shots of one volley: `[{ oy, ang, d, speed, pierce, hom, ap, life }, ...]` (`oy` = vertical offset from the nose, `ang` = radians, `d` = damage). Per-shot fields override the `plane` defaults below. | required |
| `plane.speed` | Shot speed, px/s. | 1150 |
| `plane.pierce` | Hulls a shot may pass through after its first hit. | 0 |
| `plane.homing` | Turn rate in rad/s (steers at the nearest hull it can hurt). | 0 |
| `plane.armorPierce` | Armour multiplier becomes `min(1, armor × this)`. Armour 0 and bosses stay immune. | none |
| `plane.life` | Seconds before a shot fizzles (use with homing). | forever |
| `plane.look`, `len`, `wid` | How the shot is drawn: `'bolt'`, `'fan'`, `'beam'`, `'dart'` (or `'burst'`, `'drone'`). | `'bolt'` |
| `plane.sfx`, `plane.cap` | Sound name; maximum live shots. | `'shot'`; 90 |
| `above.interval`, `above.damage` | Seconds between detonations; damage each at gun level 1 (+14% per level). | 4/60; 1.15 |
| `above.reach`, `above.fodderReach` | How close (px from the system's edge) the ship must be to lock a system / a small craft. | 48; 40 |
| `above.sticky` | Keep the current lock while it stays within this many px. | 0 (always the nearest) |
| `above.jump` | `true`: when the locked system is destroyed, the lock jumps to the next one within `sticky` px. | `false` |
| `above.jumpBoost`, `jumpTime` | Damage multiplier for `jumpTime` seconds after each jump. | none; 0.5 |
| `above.fx` | Colour of its detonations, lock line and reticle ring above the plane. | the classic orange |
| `above.targets`, `radius`, `share` | Hit up to `targets` open systems per detonation: the lock, then the nearest others within `radius` px of the ship, each for `damage × share`. | 1 |
| `above.ramp` | `{ from, to, time }`: damage multiplier grows while the lock stays on one system (it decays while the lock is lost, resets on a different system). | none |
| `above.hull` | Damage to an ordinary hull when over it with nothing to lock. | 0.55 |

Nothing in `plane` can break the rules of the plane: shields eat every shot, absolute armour and boss hulls ignore
them. Nothing in `above` can reach a system that is not open (`XD.targetable`): sealed boss phases, tethered bosses and
phase-locked hulls stay shut.

### Charge shot — `XD.ARSENAL.charge`

Hold the charge key: **Z / J** while auto-fire is on (the default), **C / L** in either mode (with manual fire, F,
Z / J shoot). **The gun keeps firing while the key is held** — at half rate while the charge builds, at full rate once
it is full and merely being carried — so the old shmup habit of holding the fire button never silences the ship. The
charge survives entering and leaving the plane, so it can be built on the approach and released inside a hull. Losing
window focus drops a held charge (it does not fire when play resumes). On screen the 2-D release is called "the
beam"; its data block is still `charge.lance`.

| Field | Meaning | Value |
|---|---|---|
| `time` | Seconds to a full charge. | 1.1 |
| `min` | Releasing below this level does nothing. | 0.35 |
| `recover` | Seconds before normal fire resumes after a release. | 0.12 |
| `lance.damage`, `gunScale` | **Released in the plane**: damage to every hull in the ship's row at full charge, +20% per gun level; scales with the charge level. | 45, 0.2 |
| `lance.width`, `fullWidth` | Beam height at the minimum / at full charge. | 20, 38 |
| `lance.armorPierce` | Armour counts as `min(1, armor × 2)`. The lance **stops dead** at absolute armour and at bosses. | 2 |
| `lance.crack`, `shielded` | A shield in the row goes down for this many seconds (× charge level), then restarts unless its generator was gutted meanwhile; the cracked ship takes this share of the damage. A window to shoot through, not a kill: the generator is still the answer to a shield. | 1.5, 0.25 |
| `lance.cancel`, `cancelR` | A **full** charge also turns bullets of radius ≤ `cancelR` inside the beam into shards. | true, 6 |
| `blast.damage`, `gunScale` | **Released above the plane**: damage to *every open system* within `radius` of the ship, +10% per gun level. | 12, 0.10 |
| `blast.bossCap` | One release (and each hop) never takes more than this share of a **boss** system's full hit points. | 0.4 |
| `blast.radius` | Reach at full charge (60% of it at zero; drawn as a dashed ring while charged). | 120 |
| `blast.chain`, `chainRange`, `chainDelay` | Then, one hop per entry, the blast runs along the decks to the nearest open system of the same hull it has not hit yet (within `chainRange`), for `damage × entry`. A hop never reaches into a boss phase the blast itself has just opened. | [0.5], 320, 0.14 s |
| `blast.hull` | Hull damage if released inside an ordinary hull with no system in range. | 14 |
| `blast.hitstop` | Frozen frames at full charge. | 8 |

### Tether drone — `XD.ARSENAL.drone` (pickup `D`)

`XD.DRONE` is its state (`level`, `mode`: `'follow' | 'anchor' | 'recall'`, `x`, `y`, `hp`, `down`).

* **In the plane** it rides just ahead of the nose, on the side you are not moving towards, fires with the ship, and
  its body stops bullets of radius ≤ `maxBulletR` (pink smalls, yellow darts, orange mediums — never the big red ones,
  lasers or hulls). Holding **FOCUS** swings it straight in front. A small bullet stopped costs one point of shell, one
  bigger than `heavyR` (the orange mediums) costs two; at zero it goes offline for `down` seconds, then returns with
  a full shell. Shell regrows one point per `regen` seconds.
* **When the ship phases** it stays where it was, in the plane: a decoy. `XD.aimTarget()` — which `aimP` uses — returns
  the drone instead of the ship, so every aimed fan, dart and beam is pointed at it. It keeps firing (×`anchorRate`) at
  the hull the ship is gutting (its shots are ordinary plane shots, reduced by armour), or — when that hull is a boss,
  shielded or absolutely armoured — at the nearest thing it can hurt. A taut tether line
  joins it to the ship. An offline drone is no decoy.
* **When the ship drops back in** it snaps back along the tether at `recallSpeed`: small craft in its path die, other
  hulls take `recall` × armour (nothing against shields, absolute armour or bosses), and every blockable bullet
  within `wake` px of its path is swept away ("SNAP-BACK ×n") — so the drop back into the plane always pays.
* Each further `D` upgrades it (three levels; the stock stages hand out one per stage); each lost ship downgrades
  it one level (level 1 is lost).

| `levels[n]` field | Meaning | Mk 1 | Mk 2 | Mk 3 |
|---|---|---|---|---|
| `hp` | Shell points before it goes offline. | 6 | 10 | 14 |
| `down` | Seconds offline. | 5.0 | 3.5 | 2.5 |
| `regen` | Seconds per point of shell regained. | 1.6 | 1.1 | 0.8 |
| `blockR` | Body radius for blocking. | 16 | 20 | 23 |
| `shots`, `dmg`, `interval` | Its gun (plane shots). | 1 × 1 / 10 ticks | 2 × 1 / 9 ticks | 2 × 1.5 / 8 ticks |
| `recall` | Hull damage of the snap-back. | 14 | 24 | 36 |
| `wake` | Radius swept clear of blockable bullets along the snap-back. | 44 | 56 | 70 |

Other fields: `maxBulletR` 8, `heavyR` 6, `offX`/`offY` 30/34 (where it rides), `frontX` 46, `follow` 0.16,
`anchorRate` 1.5, `shotSpeed` 1100, `recallSpeed` 1900. Add a fourth entry to `levels` for a Mk 4 (the `D` pickup stays
useful until the last level).

### Absorb burst — `XD.ARSENAL.absorb`

Nothing to pick up. While phased, any enemy bullet within `radius` of the ship is removed and **banked** (`G.bank`,
shown orbiting the ship and on the HUD), up to `cap`; past the cap bullets pass through as before. On re-entry the
bank is fired as ordinary plane shots that home on the nearest hull they can hurt — or, when **nothing** in the plane
can be hurt by them (a capital-ship duel; a screen of shields and absolute armour), it is fed back into the drive
instead ("BANK → DRIVE +n%"), so phasing through a boss's fire always buys something.

| Field | Meaning | Value |
|---|---|---|
| `radius` | Pick-up radius around the phased ship. | 40 |
| `cap` | Bank size. | 40 |
| `perShot`, `damage` | Banked bullets per released shot; plane damage per banked bullet (so a full bank is 20 shots of 4 = 80, before armour). | 2, 2 |
| `armorPierce` | Armour multiplier for the burst becomes `min(1, armor × this)`. | 2.5 |
| `refund` | Drive energy per banked bullet when the burst has no target (a full bank = +24%). 0 = always fire. | 0.006 |
| `speed`, `turn`, `life`, `spread` | Burst shot speed, turn rate, lifetime, launch fan (radians). | 820, 7, 2.2 s, 2.4 |

Interactions: the burst is made of plane shots, so shields eat it and bosses and absolute armour ignore it (hence the refund). Coming down
*inside* a hull, the re-entry shock fires first and the burst is held (`G.bankPending`) until the ship has been thrown
clear. A banked bullet is gone: it is not converted to a shard when its owner later dies. Losing a ship empties the bank.

### Pickups and pacing

| Id | Looks like | Does |
|---|---|---|
| `D` | cyan ring with a small pod | Tether drone / upgrade (score + repair at the top level). |
| `WS`, `WL`, `WK` | lettered square in the weapon's colour | Equips that weapon (score if already equipped). Optional: not magnetised; hold FOCUS to fly over it without taking it. |
| `W` | square with a countdown ring | Weapon capsule: cycles every 1.3 s through the weapons you are **not** carrying that this run has already met; you get the letter showing. Optional, like the squares. |

Where they come from: stage scripts (`motes(t, n, y, { drop: 'D', dropAt: 2 })` puts a pickup on one ship of a column;
any spawn override `drop` works), boss phase `reward` (an id or a list — the first useful one drops), `dropBonus`
enemy types (first useful id of `DROPS.bonus`, stock `['P', 'D', 'W']`), and `DROPS.fodderSpecials`
(`[{ id, every, at }]`: fodder kill number `at` mod `every`; stock: a `W` at kill 150 then every 160, only while
useful). Gun upgrades from fodder come at kill 90 and then every 110. The intended curve: gun 2–3 at the first boss,
3–4 at the second, 4 during stage 3; one drone level per stage (`D` at ≈33 s of stage 1, ≈47 s of stage 2, ≈25 s of
stage 3), with boss rewards and `dropBonus` ships replacing what a death cost. First appearances: charge shot banner
at 12.5 s of stage 1, `WS` at ≈47 s; `WL` at the start of stage 2; `WK` at the start of stage 3.

Each system explains itself with a one-line banner the first time it is used in a run:
`XD.teach(key, title, subtitle, seconds, still?)` (once per run, `G.taught`). Lessons never talk over the game: they
wait (`G.teachQ`) until the ship is back in the plane, no tutorial is holding the timeline and no other banner is up.
`still()`, if given, is asked at that moment; if it returns false the lesson is put back for the next time. A banner's
subtitle — in `teach`, `XD.banner` and the stage helper `msg` — may be a **function** returning the text; it is
re-read every frame, so it can name the right key (`XD.chargeKeyName()`) or follow whether the ship is phased.

### Gut chain — `XD.CHAIN` / `XD.setChainRules({...})`

| Field | Meaning | Value |
|---|---|---|
| `max` | Cap. | 99 |
| `hold` | Seconds a gut (system destroyed, capital ship killed from inside) keeps the chain alive. | 5 |
| `warm` | Seconds a kill in the plane or a fodder kill keeps it alive (never extends beyond this). | 1.2 |
| `bleed` | Constant leak per second, as a fraction of the chain. | 0.004 |
| `lapse`, `lapseFrac` | Once the timer is out the chain falls by `lapse + lapseFrac × chain` per second. | 0.3, 0.07 |
| `deathKeep` | Fraction kept when a ship is lost. | 0.5 |
| `system` / `bossSystem` | Gain for a destroyed system. | 0.25 / 0.5 |
| `bossKillCap` | A boss kill pays its `score` × min(chain, this) — once, when the stage clears — plus a flat `score` ("FLAWLESS DUEL") if no ship was lost in the duel. | 8 |
| `gut` / `gutFodder` | Gain for a ship killed from inside. | 0.5 / 0.03 |
| `side`, `fullGut` | Gain per wrecked side system on a gutted ship; bonus for wrecking all of them. | 0.25, 0.5 |
| `kill` / `killFodder` | Gain for a kill in the plane. | 0.1 / 0.01 |
| `leftBehind` | Gain for an engine-killed ship that drops off the screen. | 0.5 |

The timer is held (only the leak runs) whenever there is nothing to gut: during a capital-ship duel and its approach,
between stages, in the first 6 s of a stage and during the tutorial. A no-death bot run now reads about ×13 at the end
of stage 1, ×16 after stage 2 and ×15–18 through stage 3, with dips to ×6 in the lulls (before: ×16 at 50 s, then flat). `XD.chainAdd(v, isGut)` is the one entry point.

---

## Reference

### `XD.defineEnemy(id, def)`

| Field | Meaning | Default |
|---|---|---|
| `rw`, `rh` | Half-width / half-height of the hull in pixels. Hulls with `rh > 20` are drawn as "big" ships (plating, decks in the cutaway). | required |
| `poly` | Hull outline, unit coordinates `[[x, y], ...]` in −1..1, clockwise or not. Used for drawing **and** collision. `XD.starPoly(points, innerRadius)` makes a star. | required |
| `hp` | Hull hit points against the flat gun (each shot does 1, or 1.25 at gun level 4, times `armor`). | required |
| `armor` | Damage multiplier for the flat gun: `1` none, `0.1` heavy, `0` immune ("ARMOUR — NO EFFECT"). | required |
| `score` | Points for the kill. ×1.5 if killed from inside; +50% per side system destroyed first. | required |
| `glow` | Colour of the eye and engine glow. | required |
| `spikes` | Truthy = bone spikes along the hull edges. | none |
| `fodder` | `true` = small craft: one internal hit kills it, touching it kills you, does not build the gut chain. | `false` |
| `shield` | `true` = a forward shield eats flat shots until a `shield` system is destroyed. | `false` |
| `comps` | Internal systems `[[kind, ox, oy, radius, hp], ...]`. Kinds: see `defineSystem`. | `[]` |
| `guns` | Gun mounts `[[x, y], ...]`: drawn as turrets on the procedural hull (not over an `exterior` image); patterns read them with `gunPos(e, i)`. | none |
| `pattern` | Id of the bullet pattern. `null` = never fires. | the enemy's own id |
| `noInt` | `true` = phase-locked hull: the 3-D weapon cannot damage it (and its cutaway never opens). | `false` |
| `field` | Radius of an **anchor field**: inside it the player cannot phase (and the drive drains 3.5× if already phased). Any type with `field` counts as an anchor. | none |
| `dropCell` | `true` = always drops a phase cell when killed (other capital ships: 30%). | `false` |
| `dropBonus` | `true` = also drops a gun upgrade (a cell once the gun is maxed). | `false` |
| `art` | Optional image art, see below. | procedural |

`art` (both forms fall back to the procedural sprite until / unless the images load):

| Field | Meaning |
|---|---|
| `exterior`, `cutaway` | Asset names of ready-made images for the 2-D view and the 3-D cutaway view. Either may be omitted. |
| `image` | *Or:* one asset used for both views together with `silhouette` / `interior` (see (d)). |
| `size` | `[w, h]` in world pixels, centred on the hull. Default for `exterior`/`cutaway`: the hull box `2·rw × 2·rh`. Required with `image`. |
| `silhouette` | (`image`) clip polygon, fractions 0..1 of the image. |
| `interior` | (`image`) polygon plated over with armour in the exterior view. The plate shading is laid out for a polygon filling roughly the middle of the image. |
| `eye` | (`image`) `{ x, y, r, color, fade }` glow on the exterior; x, y are fractions. |
| `filter` | (`image`) CSS canvas filter applied when the image is drawn. |
| `cutTint` | (`image`) colour multiplied over the cutaway view (default `#f4eddb`). |
| `blend` | `globalCompositeOperation` used when drawing the sprite (e.g. `'lighten'` for art on black). |

### `XD.spawn(type, x, y, overrides)` and movement

`overrides` is copied onto the new instance. The useful fields:

| `ai` | Movement | Fields it reads |
|---|---|---|
| `'drift'` (default) | Scrolls left with a gentle bob. | `spd` (60), `y0`, `bob` (10) |
| `'sine'` | Scrolls left on a sine wave. | `spd`, `y0`, `amp` (60), `freq` (2.2), `phase` (0) |
| `'swoop'` | Enters along an edge and swoops across. | `spd`, `y0`, `dir` (+1 from top, −1 from bottom), `amp` (380) |
| `'dive'` | Flies to `tx`, flashes, fires an aimed fan, charges the player's row. | `tx` |
| `'hold'` | Flies to `tx`, holds for `stay` seconds, leaves left. | `tx`, `stay`, `y0`, `spd`, `bob` (14) |
| `'attach'` | Keeps station at an offset from `parent`; dies with it. | `parent`, `ax`, `ay` |
| `'boss'` | Used by the engine for bosses. | — |

Other overrides: `drop: 'E'` (guaranteed pickup id), `tutorial: true` (holds the stage timeline and shows the
how-to-phase prompt while alive), `field` (anchor radius for this instance), `hp` (also becomes the instance's full
hp), plus anything your pattern reads. The overrides are copied over the engine's own fields, so do **not** use these
names for your own data: `id, T, type, comps, boss, stage, tm, cn, dead, dying, x0, seed, rw, rh`. `spawn` returns the
instance, or `null` (with a console warning) if the type id is unknown.
New movement: `XD.defineAI('zigzag', e => { e.x -= e.spd * XD.DT; e.y = ...; })`, then spawn with `{ ai: 'zigzag' }`.

### `XD.definePattern(id, fn)`

`fn(e)` runs every tick for each live enemy using the pattern (not while it is dying, blinded, or leaving past the
player). Toolbox:

| Call | Does |
|---|---|
| `every(e, key, seconds)` | `true` once per period. `e.cn[key]` counts the firings (use it to alternate guns or rotate rings). |
| `fireB(x, y, angle, speed, kind, e, accel?)` | One bullet. Kinds: `0` pink r6, `1` orange r8, `2` yellow dart r5, `3` red r12. Always pass `e` as owner (its bullets cancel when it dies). |
| `ring(x, y, n, speed, kind, e, rotation?)` | `n` bullets in a circle. |
| `fan(x, y, angle, n, spread, speed, kind, e)` | `n` bullets across `spread` radians centred on `angle`. |
| `wall(x, gapY, gapH, speed, kind, e)` | A telegraphed (0.8 s) full-height wall of bullets with one gap. |
| `addLaser(e, ox, oy, angle, telegraph, duration, width, sweep)` | A beam from offset (ox, oy); `sweep` in rad/s. |
| `aimP(x, y)` | Angle from (x, y) to the player — or to the tether drone while it stands in for the phased ship (`XD.aimTarget()` returns whichever it is; use it instead of `XD.P` for anything *aimed*). |
| `gunPos(e, i)` | `[x, y]` world position of gun mount `i`. |
| `spawn(type, x, y, o)`, `countType(id)` | Launch escorts; count live enemies of a type (cap your swarms). |
| `bs()` | Bullet-speed scale of the current stage — multiply speeds by it. |
| `tier()` | Difficulty tier of the current stage (1, 2, 3, ...) for denser variants. |
| `XD.P` | The player (`P.x`, `P.y`). |

Useful instance flags set by the stock systems: `e.magDead` (magazine gone), `e.noSpawn` (hangar gone).

### `XD.defineBoss(id, def)`

All hull fields of `defineEnemy` (`rw, rh, poly, score, glow, spikes, guns, art`; `hp`/`armor` are ignored — boss hulls
are immune), plus:

| Field | Meaning | Default |
|---|---|---|
| `name` | Text above the boss bar. | required |
| `tx` | X where the ship stops after flying in. | 900 |
| `bob` | Vertical sway in pixels around the centre line. | 60 |
| `enterSpeed` | Fly-in speed, px/s. | 130 |
| `deathTime` | Seconds of death throes. | 3.6 |
| `deathBanner` | `[title, subtitle]` shown when it dies. | `STAGE n CLEAR` |
| `breachPause` | Seconds its guns stay silent after each phase break (all bullets are cancelled at the break). | 1.1 |
| `fire(e, B)` | Pattern run in **every** phase, before the phase's own. | none |
| `phases` | Ordered array of phase objects (below). | required |

Phase object:

| Field | Meaning |
|---|---|
| `systems` | `[[kind, ox, oy, radius, hp], ...]` — the systems open during this phase. The phase ends when all are destroyed. |
| `fire(e, B)` | The phase's bullet pattern (`B` = `bs()`); same toolbox as `definePattern`. |
| `reward` | Pickup id — or a list of ids, of which the first `useful()` one is used — dropped ahead of the prow when the phase opens (nothing if none is useful). It drops again each time a continue re-opens the phase, so keep rewards to things with a `useful()` test. |
| `anchors` | `[{ ax, ay, fromX = 1400, fromY = -60, hp, field, type = 'anchor', set }]` — anchors spawned when the phase opens, holding station at offset (ax, ay). While any is alive the boss is **tethered**: nothing inside can be locked. `set` is copied onto the anchor instance. |
| `banner` | `[title, subtitle, seconds, warn]` shown when the phase opens. On phase 0 it replaces the default "ARMOUR ABSOLUTE" intro. |
| `onEnter(e)` | Called when the phase opens (after reward / anchors / banner) — custom set-up. |
| `clearWhen(e)` | For a phase with no systems: return `true` to advance (e.g. `e => e.tethers <= 0 && e.t > 2`). |

Helpers for boss code: `XD.spawnAnchorFor(e, ax, ay, fromX, fromY, type?)` (spawns a tethering anchor, returns it),
`XD.bossAdvance(e)` (force the next phase), `e.stage` (current phase index), `e.tethers`, `e.pause` (seconds the
pattern stays silent).

**Continues.** The engine remembers boss progress in `G.cpBoss = { type, stage, dead: [system names] }`. A continue
taken at the boss brings it back in that phase with those systems already wrecked (each wrecked system's
`onBossResume`, if its kind defines one, is re-applied; the phase's `anchors`, `onEnter` and `reward` run again).
Damage to a system that was not destroyed is *not* kept: a system comes back whole or not at all. The resume notice
is shown first; a banner the phase raises (its `banner`, or one from `onEnter`) follows it 3.4 s later.
A boss definition needs nothing extra for this. Starting the stage over, or `__game.skipToBoss()`, forgets it.

### `XD.defineStage(def, where?)`

`XD.STAGES` is the ordered array the game plays; `G.stage` is the 1-based index into it. `defineStage(def)`
appends — or replaces in place the stage that already has `def.id`. `where` puts it elsewhere:
`{ before: id }`, `{ after: id }` or `{ replace: id }` (stock ids: `'picket'`, `'foundry'`, `'armada'`). The
positional defaults in the last column are re-derived for every stage whenever the list changes.

| Field | Meaning | Default (n = position in the list) |
|---|---|---|
| `id` | A name other files can refer to (`before` / `after` / `replace`). | none |
| `name` | Shown under "STAGE n". | `'STAGE n'` |
| `boss` | Boss id that arrives when the timeline ends; `null` = no boss: the stage simply clears, with no warning banner. | `null` |
| `victory` | `{ title, line, backdrop, sprite }`: overrides `XD.SCREENS.victory` when this is the last stage. | none (the wreck is this stage's boss) |
| `hue` | Backdrop hue 0–360. | 215 |
| `backdrop` | Asset name painted over the backdrop gradient (optional). | none |
| `music` | `{ key, bpm, busy }`: MIDI root note, tempo, and whether the lead is the busier square-wave line. Boss fights add +2 semitones and +16 bpm. | `{ key: 38, bpm: 112 + 8n, busy: n >= 2 }` |
| `bulletSpeed` | Value of `XD.bs()`. | `1 + 0.09 (n − 1)` |
| `tier` | Value of `XD.tier()`. | `n` |
| `minGun` | Dying or continuing never leaves the player below this gun level. | 2 for stage 1, else 3 |
| `armadaCount` | Number of far-off silhouettes on the horizon. | `10 + 6n` |
| `armada` | Enemy ids used for those silhouettes. | `XD.SCREENS.armada` |
| `end` | Timeline length in seconds. The boss arrives once the timeline has run and no capital ship is left (or 12 s later regardless). | 90 |
| `script(s)` | Builds the timeline with the helpers below. Runs each time the stage starts. | empty |

Stage-script helpers (`s.name(...)`, or destructure them: `script({ motes, hold }) { ... }`). `t` is the time in seconds:

| Helper | Does |
|---|---|
| `motes(t, count, y, o?)` | A snake of fodder on a sine wave around row `y`. `o`: `type` ('mote'), `gap` (48 px between ships), `amp` (60), `freq` (2.2), `ph` (0.35 phase step), `spd` (175), `drop` (pickup id carried by one ship of the column), `dropAt` (which ship; default the middle one). |
| `swoop(t, count, fromTop, o?)` | Fodder entering along the top (`true`) or bottom edge and swooping across. `o`: `type` ('mote'), `amp` (400), `spd` (250). |
| `lancers(t, [y, ...], o?)` | One diver per row: flies in, flashes, fires an aimed fan, charges. `o`: `type` ('lancer'). |
| `hold(t, type, y, tx, stay, overrides?)` | A ship that flies in on row `y`, parks at x = `tx` for `stay` seconds, then leaves. `overrides` = any spawn overrides (`drop`, `bob`, ...). |
| `msg(t, title, subtitle, seconds, warn?)` | A banner (`warn` = red hazard style). `subtitle` may be a function returning the text. |
| `spawn(t, type, x, y, overrides?)` | One enemy anywhere, with any movement. |
| `at(t, fn)` | Run any function (use `XD.spawn`, `XD.G`, ... inside). |

### `XD.definePickup(id, def)` and drop rules

| Field | Meaning | Default |
|---|---|---|
| `color` | Outline and label colour — a string, or a function `(p) => string`. | `#7dff6a` |
| `label` | Text on the pickup — a string, or a function `(p) => string` (`p.t` = seconds since it dropped). | the id |
| `labelSize` | Font size in px. | 13 |
| `shape` | `'diamond'`, `'hex'`, `'square'` (filled block, ink letter: weapons) or `'pod'` (the drone). | `'diamond'` |
| `cycle` | Seconds per step of a cycling pickup: draws a countdown ring (the `label` / `color` functions do the cycling). | none |
| `spin` | Rotation in rad/s. | 0 |
| `useful()` | Return `false` when collecting it would be wasted; rules that would hand it out give a cell instead. | always useful |
| `optional` | `true` = a choice: never magnetised, collected only on a close touch, left alone while FOCUS is held. | `false` |
| `collect(p)` | Effect when collected (every pickup also scores 200). | none |

`XD.setDropRules({...})` — which pickups the engine's own rules hand out:
`cell` (id dropped by capital ships / boss systems / stalled ships / every `fodderEvery`-th fodder kill),
`upgrade` (id given instead on fodder kill `fodderUpgradeAt` mod `fodderUpgradeEvery`, and by `dropBonus` types),
`capitalCellChance` (0.3), `stageClear` (`[[id, x, y], ...]` handed out after each non-final stage),
`bonus` (list of ids: a `dropBonus` type drops the first useful one, else a second cell),
`fodderSpecials` (`[{ id, every, at }]`: fodder kill `at` mod `every` drops `id` while it is useful).
`XD.firstUseful(idOrList)` returns the first useful id or `null`.

### `XD.defineSystem(kind, def)` — internal system kinds

Stock kinds: `core` (fodder weak point), `reactor` (kills the ship), `magazine` (area blast, hull breached, guns dead),
`shield` (shield down), `bridge` (blind, scuttles after 3.2 s), `engine` (stalls and is left behind), `hangar` (no more
launches).

| Field | Meaning |
|---|---|
| `label` | Name plate text. Also used in the boss HUD ("OPEN SYSTEMS: ...") and the breach / resume banners. Default: the kind in capitals. |
| `color` | Colour when open to attack. |
| `krak` | Sound-effect lettering when destroyed. |
| `fatal` | `true` if destroying it kills the ship (it then does not count as a "side system" for FULL GUT). |
| `onDestroyed(e, c, cx, cy)` | Consequence on an ordinary ship. |
| `onBossDestroyed(e, c, cx, cy)` | Extra consequence on a boss. |
| `onBossResume(e, c)` | Re-apply a lasting consequence when a continue restores a boss with this system already wrecked (stock: the hangar's `e.noSpawn`). |
| `icon(ctx, x, y, r, t)` | Draws the pictogram inside the system disc: `(x, y)` is its centre **in the ship's local space** (the context is already translated to the hull), `r` its radius, `t` the time in seconds. Stroke and fill start as ink, line width ≈ `0.14 r`. |

Every field is optional: a kind with no `onDestroyed` / `onBossDestroyed` is simply a target (fine as a boss system).

### Assets and screens

* `XD.defineAssets({ name: 'relative/path.png', ... })` / `XD.defineAsset(name, path)` — the manifest.
* `XD.assetImage(name)` → the loaded `Image`, or `null` (not loaded / failed / unknown). Always handle `null`.
  `XD.assetStatus()` → `{ name: 'ready' | 'failed' | 'loading' }`.
* `XD.defineScreens({ armada: [ids], title: { backdrop, sprite, hue, armadaCount }, victory: { title, line, backdrop, sprite }, text: {...} })`
  — `backdrop` is an asset name, `sprite` the enemy/boss id drawn instead while the image is unavailable. The title
  screen is pinned to the flagship art by the stock data (`title: { backdrop: 'flagship', sprite: 'maw' }`); the
  victory wreck defaults to the last stage's boss (see (b)).
* `text` — the banners the engine raises by itself. Each entry is `[title, subtitle]` or a function returning that:
  `stageBanner(n)`, `warning` (boss approach), `tutorialDone`, `bossIntro(labels)`, `breached(labels)`,
  `resumed(labels)`, `stageClear(n)`. Example: `XD.defineScreens({ text: { warning: ['CONTACT', 'SOMETHING VERY LARGE'] } })`.

### Run rules — `XD.setRunRules({...})` (`XD.RULES`)

| Field | Meaning | Value |
|---|---|---|
| `lives`, `continues` | Ships per credit; continues per run. | 3, 3 |
| `bossContinueMinGun` | A continue taken at a boss never brings you back below this gun level (nor below the level you first met it with, nor the stage's `minGun`). | 3 |
| `ranks`, `lastRank` | Victory rank by ships lost **per stage**: the first `[letter, limit]` whose limit is not exceeded, else `lastRank`. Stock: S none, A up to 1 per stage, B up to 8 in 3 stages, else C — so the thresholds scale when a mod adds stages. | `[['S', 0], ['A', 1], ['B', 8/3]]`, `'C'` |

### Other useful `XD` members

`G` (game state: `stage`, `stageTime`, `score`, `lives`, `energy`, `phased`, `boss`, ...), `P` (player), `enemies`,
`bullets`, `W`, `H`, `DT`, `TAU`, `clamp`, `lerp`, `rnd(a, b)`, `hash(n)`, `sfx(name)`, `popup(x, y, text, color, big)`,
`banner(title, sub, seconds, warn)`, `boom(x, y, radius, internal)`, `ringFx(x, y, radius, color, seconds)`, `shake(amount)`,
`addScore(points, x, y, show, tag)`, `blast(x, y, radius, damage, source)`, `killEnemy(e, 'int' | 'ext')`,
`convertBullets(filterFn?)`, `dropPickup(x, y, id)`, `stageDef(n?)`, `TYPES`, `PATTERNS`, `STAGES`, `PICKUPS`, `SYSTEMS`, `ASSETS`.

Power-up side: `WEAPONS`, `WEAPON_ORDER`, `weaponDef(id?)`, `equipWeapon(id)`, `ARSENAL`, `DRONE`, `giveDrone()`,
`aimTarget()`, `addShot(x, y, { ang, d, speed, pierce, hom, ap, life, look, col })` (a plane-bound player shot),
`seekTarget(x, y)`, `chargeLance(level)`, `chargeBlast(level)`, `releaseBank()`, `give(what)`, `teach(key, title, sub, seconds)`,
`zap(x0, y0, x1, y1, width, color, seconds)` (beam / arc effect), `later(seconds, fn)`, `chainAdd(v, isGut)`, `CHAIN`.
`setStartWeapon(id)`, `chargeKeyName()`, `warn(message)`, `validate()`, `screenText(key, arg)`, `RULES`, `setRunRules`.
State: `P.weapon`, `P.charge` (0..1), `P.drill`, `G.bank`, `G.cpBoss`, `G.seenWeapons`, `G.teachQ`.

## Testing a mod

Open `index.html` and use the browser console:

```js
__game.stages()            // the ordered stage list: is yours there?
__game.start(); __game.setStage(4)     // jump straight to stage 4
__game.skipToBoss()        // straight to its boss
__game.setInvincible(true); __game.setInfiniteEnergy(true); __game.setTimeScale(3)
__game.state()             // snapshot: scene, stage, enemies with their systems, boss phase...
                           //   + weapon, charge, banked, chain, shotCount, drone {level, mode, x, y, hp, down}, bossResume
                           //   + assets {name: 'ready'|'failed'|'loading'}, warnings (count), lastError
__game.give('drone')       // also: 'pulse' | 'spread' | 'lance' | 'seeker' (any weapon id) | 'gun' | 'cell' | 'charge' | 'bank' | 'life'
__game.drop('W')           // drop a pickup by id next to the ship: __game.drop(id, x, y)
__game.weapons()           // the registered weapons and their pickup ids
```

`setStage(n)` raises the gun to the stage's `minGun`, as a continue would, so a new stage is not tested under-gunned.

**Writing a bot against `state()`:** for each system, `open` ("can be locked right now") is the authoritative flag
and `dead` says it is destroyed. `hp` is rounded to one decimal for reading, but a live system never reads 0 (it
reads at least 0.1; `bossHp` at least 0.001), so "hp <= 0" is also safe. `imageLoaded` is true once every asset has
settled and at least one loaded; a deliberately missing image shows up as `'failed'` in `assets` and as Chrome's own
"Failed to load resource" console line, which a zero-errors check should ignore.

Headless: `playtest/fix2/` has the current suite — `full.mjs` (title → victory regression, with or without
images), `lab.mjs` (every power-up in 2-D and 3-D, numbers + screenshots), `modtest.mjs` (plays
`mods/example/example.js` to victory, then loads a deliberately broken mod and checks that every typo is named),
`fairbot.mjs` (a no-cheat bot). Older: `playtest/restructure/` has `check.mjs` (syntax + load-order check of every script), `equiv*.mjs` (data and
pattern equivalence against the original single-file build), `full.mjs` (title → victory regression), `shots.mjs`
(comparison screenshots) and `stage4.mjs` (the fourth-stage proof using `mod_example.js`). `playtest/powerups/` has
`sys3d.mjs` (every power-up in 2-D and 3-D, numeric checks + screenshots), `cont.mjs` (boss continues), `fairbot2.mjs`
(a no-cheat bot that also uses the charge shot) and `full.mjs` (the title → victory regression).

## What is not data-driven

Still engine code (change it in `js/`): the player ship (speed, the number of gun levels, phase-drive tuning —
the constants at the top of `js/player.js`; the weapons themselves are data), the key bindings, how shot `look`s
and the drone are drawn, the tutorial prompt text (any enemy spawned with `tutorial: true` triggers it), the
lesson banners of the charge shot / drone / absorb burst (`js/arsenal.js`), popup text such as "ARMOUR — NO EFFECT",
the pause and game-over panels, HUD layout, title-screen text and the game name, the sound-effect and music
synthesis, bullet kinds (`XD.BK` in `js/bullets.js`), the procedural hull art style, and the look of anchor fields /
shields / lasers. An `exterior` image cannot keep the procedural turrets (paint them in). Movement ids (`ai`) are
not validated.

Now data (they were engine code before): lives / continues and the continue gun floor (`XD.setRunRules`), the rank
thresholds (per stage), the engine's own banners (`defineScreens({ text })`), the starting weapon
(`XD.setStartWeapon`), stage position (`defineStage(def, where)`), the victory art (the last stage's boss / its
`victory` block).
