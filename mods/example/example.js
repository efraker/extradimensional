/* ============================================================
   mods/example/example.js — the worked example from MODDING.md, as ONE drop-in file.
   To try it: in index.html, un-comment the line
       <script src="mods/example/example.js"></script>
   (it sits just above js/main.js) and reload. The game is then one stage longer.

   Using ONLY registry calls (no engine or stock data file is touched) it adds:
     (d) two image assets        (e) a pickup            (a) an enemy with internals + its bullet pattern
     (f) a weapon                (c) a two-phase boss    (b) a 4th stage that uses all of them
   Every snippet in MODDING.md (a)-(f) is a piece of this file, inside this same IIFE.
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  // everything the snippets below use, taken from XD once:
  const { P, TAU, every, fireB, ring, fan, wall, aimP, gunPos, bs, tier, popup, convertBullets } = XD;

  /* (d) image assets: name -> path relative to index.html */
  XD.defineAssets({
    hornet_ext: 'mods/example/art/hornet_ext.png',
    hornet_cut: 'mods/example/art/hornet_cut.png'
  });

  /* (e) a pickup: cancels every bullet on screen (they become score shards) */
  XD.definePickup('B', {
    color: '#ffd23e', label: 'B', shape: 'hex', spin: -2,
    collect() {
      const n = convertBullets();
      popup(P.x, P.y - 60, 'BULLET BOMB  ×' + n, '#ffd23e', true);
    }
  });

  /* (a) an enemy with internals, image art, and its own bullet pattern */
  XD.defineEnemy('hornet', {
    rw: 70, rh: 34,                 // half-size of the hull in pixels
    hp: 90, armor: 0.2,             // 90 hull points; the flat gun does 20% damage
    score: 1200, glow: '#ffd23e', spikes: 5,
    poly: [[-1, 0], [-.4, -.8], [.6, -1], [1, -.3], [1, .3], [.6, 1], [-.4, .8]],
    // internals: [kind, offsetX, offsetY, radius, hp]
    comps: [['reactor', 20, 0, 11, 14],     // destroying it kills the ship (x1.5 score: GUTTED)
            ['engine', 52, 0, 8, 6]],       // destroying it stalls the ship: it falls behind for full credit
    guns: [[-60, 0]],               // one turret on the nose (NOT drawn once the exterior image has loaded: paint it into the art)
    pattern: 'hornet',              // (the default would be 'hornet' anyway: same id)
    dropCell: true,                 // always drops a phase cell
    art: { exterior: 'hornet_ext', cutaway: 'hornet_cut', size: [160, 88] }
  });
  XD.definePattern('hornet', e => {
    if (e.x > 1240) return;                       // hold fire until on screen
    const g = gunPos(e, 0);
    // a 3-way aimed fan every 1.4s (5-way from tier 3 up)...
    if (every(e, 'fan', 1.4)) fan(g[0], g[1], aimP(g[0], g[1]), tier() >= 3 ? 5 : 3, 0.5, 210 * bs(), 2, e);
    // ...and a slow two-armed spiral
    if (every(e, 'spin', 0.2)) for (let k = 0; k < 2; k++) fireB(e.x, e.y, e.t * 2 + k * TAU / 2, 110 * bs(), 0, e);
  });

  /* (f) a weapon: how it fires in the plane, how it fires above it. Naming a pickup id registers the pickup. */
  XD.defineWeapon('rail', {
    name: 'RAIL', letter: 'R', color: '#7dff6a', core: '#ffffff', pickup: 'WR',
    teach: ['RAIL', 'ONE SLOW SLUG THROUGH EVERYTHING  ·  ABOVE: TWO SYSTEMS AT ONCE'],   // banner on first pick-up
    plane: {                                   // 2-D: obeys armour, shields and boss immunity like every flat shot
      interval: 24 / 60, speed: 1600, look: 'beam', len: 90, wid: 6, pierce: 8, armorPierce: 2,
      volley: level => [{ oy: 0, d: 6 + 2 * level }]          // one entry per shot; level = gun level 1..4
    },
    above: { interval: 4 / 60, damage: 0.7, reach: 48, targets: 2, radius: 160, share: 1, fx: '#7dff6a' }   // 3-D
  });

  /* (c) a boss with phased systems */
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
        // phase 1: the reactor, tethered by one anchor that must be shot down in the plane first
        systems: [['reactor', 90, 10, 18, 34]],
        reward: ['WR', 'P'],                       // drops the RAIL (or a gun upgrade if you already carry it) when this phase opens
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

  /* (b) a stage with waves and a boss — defining it is ALL it takes to make the game one stage longer.
     (To put it somewhere else: XD.defineStage({...}, { after: 'picket' }) — the stock ids are picket, foundry, armada.) */
  XD.defineStage({
    id: 'longway',
    name: 'THE LONG WAY ROUND',          // shown under "STAGE 4"
    boss: 'gatekeeper',                  // null = the stage just ends
    hue: 150,                            // backdrop hue
    music: { key: 43, bpm: 144, busy: true },
    end: 20,                             // timeline length in seconds; then the boss arrives
    // the victory screen shows this (the last) stage's boss by default; text can be set here too
    victory: { title: 'THE GATE IS OPEN', line: 'Four stages. One ship. Nothing left that is flat.' },
    script({ motes, swoop, lancers, hold, msg, spawn }) {
      motes(1, 8, 200, { amp: 70 }); motes(1.5, 8, 520, { amp: 70 });       // two snakes of 8 motes
      msg(3, 'HORNET GUNSHIP', 'REACTOR ENDS IT — ENGINES LEAVE IT BEHIND', 3);
      hold(3.5, 'hornet', 240, 1000, 10, { drop: 'B' });                    // parks at x=1000 for 10s; carries the new pickup
      hold(4.5, 'hornet', 500, 1040, 10);
      swoop(8, 6, true); lancers(10, [180, 540]);
      spawn(12, 'hornet', 1400, 360, { ai: 'sine', y0: 360, amp: 120, freq: 1.2, spd: 70 });   // any enemy, any movement
    }
  });
})();
