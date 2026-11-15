/* ============================================================
   js/bosses.js : engine side of bosses (sequential-system capital ships).
   A boss is an enemy whose definition (XD.defineBoss, data/bosses.js) carries `phases`.
   Only the systems of the current phase can be locked; destroying them all advances the
   phase; running out of phases kills the ship. Everything boss-SPECIFIC (patterns, anchors,
   intro text, adds) is data or a function inside the boss definition — this file never
   looks at a boss id or a stage number.
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { G, P, DT, clamp, enemies, shots, walls, TYPES, STAGES, DROPS, CHAIN, defineAI, systemOf, pickupUseful, firstUseful, saveHi, screenText,
    sfx, shake, boom, banner, popup, later, convertBullets, killLasers, dropPickup, spawn, spawnAnchorFor, killEnemy } = XD;

  const bossStageCount = e => e.T.phases.length;
  // remaining fraction of all system hit points (the boss bar)
  function bossHpFrac(e) {
    let a = 0, b = 0;
    for (const c of e.comps) { a += c.hp; b += c.maxHp; }
    return b ? a / b : 0;
  }
  const phaseLabels = (e, i) => { const names = []; for (const k of e.comps) if (k.stage === i) names.push(systemOf(k.kind).label); return names; };

  // run the data-driven "phase opens" hooks of the boss's current phase
  function openPhase(e, quiet) {
    const ph = e.T.phases[e.stage];
    if (!ph) return;
    // reward: a pickup dropped ahead of the prow when the phase opens (only if the player can use it)
    // (reward may be a list: the first useful one is dropped)
    const rw = firstUseful(ph.reward);
    if (rw) dropPickup(e.x - e.rw - 70, clamp(e.y - 90, 90, 630), rw);
    // tethers go up the moment the phase opens, so a tethered system can never be gutted before its anchor exists
    if (ph.anchors) for (const s of ph.anchors) {
      const a = spawnAnchorFor(e, s.ax, s.ay, s.fromX === undefined ? 1400 : s.fromX, s.fromY === undefined ? -60 : s.fromY, s.type);
      if (!a) continue;
      if (s.hp) a.hp = a.maxHp = s.hp;
      if (s.field) a.field = s.field;
      if (s.set) Object.assign(a, s.set);
    }
    if (ph.banner && !quiet) banner(ph.banner[0], ph.banner[1], ph.banner[2], ph.banner[3]);
    if (ph.onEnter) ph.onEnter(e);
  }

  // the boss has finished flying in: announce it and open phase 0
  function bossIntro(e) {
    // a continue at this boss resumes where the last attempt got to: wrecked systems stay wrecked
    const cp = G.cpBoss;
    if (cp && cp.type === e.type && (cp.stage > 0 || cp.dead.length) && cp.stage < bossStageCount(e)) {
      for (const c of e.comps) if (cp.dead.indexOf(c.name) >= 0) {
        c.dead = true; c.hp = 0;
        const sys = systemOf(c.kind); if (sys.onBossResume) sys.onBossResume(e, c);
      }
      e.stage = cp.stage;
      // (a continue taken while the last system was already gone: finish the job)
      const p3 = e.T.phases[e.stage];
      let live = 0; for (const c of e.comps) if (c.stage === e.stage && !c.dead) live++;
      if (p3 && p3.systems && p3.systems.length && !live) { bossAdvance(e); return; }
      // There is one banner slot. Open the phase first (its onEnter may raise a banner of its own), then show the
      // resume notice on top, and bring the phase's text back once the notice has been read.
      const before = G.banner;
      openPhase(e, true);
      const raised = G.banner !== before && G.banner ? [G.banner.text, G.banner.sub, G.banner.dur, G.banner.warn] : null;
      const tx = screenText('resumed', e.comps.filter(k => k.stage === e.stage && !k.dead).map(k => systemOf(k.kind).label).join(' + ') || 'NOTHING YET');
      banner(tx[0], tx[1], 3.6);
      const nb = raised || (p3 && p3.banner);
      if (nb) later(3.4, () => { if (!e.dead && !e.dying && e.stage === cp.stage) banner(nb[0], nb[1], nb[2], nb[3]); });
      return;
    }
    const ph = e.T.phases[0];
    if (!ph || !ph.banner) { const tx = screenText('bossIntro', phaseLabels(e, 0).join(' + ')); banner(tx[0], tx[1], 3.8); }
    openPhase(e);
  }

  // a boss system was destroyed (called from compDestroyed)
  function bossCompDown(e, c) {
    dropPickup(e.x - e.rw - 70, e.y + c.oy, DROPS.cell);   // the cell falls out ahead of the prow: leave the hull to collect it
    const sys = systemOf(c.kind);
    if (sys.onBossDestroyed) sys.onBossDestroyed(e, c, e.x + c.ox, e.y + c.oy);
    let left = 0;
    for (const k of e.comps) if (k.stage === e.stage && !k.dead) left++;
    rememberBoss(e);
    if (left > 0) return;
    bossAdvance(e);
  }

  // remember how far this boss fight has got (used by a continue: see bossIntro)
  function rememberBoss(e) {
    G.cpBoss = { type: e.type, stage: e.stage, dead: e.comps.filter(c => c.dead).map(c => c.name) };
  }

  // close the current phase and open the next one (or kill the ship if there is none)
  function bossAdvance(e) {
    e.stage++; e.tm = {}; e.cn = {}; e.pause = e.T.breachPause === undefined ? 1.1 : e.T.breachPause; killLasers(e); walls.length = 0;
    convertBullets(); shake(20); G.flash = G.phased ? 0.25 : 0.5; G.flashCol = '#fff'; sfx('bigboom');
    if (e.stage >= bossStageCount(e)) {
      e.stage = 99; killEnemy(e, 'int');
      // the escorts die with it
      for (const o of enemies) if (o !== e && !o.dead && !o.dying) {
        o.hp = 0;
        if (o.T.fodder) { o.dead = true; boom(o.x, o.y, 30, true); }
        else { o.dying = 0.5; o.dyT = 0; o.internalDeath = true; }
      }
      return;
    }
    rememberBoss(e);
    const tx = screenText('breached', phaseLabels(e, e.stage).join(' + ') || '—');
    banner(tx[0], tx[1], 2.8);
    openPhase(e);
  }

  // per-tick boss pattern driver (called instead of a named pattern)
  function bossFire(e) {
    if (e.entering) return;
    if (e.pause > 0) { e.pause -= DT; return; }
    const T = e.T, ph = T.phases[e.stage], B = XD.bs();
    if (T.fire) T.fire(e, B);                                   // runs in every phase
    if (!ph) return;
    if (ph.clearWhen && ph.clearWhen(e)) { bossAdvance(e); return; }   // phases with no systems end on a condition
    if (ph.fire) ph.fire(e, B);
  }

  // movement: fly in from the right to x = T.tx, then bob around the centre line
  defineAI('boss', e => {
    const T = e.T;
    if (e.entering) {
      e.x -= (T.enterSpeed || 130) * DT;
      if (e.x <= T.tx) { e.x = T.tx; e.entering = false; e.t = 0; bossIntro(e); }
    }
    else e.y = 360 + T.bob * Math.sin(e.t * 0.45);
  });

  // bring on the boss named by the current stage definition
  function spawnBoss() {
    const type = XD.stageDef().boss;
    if (!type || !TYPES[type]) { stageCleared(null); return; }   // a stage without a boss simply ends
    G.boss = spawn(type, 1280 + TYPES[type].rw + 60, 360, { ai: 'boss', entering: true, y0: 360 });
    G.bossDeaths0 = G.deaths;
  }

  function bossDead(e) { stageCleared(e); }
  function stageCleared(e) {
    G.boss = null; G.clearT = 5; saveHi(); shots.length = 0; G.cpBoss = null;
    if (e) {
      // the kill pays ONCE: its score x the gut chain, capped (CHAIN.bossKillCap) so that one late death is not worth
      // more than a whole stage — plus a flat bonus for a duel fought without losing a ship
      const s = e.score * Math.min(Math.floor(G.mult), CHAIN.bossKillCap || 99);
      G.score += s; popup(e.x, e.y, 'CAPITAL SHIP DESTROYED +' + s, '#ffd23e', true);
      if (G.deaths === G.bossDeaths0) { G.score += e.score; popup(e.x, e.y + 40, 'FLAWLESS DUEL +' + e.score, '#7dff6a', true); }
    }
    const last = G.stage >= STAGES.length;
    if (!last) for (const d of DROPS.stageClear) dropPickup(d[1], d[2], d[0]);
    const text = (e && e.T.deathBanner) || screenText('stageClear', G.stage);
    banner(text[0], text[1], last ? 4.5 : 4.2);
  }

  Object.assign(XD, { bossStageCount, bossHpFrac, bossIntro, bossCompDown, bossAdvance, bossFire, spawnBoss, bossDead, stageCleared });
})();
