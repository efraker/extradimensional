/* ============================================================
   js/stage.js : run / stage flow and the stage-scripting helpers.
   A stage is a definition from the ordered XD.STAGES list (data/stages.js). Its script(s)
   function is run once when the stage starts to build a timeline of events; the engine
   plays the timeline, then brings on the stage's boss, then moves to the next stage in
   the list — or to the victory screen after the last one.
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { G, P, DT, clamp, rnd, every, enemies, bullets, bpool, shots, lasers, pickups, shards, parts, booms, popups, walls,
    TYPES, STAGES, saveHi, sfx, banner, updateFx, zaps, laters, spawn, updateEnemies, updateShots, updateBullets, spawnBoss, resetPlayer, updatePlayer } = XD;

  /* ---------------- stage scripting helpers ----------------
     Passed to stage.script(s). Every helper schedules something at timeline second `t`.
     They are plain closures, so a script may destructure them: script({ at, motes, hold }) { ... } */
  function buildStage(n) {
    const def = XD.stageDef(n);
    const ev = [];
    const s = {
      // run any function at time t
      at(t, f) { ev.push({ t, f }); },
      // spawn one enemy of `type` at (x, y) with spawn overrides `o`
      spawn(t, type, x, y, o) { s.at(t, () => spawn(type, x, y, o)); },
      // a column of c fodder ships snaking in on a sine wave around row y.
      // o: { type='mote', gap=48, amp=60, freq=2.2, ph=0.35 (phase step per ship), spd=175,
      //      drop=pickup id carried by one ship of the column, dropAt=index of that ship (default: the middle one) }
      motes(t, c, y, o) {
        s.at(t, () => {
          o = o || {};
          for (let i = 0; i < c; i++) spawn(o.type || 'mote', 1310 + i * (o.gap || 48), y,
            { ai: 'sine', y0: y, amp: o.amp === undefined ? 60 : o.amp, freq: o.freq || 2.2, phase: i * (o.ph === undefined ? 0.35 : o.ph), spd: o.spd || 175,
              drop: o.drop && i === (o.dropAt === undefined ? (c >> 1) : o.dropAt) ? o.drop : undefined });
        });
      },
      // c fodder ships entering along the top (top=true) or bottom edge and swooping across the lane.
      // o: { type='mote', amp=400, spd=250 }
      swoop(t, c, top, o) {
        s.at(t, () => {
          for (let i = 0; i < c; i++) spawn((o && o.type) || 'mote', 1310 + i * 52, top ? 70 : 650,
            { ai: 'swoop', y0: top ? 70 : 650, dir: top ? 1 : -1, amp: (o && o.amp) || 400, spd: (o && o.spd) || 250 });
        });
      },
      // one diving ship per entry of ys (rows): fly in, flash, fire an aimed fan, charge. o: { type='lancer' }
      lancers(t, ys, o) {
        s.at(t, () => ys.forEach((y, i) => spawn((o && o.type) || 'lancer', 1320 + i * 40, y, { ai: 'dive', y0: y, tx: rnd(840, 1060) - i * 20 })));
      },
      // a ship that flies in to x = tx on row y, holds station for `stay` seconds, then leaves. o = extra spawn overrides
      hold(t, type, y, tx, stay, o) {
        // (it starts just off the right edge and flies in at up to 270 px/s, so a wide ship reaches tx = 1000 about 2-4 s after t)
        s.at(t, () => spawn(type, 1280 + (TYPES[type] ? TYPES[type].rw : 0) + 30, y, Object.assign({ ai: 'hold', y0: y, tx, stay, spd: 90 }, o || {})));
      },
      // a banner: title, subtitle (a string, or a function returning one — re-read every frame), duration (s), warn (red hazard styling)
      msg(t, a, b, d, w) { s.at(t, () => banner(a, b, d, w)); }
    };
    def.script(s);
    ev.sort((a, b) => a.t - b.t);
    ev.endT = def.end;
    return ev;
  }

  function clearWorld() {
    enemies.length = 0;
    while (bullets.length) bpool.push(bullets.pop());
    shots.length = 0; lasers.length = 0; walls.length = 0; pickups.length = 0; shards.length = 0;
    parts.length = 0; booms.length = 0; popups.length = 0; zaps.length = 0; laters.length = 0;
    G.boss = null; G.banner = null;
  }

  function startRun() {
    G.score = 0; G.lives = XD.RULES.lives; G.continues = XD.RULES.continues; G.mult = 1; G.multT = 0; P.gun = 1; G.kills = 0; G.chain = 0; G.deaths = 0; G.grazes = 0; G.fodderKills = 0;
    G.tutorialDone = false; G.seenAnchor = false; G.startTime = G.time; G.cpGun = 0; G.ph = 0; G.hitstop = 0; G.flash = 0;
    G.cpBoss = null; XD.arsenalReset();
    startStage(1, false); G.scene = 'play'; sfx('start');
  }

  // n is 1-based; atBoss skips the timeline and goes straight to the boss warning (continues, debug)
  function startStage(n, atBoss) {
    n = clamp(n | 0, 1, STAGES.length);
    clearWorld();
    G.stage = n; G.stageTime = 0; G.script = buildStage(n); G.si = 0; G.bossSpawned = false; G.bossWarn = 0; G.atBoss = !!atBoss;
    G.clearT = 0; G.overT = 0; G.hold = false; G.energy = 1; G.shake = 0; G.bank = 0; G.bankPending = false;
    if (!atBoss) G.cpBoss = null;   // boss progress is only remembered for a continue AT that boss
    resetPlayer(); XD.buildBackdrop(n);
    if (atBoss) { G.si = G.script.length; G.stageTime = G.script.endT; startBossWarn(); }
    else { const tx = XD.screenText('stageBanner', n); banner(tx[0], tx[1], 3.4); }
  }

  // the timeline is over: announce the stage's boss — or, if the stage has none, simply clear it (no warning)
  function startBossWarn() {
    const b = XD.stageDef().boss;
    G.bossSpawned = true;
    if (!b || !TYPES[b]) { G.atBoss = false; XD.stageCleared(null); return; }
    if (!G.atBoss || !G.cpGun) G.cpGun = P.gun;   // remember the gun level the boss was first met with (for continues)
    G.bossWarn = 3.4; G.atBoss = true;
    const tx = XD.screenText('warning');
    banner(tx[0], tx[1], 3.2, true);
  }

  /* ---------------- one simulation tick of the 'play' scene ---------------- */
  function updatePlay() {
    // stage timeline (held while a tutorial ship is alive)
    const was = G.hold; G.hold = false;
    for (const e of enemies) if (e.tutorial && !e.dead && !e.dying) G.hold = true;
    if (was && !G.hold && !G.tutorialDone) {
      G.tutorialDone = true;
      const tx = XD.screenText('tutorialDone');
      banner(tx[0], tx[1], 4.4);
    }
    if (!G.hold && G.clearT <= 0) G.stageTime += DT;
    while (G.si < G.script.length && G.script[G.si].t <= G.stageTime) G.script[G.si++].f();
    if (G.si >= G.script.length && !G.bossSpawned) {
      // timeline finished: the boss arrives once the capital ships are dealt with (or after 12s regardless)
      let big = 0;
      for (const e of enemies) if (!e.T.fodder && !e.dead && !e.dying) big++;
      if ((big === 0 && G.stageTime > G.script.endT - 4) || G.stageTime > G.script.endT + 12) {
        for (const e of enemies) if (!e.T.fodder) { e.leaving = true; e.stalled = false; e.stay = 0; }
        startBossWarn();
      }
    }
    if (G.bossWarn > 0) { G.bossWarn -= DT; if (every(G, 'warn', 0.55)) sfx('warn'); if (G.bossWarn <= 0) spawnBoss(); }

    updatePlayer();
    updateEnemies();
    updateShots();
    updateBullets();
    updateFx();

    // the gut chain holds whenever there is nothing to gut through no fault of the player: a capital-ship duel and the
    // approach to it, the hand-over between stages, the first seconds of a stage, the tutorial (only dying breaks it there)
    XD.chainTick(!!(G.boss || G.bossWarn > 0 || G.clearT > 0 || G.hold || G.stageTime < 6));
    // a dying capital ship is shown opened up, so you watch it come apart from the inside
    const cut = G.phased || (G.boss && G.boss.dying > 0);
    G.ph += ((cut ? 1 : 0) - G.ph) * Math.min(1, DT * (cut ? 15 : 11));
    G.phFx += DT;
    G.holdT = (G.hold && !G.phased && G.energy > 0.5) ? G.holdT + DT : (G.hold ? G.holdT : 0);
    if (G.phased) G.holdT = 0;

    if (G.overT > 0) {
      G.overT -= DT;
      if (G.overT <= 0) { saveHi(); G.scene = 'gameover'; shots.length = 0; walls.length = 0; }
    }
    if (G.clearT > 0) {
      G.clearT -= DT;
      if (G.clearT <= 0) {
        if (G.stage < STAGES.length) startStage(G.stage + 1, false);      // next stage in the list...
        else { saveHi(); G.scene = 'victory'; G.victoryT = 0; }          // ...or victory after the last one
      }
    }
  }

  function continueRun() {
    if (G.continues <= 0) { G.scene = 'title'; return; }
    G.continues--; G.score = 0; G.lives = XD.RULES.lives; G.mult = 1; G.multT = 0;
    // later stages are tuned for a minimum gun level: a continue never restarts them under-gunned,
    // and never brings you back to a boss weaker than you first met it
    P.gun = Math.min(XD.MAX_GUN, Math.max(P.gun, XD.stageDef().minGun, G.atBoss ? Math.max(G.cpGun || 0, XD.RULES.bossContinueMinGun) : 0));
    startStage(G.stage, G.atBoss); G.scene = 'play'; sfx('start');
  }

  Object.assign(XD, { buildStage, clearWorld, startRun, startStage, startBossWarn, updatePlay, continueRun });
})();
