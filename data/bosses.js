/* ============================================================
   data/bosses.js : the capital-ship bosses.
   XD.defineBoss(id, {
     ...every hull field of defineEnemy (rw, rh, poly, score, glow, spikes, guns, art)...
     name          text above the boss bar
     tx            x where the ship stops after flying in;  bob = vertical sway in pixels
     enterSpeed    fly-in speed (default 130);  deathTime = seconds of death throes (default 3.6)
     breachPause   seconds the guns stay silent after each phase break (default 1.1)
     deathBanner   [title, subtitle] shown when it dies (default: "STAGE n CLEAR")
     fire(e, B)    optional pattern run in EVERY phase (B = bullet-speed scale of the stage)
     phases: [ {                     one entry per phase, in order; the ship dies when the last one is cleared
       systems     [[kind, ox, oy, radius, hp], ...] the systems open during this phase (all must be destroyed)
       fire(e, B)  the bullet pattern of this phase (same toolbox as data/patterns.js)
       reward      pickup id dropped ahead of the prow when the phase opens (only while useful)
       anchors     [{ ax, ay, fromX, fromY, hp, field, type, set }] anchors that tether the ship while alive:
                   nothing inside the hull can be locked until every tether is destroyed in the plane
       banner      [title, subtitle, seconds, warn] shown when the phase opens (phase 0: replaces the default intro)
       onEnter(e)  anything else that should happen when the phase opens
       clearWhen(e)  for phases with no systems: return true to move on
     } ]
   })
   Boss hulls are always immune to the flat gun; e.stage is the index of the current phase.
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { DT, TAU, clamp, rnd, every, defineBoss, fireB, ring, fan, wall, aimP, addLaser, gunPos, spawn, countType, spawnAnchorFor, banner } = XD;

  /* ============================================================
     STAGE 1 — WARDEN: magazines -> bridge -> reactor
     Lots of SLOW bullets (dense, readable curtains), few fast aimed ones; escorts keep the drive fed.
     ============================================================ */
  defineBoss('warden', {
    name: 'WARDEN-CLASS CRUISER  "OBLIGATION"',
    rw: 250, rh: 120, score: 30000, glow: '#ff8a1f', spikes: 14,
    poly: [[-1, 0], [-.9, -.35], [-.6, -.6], [-.3, -.7], [-.1, -1], [.5, -1], [.75, -.7], [1, -.5], [1, .5], [.75, .7], [.5, 1], [-.1, 1], [-.3, .7], [-.6, .6], [-.9, .35]],
    guns: [[-190, -62], [-190, 62], [-235, 0]],   // upper battery, lower battery, nose
    tx: 960, bob: 120,

    // every 10s during the first two phases a mote escort flies past; the middle one carries a phase cell
    fire(e) {
      if (e.stage < 2 && every(e, 'esc', 10)) {
        const top = e.cn.esc % 2, y = top ? 150 : 570;
        for (let i = 0; i < 5; i++) spawn('mote', 1310 + i * 50, y, { ai: 'sine', y0: y, amp: 46, freq: 2.2, phase: i * 0.35, spd: 185, drop: i === 2 ? 'E' : undefined });
      }
    },

    phases: [
      {
        systems: [['magazine', -120, -42, 15, 38], ['magazine', -50, 52, 15, 38]],
        fire(e, B) {
          const a = gunPos(e, 0), b = gunPos(e, 1), n = gunPos(e, 2);
          if (every(e, 'a', 1.6)) { const g = (e.cn.a % 2) ? a : b; fan(g[0], g[1], aimP(g[0], g[1]), 5, 0.7, 185 * B, 1, e); }
          if (every(e, 'b', 2.5)) ring(n[0], n[1], 24, 110 * B, 0, e, e.cn.b * 0.13);
        }
      },
      {
        systems: [['bridge', 70, -64, 13, 48]],
        reward: 'P',
        fire(e, B) {
          const a = gunPos(e, 0), b = gunPos(e, 1), n = gunPos(e, 2);
          // a three-armed spiral that only fires forward
          if (every(e, 'a', 0.1)) { const an = e.t * 1.7; for (let k = 0; k < 3; k++) { const q = an + k * TAU / 3; if (Math.cos(q) < 0.4) fireB(n[0] + 40, n[1], q, 145 * B, 0, e); } }
          if (every(e, 'b', 2.4)) { fan(a[0], a[1], aimP(a[0], a[1]), 3, 0.2, 245 * B, 2, e); fan(b[0], b[1], aimP(b[0], b[1]), 3, 0.2, 245 * B, 2, e); }
        }
      },
      {
        systems: [['reactor', 120, 18, 19, 60]],   // (no reward here: the bridge phase already gave a gun level, the stage clear gives another)
        fire(e, B) {
          const a = gunPos(e, 0), b = gunPos(e, 1), n = gunPos(e, 2);
          if (every(e, 'a', 1.4)) ring(n[0], n[1], 28, 130 * B, e.cn.a % 2, e, e.cn.a * 0.1);
          if (every(e, 'b', 0.9)) { const g = (e.cn.b % 2) ? a : b; fan(g[0], g[1], aimP(g[0], g[1]), 3, 0.3, 240 * B, 2, e); }
          if (every(e, 'c', 6.5)) addLaser(e, -250, 0, aimP(e.x - 250, e.y), 1.1, 0.8, 30, 0);
        }
      }
    ]
  });

  /* ============================================================
     STAGE 2 — LEVIATHAN: shield -> hangar -> bridge -> reactor (tethered by an anchor)
     ============================================================ */
  defineBoss('leviathan', {
    name: 'LEVIATHAN CARRIER  "MOTHER OF KNIVES"',
    rw: 310, rh: 150, score: 50000, glow: '#7dff6a', spikes: 15,
    poly: [[-1, -.1], [-.85, -.55], [-.5, -.8], [0, -.9], [.3, -1], [.8, -.9], [1, -.4], [1, .4], [.8, .9], [.3, 1], [0, .9], [-.5, .8], [-.85, .55], [-1, .1]],
    guns: [[-290, 0], [-200, -100], [-200, 100]],   // nose, upper battery, lower battery
    tx: 930, bob: 70,

    phases: [
      {
        systems: [['shield', -180, -66, 15, 50]],
        fire(e, B) {
          const a = gunPos(e, 1), b = gunPos(e, 2);
          if (every(e, 'a', 2.7)) wall(e.x - e.rw + 12, 360 + 230 * Math.sin(e.cn.a * 1.15), 170, 150 * B, 1, e);
          if (every(e, 'b', 1.5)) { const g = (e.cn.b % 2) ? a : b; fan(g[0], g[1], aimP(g[0], g[1]), 5, 0.5, 235 * B, 2, e); }
        }
      },
      {
        systems: [['hangar', -90, 46, 19, 56]],
        reward: ['P', 'D', 'W'],
        fire(e, B) {
          const n = gunPos(e, 0), a = gunPos(e, 1);
          // the swarm (until the hangar is gutted), twin sweeping streams, and a ring
          if (!e.noSpawn && every(e, 'a', 0.75) && countType('mote') < 16) {
            spawn('mote', e.x - 200, e.y + 46, { ai: 'sine', y0: clamp(e.y + rnd(-200, 200), 80, 640), amp: rnd(40, 120), freq: rnd(1.5, 2.6), spd: rnd(170, 230) });
          }
          if (every(e, 'b', 0.11)) { fireB(n[0], n[1], Math.PI + Math.sin(e.t * 1.1) * 1.15, 165 * B, 0, e); fireB(n[0], n[1], Math.PI - Math.sin(e.t * 1.1) * 1.15, 165 * B, 0, e); }
          if (every(e, 'c', 3.3)) { ring(a[0], a[1], 18, 120 * B, 1, e, e.cn.c * 0.2); }
        }
      },
      {
        systems: [['bridge', 90, -92, 14, 54]],
        fire(e, B) {
          const n = gunPos(e, 0), a = gunPos(e, 1), b = gunPos(e, 2);
          // alternating sets of horizontal beams across fixed rows of the screen
          if (every(e, 'a', 4.4)) { const ys = (e.cn.a % 2) ? [-230, 0, 230] : [-115, 115, -300]; for (const yy of ys) addLaser(e, -300, 360 + yy - e.y, Math.PI, 1.25, 1.0, 44, 0); }
          if (every(e, 'b', 0.85)) { const g = (e.cn.b % 2) ? a : b; fan(g[0], g[1], aimP(g[0], g[1]), 7, 0.95, 185 * B, 1, e); }
          if (every(e, 'c', 2.2)) ring(n[0], n[1], 18, 118 * B, 0, e, e.cn.c * 0.17);
        }
      },
      {
        systems: [['reactor', 170, 34, 21, 90]],
        // the reactor is tethered: the anchor has to die in the plane first.
        // (softened after playtests: a smaller field and a lighter anchor, slower walls and darts while it lives)
        anchors: [{ ax: -470, ay: 0, fromX: 1400, fromY: -60, hp: 40, field: 175 }],
        reward: ['D', 'W'],
        banner: ['DIMENSIONAL ANCHOR', 'IT TETHERS THE REACTOR — KILL IT IN THE PLANE', 3.6, true],
        fire(e, B) {
          const n = gunPos(e, 0), a = gunPos(e, 1), b = gunPos(e, 2);
          const teth = e.tethers > 0;   // while the anchor lives the ship holds back: you are stuck in the plane
          if (every(e, 'a', teth ? 4.4 : 3.6)) wall(e.x - e.rw + 12, 360 + 220 * Math.sin(e.cn.a * 1.7 + 1), 195, 150 * B, 1, e);
          if (every(e, 'b', teth ? 0.2 : 0.14)) { const an = e.t * 1.3; for (let k = 0; k < 2; k++) { const q = an + k * Math.PI; if (Math.cos(q) < 0.3) fireB(n[0] + 60, n[1], q, 140 * B, 0, e); } }
          if (every(e, 'c', teth ? 2.6 : 1.9)) { fan(a[0], a[1], aimP(a[0], a[1]), 2, 0.14, 300 * B, 2, e); fan(b[0], b[1], aimP(b[0], b[1]), 2, 0.14, 300 * B, 2, e); }
        }
      }
    ]
  });

  /* ============================================================
     STAGE 3 — THE FLAGSHIP ("maw"): anchor pylons -> shield + magazine -> bridge + hangar -> engines -> reactor
     Uses the concept-art image when it loads (art below); otherwise the procedural hull from `poly`.
     ============================================================ */

  // the reactor phase keeps sending anchor drones: each one tethers the reactor until it is shot down
  const MAW_DRONE_GAP = 16;   // seconds of free drive between anchor drones (was 9: it stalled imperfect players)
  function mawDrone(e) {
    const a = spawnAnchorFor(e, -500, rnd(-170, 170), 1400, rnd(100, 620));
    if (!a) return;
    a.hp = a.maxHp = 36; a.field = 140; a.drop = 'E';   // each drone shot down is worth a phase cell
    banner('ANCHOR DRONE', 'THE REACTOR IS TETHERED — KILL THE DRONE IN THE PLANE', 2.6, true);
  }

  defineBoss('maw', {
    name: 'FLAGSHIP  "THE LAST ARGUMENT"',
    rw: 420, rh: 228, score: 100000, glow: '#ff3636', spikes: 22,
    poly: [[-1, -.1], [-.92, -.42], [-.76, -.52], [-.6, -.78], [-.2, -.96], [.4, -1], [.75, -.84], [1, -.3], [1, .3], [.8, .82], [.3, 1], [-.3, .96], [-.7, .76], [-.86, .42], [-.78, .16], [-.92, .1]],
    guns: [[-335, -24], [-129, -186], [20, -204], [-100, 200], [150, 214]],   // maw, top fore, top aft, bottom fore, bottom aft
    tx: 850, bob: 34, enterSpeed: 150, deathTime: 5,
    deathBanner: ['THE FLAGSHIP IS GONE', ''],

    // one image + hand-traced outlines (fractions of the image, 0..1): `silhouette` clips the art to the ship,
    // `interior` is the region plated over with armour for the exterior view; the cutaway shows the art itself.
    art: {
      image: 'flagship',
      size: [860, 480],                             // sprite size in world pixels, centred on the hull
      blend: 'lighten',                             // the art is drawn on black
      filter: 'contrast(1.9) brightness(0.97)',     // crush the JPEG's dark greys to true black so 'lighten' leaves no halo
      silhouette: [[.04, .44], [.09, .30], [.17, .19], [.28, .09], [.33, .02], [.47, .01], [.60, .05], [.70, 0], [.77, 0], [.81, .09], [.93, .13], [.99, .30], [1, .50], [.99, .68], [.93, .86], [.80, .98], [.62, 1], [.40, .98], [.22, .94], [.07, .91], [.05, .80], [.11, .72], [.04, .62]],
      interior: [[.262, .268], [.415, .24], [.585, .25], [.63, .16], [.675, .135], [.895, .15], [.925, .27], [.935, .40], [.95, .50], [.935, .62], [.90, .72], [.78, .765], [.635, .80], [.49, .80], [.36, .80], [.235, .68], [.20, .57], [.195, .47], [.215, .40]],
      eye: { x: 0.118, y: 0.33, r: 34, color: '#ff3636', fade: 'rgba(255,0,0,0)' },
      cutTint: '#f4eddb'
    },

    phases: [
      {
        // phase 0: nothing inside can be touched until both anchor pylons are dead
        systems: [],
        anchors: [
          { ax: -490, ay: -150, fromX: 1400, fromY: -60, hp: 42, field: 160, set: { pylon: true } },
          { ax: -490, ay: 150, fromX: 1400, fromY: 780, hp: 42, field: 160, set: { pylon: true } }
        ],
        banner: ['ANCHOR PYLONS TETHER THE FLAGSHIP', 'NO PHASING IN THEIR FIELD — KILL THEM IN THE PLANE', 4.2, true],
        clearWhen: e => e.tethers <= 0 && e.t > 2,
        fire(e, B) {
          const m = gunPos(e, 0), t1 = gunPos(e, 1), b1 = gunPos(e, 3);
          if (every(e, 'a', 1.7)) fan(m[0], m[1], aimP(m[0], m[1]), 5, 0.7, 195 * B, 1, e);
          if (every(e, 'b', 2.8)) { fan(t1[0], t1[1], Math.PI - 0.25, 8, 1.3, 135 * B, 0, e); fan(b1[0], b1[1], Math.PI + 0.25, 8, 1.3, 135 * B, 0, e); }
        }
      },
      {
        systems: [['shield', 133, -72, 17, 38], ['magazine', -129, 86, 18, 38]],
        reward: ['P', 'D', 'W'],
        fire(e, B) {
          const m = gunPos(e, 0), t1 = gunPos(e, 1), t2 = gunPos(e, 2);
          if (every(e, 'a', 3.0)) wall(e.x - e.rw + 14, 360 + 235 * Math.sin(e.cn.a * 1.3), 180, 150 * B, 1, e);
          if (every(e, 'b', 0.12)) fireB(m[0], m[1], Math.PI + Math.sin(e.t * 1.25) * 1.0, 185 * B, 0, e);
          if (every(e, 'd', 0.26)) fireB(t2[0], t2[1], Math.PI - 0.45 + Math.sin(e.t * 0.9 + 1.5) * 0.75, 150 * B, 0, e);
          if (every(e, 'c', 2.3)) { fan(t1[0], t1[1], aimP(t1[0], t1[1]), 3, 0.2, 290 * B, 2, e); }
        }
      },
      {
        systems: [['bridge', 172, -139, 16, 38], ['hangar', -69, 14, 22, 40]],
        fire(e, B) {
          const t2 = gunPos(e, 2), b1 = gunPos(e, 3);
          // a slow sweeping beam from the maw, diving lancers from the hangar, paired rings
          if (every(e, 'a', 7.5)) { const d = (e.cn.a % 2) ? 1 : -1; addLaser(e, -335, -24, Math.PI - 0.5 * d, 1.5, 2.6, 40, 0.385 * d); }
          if (!e.noSpawn && every(e, 'b', 2.6) && countType('lancer') < 5) spawn('lancer', e.x - 120, e.y + rnd(-40, 60), { ai: 'dive', tx: rnd(560, 700), y0: 0 });
          if (every(e, 'c', 2.0)) { ring(b1[0], b1[1], 26, 125 * B, 1, e, e.cn.c * 0.17); ring(t2[0], t2[1], 26, 125 * B, 1, e, e.cn.c * 0.17 + 0.12); }
        }
      },
      {
        systems: [['engine', 275, 19, 19, 58]],
        reward: ['D', 'W'],
        fire(e, B) {
          const m = gunPos(e, 0), t1 = gunPos(e, 1), b1 = gunPos(e, 3);
          if (every(e, 'a', 0.11)) { const w = Math.sin(e.t * 0.8) * 0.9; fireB(t1[0], t1[1], Math.PI - 0.3 + w, 160 * B, 0, e); fireB(b1[0], b1[1], Math.PI + 0.3 - w, 160 * B, 0, e); }
          if (every(e, 'b', 1.5)) fan(m[0], m[1], aimP(m[0], m[1]), 5, 0.5, 230 * B, 2, e);
          if (every(e, 'c', 4.6)) wall(e.x - e.rw + 14, 360 + 220 * Math.sin(e.cn.c * 2.1), 190, 140 * B, 1, e);
        }
      },
      {
        // (moved forward from x = 172: a full drive bar now buys about 2 s on the reactor instead of 1.3)
        systems: [['reactor', 70, 80, 25, 100]],
        onEnter(e) { mawDrone(e); e.anT = MAW_DRONE_GAP; },
        fire(e, B) {
          const m = gunPos(e, 0), t1 = gunPos(e, 1), b1 = gunPos(e, 3);
          // a new anchor drone arrives MAW_DRONE_GAP seconds after the last one died
          const anch = countType('anchor');
          if (anch < 1) { e.anT = (e.anT === undefined ? MAW_DRONE_GAP : e.anT) - DT; if (e.anT <= 0) { e.anT = MAW_DRONE_GAP; mawDrone(e); } }
          if (every(e, 'a', anch ? 1.6 : 1.25)) ring(m[0], m[1], anch ? 24 : 30, 145 * B, e.cn.a % 2, e, e.cn.a * 0.11);
          if (every(e, 'b', anch ? 0.7 : 0.45)) fireB(t1[0], t1[1], aimP(t1[0], t1[1]), 280 * B, 2, e);
          // the sweep only fires while the drive is free: never "locked drive + full-screen beam"
          if (anch < 1) { if (every(e, 'c', 10)) { const d = (e.cn.c % 2) ? 1 : -1; addLaser(e, -335, -24, Math.PI - 0.48 * d, 1.5, 2.4, 40, 0.4 * d); } }
          else e.tm.c = Math.min(e.tm.c || 0, 4);
          if (every(e, 'd', 0.16)) fireB(b1[0], b1[1], Math.PI + Math.sin(e.t * 0.7) * 0.9, 150 * B, 0, e);
        }
      }
    ]
  });
})();
