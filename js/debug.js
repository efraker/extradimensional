/* ============================================================
   js/debug.js : window.__game — test / debug hooks (not surfaced in any UI).
   The playtest bots rely on the exact shape of state() and debug(); add fields, never rename.
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { G, P, DRONE, clamp, enemies, bullets, lasers, pickups, walls, shots, STAGES, assetsLoaded, targetable, bossHpFrac, startRun, startStage } = XD;
  // hit points for state(): rounded for readability, but a LIVE thing never reads 0 (bots treat hp 0 as dead)
  const hp1 = (v, dead) => (dead ? 0 : Math.max(0.1, +v.toFixed(1)));
  const frac3 = e => (e.dying > 0 || e.dead ? 0 : Math.max(0.001, +bossHpFrac(e).toFixed(3)));

  Object.defineProperty(window, '__game', { enumerable: false, configurable: true, value: {
    // a JSON-safe snapshot of the game
    state() {
      const b = G.boss;
      return {
        scene: G.scene === 'play' ? 'playing' : (G.scene === 'pause' ? 'paused' : G.scene),
        stage: G.stage, stageTime: +G.stageTime.toFixed(2), score: Math.floor(G.score),
        lives: G.lives, continues: G.continues, energy: +G.energy.toFixed(3), phased: G.phased, mult: Math.floor(G.mult), gun: P.gun,
        player: { x: Math.round(P.x), y: Math.round(P.y), alive: P.alive, inv: +Math.max(0, P.inv).toFixed(2) },
        enemies: enemies.map(e => ({
          type: e.type, x: Math.round(e.x), y: Math.round(e.y),
          hp: e.boss ? frac3(e) : hp1(e.hp, e.dying > 0 || e.dead), stage: e.stage, dying: e.dying > 0,
          // open (can be locked right now) is the authoritative flag for bots; hp is never 0 while the system lives
          components: e.comps.map(c => ({ name: c.name, x: Math.round(e.x + c.ox), y: Math.round(e.y + c.oy), hp: hp1(c.hp, c.dead), open: targetable(e, c), dead: c.dead }))
        })),
        bulletCount: bullets.length, bossActive: !!b, bossHp: b ? frac3(b) : 0, bossStage: b ? b.stage : -1, anchored: G.anchored,
        deaths: G.deaths, kills: G.kills, imageLoaded: assetsLoaded(), fps: Math.round(G.fps),
        assets: XD.assetStatus(), warnings: XD.warnings || 0, lastError: XD.lastError || null,
        // power-ups (added; nothing above was renamed)
        weapon: P.weapon, charge: +P.charge.toFixed(2), banked: G.bank, chain: +G.mult.toFixed(2), shotCount: shots.length,
        drone: { level: DRONE.level, mode: DRONE.level ? DRONE.mode : 'none', x: Math.round(DRONE.x), y: Math.round(DRONE.y),
          hp: DRONE.hp, down: +Math.max(0, DRONE.down).toFixed(2) },
        bossResume: G.cpBoss ? { type: G.cpBoss.type, stage: G.cpBoss.stage, dead: G.cpBoss.dead.slice() } : null
      };
    },
    start() { if (G.scene !== 'play') startRun(); },
    // jump to stage n (1-based, clamped to the defined stages), skipping the tutorial
    // (the gun is raised to the stage's minGun, as a continue would, so a quick test is not under-gunned)
    setStage(n) { if (G.scene === 'title') { startRun(); } G.tutorialDone = true; startStage(n, false); P.gun = Math.max(P.gun, XD.stageDef().minGun); G.scene = 'play'; },
    skipToBoss() { if (G.scene === 'title') { startRun(); } G.tutorialDone = true; G.cpBoss = null; startStage(G.stage, true); G.scene = 'play'; },
    // raw geometry for bots
    debug() {
      return {
        bullets: bullets.map(b => [b.x, b.y, b.vx, b.vy, b.r]),
        lasers: lasers.map(l => ({ x: l.e.x + l.ox, y: l.e.y + l.oy, ang: l.ang, angV: l.angV, w: l.w, in: l.tele - l.t })),
        hulls: enemies.filter(e => !e.dying).map(e => ({ x: e.x, y: e.y, rw: e.rw, rh: e.rh, fodder: !!e.T.fodder, type: e.type, shield: e.shield, armor: e.armor,
          field: e.T.field ? (e.field || e.T.field) : 0 })),
        walls: walls.map(w => ({ x: w.x, gapY: w.gapY, gapH: w.gapH, in: w.tele - w.t })),
        grace: P.grace, eject: P.eject, anchored: G.anchored, hold: G.hold, pickups: pickups.map(p => [p.x, p.y])
      };
    },
    // the ordered stage list (name + boss id), for tests of the content pipeline
    stages() { return STAGES.map(s => ({ name: s.name, boss: s.boss, id: s.id })); },
    // grant a power-up: 'drone' | 'pulse' | 'spread' | 'lance' | 'seeker' (any weapon id) | 'gun' | 'cell' | 'charge' | 'bank' | 'life'
    give(what) { return XD.give(what); },
    // drop a pickup by id next to the ship (e.g. 'D', 'W', 'WS', 'WL', 'WK', 'P', 'E')
    drop(id, x, y) { XD.dropPickup(x === undefined ? P.x + 200 : x, y === undefined ? P.y : y, id); },
    // the registered weapons, for tests of the content pipeline
    weapons() { return XD.WEAPON_ORDER.map(id => ({ id, name: XD.WEAPONS[id].name, pickup: XD.WEAPONS[id].pickup || null })); },
    setInvincible(b) { G.invincible = !!b; },
    setInfiniteEnergy(b) { G.infiniteEnergy = !!b; },
    setTimeScale(x) { G.timeScale = clamp(+x || 1, 0.1, 20); }
  } });
})();
