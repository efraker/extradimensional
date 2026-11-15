/* ============================================================
   data/patterns.js : bullet patterns.
   XD.definePattern(id, function (e) { ... }) — called every simulation tick (1/60 s) for each live
   enemy whose definition has `pattern: id` (by default an enemy uses the pattern named like itself).
   Not called while the ship is dying, disabled (bridge destroyed), or leaving past the player.

   Toolbox (all on XD):
     every(e, key, seconds)  true once per period; e.cn[key] counts how many times it has fired
     fireB(x, y, angle, speed, kind, e [, accel])     one bullet (kind 0 pink, 1 orange, 2 yellow dart, 3 red large)
     ring(x, y, n, speed, kind, e [, rotation])       n bullets in a circle
     fan(x, y, angle, n, spread, speed, kind, e)      n bullets across `spread` radians
     wall(x, gapY, gapH, speed, kind, e)              telegraphed full-height wall with one gap
     addLaser(e, ox, oy, angle, telegraph, duration, width, sweep)   beam from offset (ox, oy)
     aimP(x, y)              angle towards the player        gunPos(e, i)   world position of gun mount i
     spawn(type, x, y, o)    launch another enemy            countType(id)  live enemies of a type
     bs()                    bullet-speed scale of the current stage (multiply speeds by it)
     tier()                  difficulty tier of the current stage (1, 2, 3...) for denser variants
   Angles are radians; 0 = right, PI = left (towards the player's side of the screen).
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { P, DT, TAU, rnd, every, definePattern, fireB, ring, fan, aimP, addLaser, gunPos, spawn, countType, bs, tier } = XD;

  // an occasional aimed shot; never a point-blank one from a mote that is already on top of you
  definePattern('mote', e => {
    if (e.x > 1230 || e.x < P.x + 230) return;
    if (e.shotT === undefined) e.shotT = rnd(0.5, 2.4);
    e.shotT -= DT;
    if (e.shotT <= 0) {
      e.shotT = tier() >= 3 ? rnd(1.6, 2.6) : rnd(3, 4.5);
      fireB(e.x - 10, e.y, aimP(e.x, e.y), 185 * bs(), 0, e);
    }
  });

  // a slowly rotating multi-arm spiral
  definePattern('weaver', e => {
    if (e.x > 1240) return;
    if (every(e, 'a', tier() >= 2 ? 0.115 : 0.135)) {
      const n = tier() >= 2 ? 4 : 3;
      for (let k = 0; k < n; k++) fireB(e.x, e.y, e.t * 1.5 + k * TAU / n, 125 * bs(), 0, e);
    }
  });

  // three quick aimed fans every 2.4s
  definePattern('bulwark', e => {
    if (e.x > 1240) return;
    if (every(e, 'a', 2.4)) e.burst = 3;
    if (e.burst > 0 && every(e, 'b', 0.16)) {
      e.burst--;
      fan(e.x - 30, e.y, aimP(e.x, e.y), tier() > 1 ? 5 : 4, tier() > 1 ? 0.8 : 0.6, 205 * bs(), 1, e);
    }
  });

  // slow rings; from tier 2 also aimed darts. Silent once its magazine is gone.
  definePattern('ironclad', e => {
    if (e.x > 1220) return;
    if (e.tutorial) { if (every(e, 'a', 3.0)) ring(e.x, e.y, 10, 105, 1, e, (e.cn.a || 0) * 0.3); return; }   // the tutorial ship is gentle
    if (e.magDead) return;
    if (every(e, 'a', 2.2)) ring(e.x, e.y, 18 + (tier() - 1) * 4, 120 * bs(), 1, e, (e.cn.a || 0) * 0.2);
    if (tier() >= 2 && every(e, 'b', 1.7)) fan(e.x - 60, e.y, aimP(e.x, e.y), 3, 0.3, 230 * bs(), 2, e);
  });

  // a telegraphed beam straight down its row, plus aimed dart pairs
  definePattern('scythe', e => {
    if (e.x > 1240) return;
    if (every(e, 'a', 4.6)) addLaser(e, -e.rw, 0, Math.PI, 1.15, 1.0, 34, 0);
    if (every(e, 'b', 1.5)) fan(e.x - 40, e.y, aimP(e.x, e.y), 2, 0.16, 270 * bs(), 2, e);
  });

  // launches motes until its hangar is gutted, and fires a wide fan
  definePattern('carrier', e => {
    if (e.x > 1260) return;
    if (!e.noSpawn && every(e, 'a', 1.5) && countType('mote') < 26) {
      spawn('mote', e.x - 90, e.y + 14, { ai: 'sine', y0: e.y + 14, amp: rnd(40, 150), freq: rnd(1.5, 2.6), phase: 0, spd: rnd(150, 210) });
    }
    if (every(e, 'b', 2.9)) { fan(e.x - 100, e.y - 30, aimP(e.x, e.y), 7, 0.9, 180 * bs(), 1, e); }
  });

  // four gun mounts: aimed dart bursts, two sweeping streams and a ring (the last two need the magazine)
  definePattern('bastion', e => {
    if (e.x > 1300) return;
    const g0 = gunPos(e, 0), g1 = gunPos(e, 1), g2 = gunPos(e, 2), g3 = gunPos(e, 3);
    if (every(e, 'a', 2.6)) e.burst = 6;
    if (e.burst > 0 && every(e, 'a2', 0.09)) { e.burst--; fireB(g0[0], g0[1], aimP(g0[0], g0[1]), 290 * bs(), 2, e); }
    if (!e.magDead) {
      if (every(e, 'b', 0.14)) {
        fireB(g1[0], g1[1], Math.PI + Math.sin(e.t * 0.9) * 1.1, 150 * bs(), 0, e);
        fireB(g2[0], g2[1], Math.PI - Math.sin(e.t * 0.9) * 1.1, 150 * bs(), 0, e);
      }
      if (every(e, 'c', 3.4)) ring(g3[0], g3[1], 22, 115 * bs(), 1, e, (e.cn.c || 0) * 0.14);
    }
  });

  // slow rings of large bullets (boss pylons fire a little faster and denser)
  definePattern('anchor', e => {
    if (e.t > 2 && every(e, 'a', e.pylon ? 2.6 : 3.0)) ring(e.x, e.y, e.pylon ? 7 : 6, 95 * bs(), 3, e, e.t);
  });
})();
