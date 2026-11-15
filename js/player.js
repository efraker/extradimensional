/* ============================================================
   js/player.js : the player ship — movement, the phase drive, both weapons, death and respawn.
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { G, P, W, DT, TAU, XMIN, XMAX, YMIN, YMAX, MAX_GUN, clamp, lerp, rnd, inp, every, enemies, shots, lasers, parts, walls,
    sfx, shake, sparks, boom, ringFx, internalFx, popup, convertBullets, killLasers,
    inHull, targetable, anchorAt, compDamage, killEnemy } = XD;

  /* ---------------- tuning ---------------- */
  const PHASE_ENTRY_COST = 0.07;    // energy spent the instant you leave the plane
  const PHASE_MIN_ENERGY = 0.15;    // needed to engage the drive
  const PHASE_DRAIN_TIME = 3.0;     // seconds a full drive lasts above the plane (plus the entry cost: about 2.8s)
  const ANCHOR_DRAIN = 3.5;         // drain multiplier inside an anchor field
  const RECHARGE_TIME = 9.5;        // seconds for an empty drive to refill by itself in a stage
  const DUEL_RECHARGE_TIME = 6.5;   // ...and in a capital-ship duel (was 5.5: the bosses hardly ever killed)

  function resetPlayer() {
    P.x = 180; P.y = 360; P.alive = true; P.inv = 2.2; P.respawn = 0; P.grace = 0; P.eject = 0; P.phaseLock = 0;
    P.lockE = P.lockC = null; P.retX = P.x; P.retY = P.y;
    G.phased = false; G.needRelease = !!inp.phase;   // a held phase key must be released before it works again
    P.ejShock = false; P.sinceEj = 9; P.trail.length = 0;
    XD.arsenalRespawn();
  }

  /* ---------------- the phase drive ---------------- */
  function enterPhase() {
    G.phased = true;
    if (!G.infiniteEnergy) G.energy = Math.max(0.01, G.energy - PHASE_ENTRY_COST);
    sfx('phasein'); ringFx(P.x, P.y, 90, '#7df4ff', 0.3);
    G.flash = Math.max(G.flash, 0.2); G.flashCol = '#bff6ff';
    sparks(P.x, P.y, 18, '#7df4ff', 320);
    G.phFx = 0; G.phFxX = P.x; G.phFxY = P.y; G.hitstop = Math.max(G.hitstop || 0, 2); G.lowT = 0;
    XD.arsenalPhase(true);
  }
  // forced = the drive ran dry (as opposed to the key being released)
  function exitPhase(forced) {
    G.phased = false; P.lockE = P.lockC = null; P.grace = 0.18; P.phaseLock = Math.max(P.phaseLock, 0.35); sfx('phaseout');
    P.sinceEj = Math.min(P.sinceEj, 0.9);   // dropping out just short of a capital hull and drifting into it is a shove, not a death (0.6s window)
    if (forced) { G.needRelease = true; P.phaseLock = 0.6; popup(P.x, P.y - 40, 'DRIVE EMPTY', '#ff5a5a'); }
    // re-entering the plane INSIDE a hull: the hull takes the shock and the ship is thrown clear
    let inside = false;
    for (const e of enemies) {
      if (e.dead || e.dying) continue;
      if (inHull(e, P.x, P.y, 10)) {
        if (e.boss) { inside = true; e.pause = Math.max(e.pause, 0.9); killLasers(e); }   // the shock staggers the capital ship: no point-blank volley as you come out
        else { e.hp -= e.T.fodder ? 99 : 18; e.flash = 1; if (e.hp <= 0) killEnemy(e, 'int'); else inside = true; }
      }
    }
    if (inside) {
      P.eject = 1.4; P.ejShock = true; P.grace = 0.7; shake(10); sfx('shock');
      ringFx(P.x, P.y, 130, '#7df4ff', 0.4); boom(P.x, P.y, 60, true);
      convertBullets(b => { const dx = b.x - P.x, dy = b.y - P.y; return dx * dx + dy * dy < 130 * 130; });
      popup(P.x, P.y - 46, 'RE-ENTRY SHOCK', '#7df4ff');
    }
    else { ringFx(P.x, P.y, 50, '#7df4ff', 0.25); ringFx(P.x, P.y, 22, '#ffffff', 0.18); shake(3); }
    // the drone snaps back and the banked shots go out (held until the ship is clear if it came down inside a hull)
    XD.arsenalPhase(false, inside);
  }

  // returns true if the hit actually killed the ship
  function hitPlayer() {
    if (!P.alive || G.phased || P.inv > 0 || P.grace > 0 || G.invincible) return false;
    P.alive = false; P.respawn = 1.1; G.lives--; G.deaths++; XD.chainDeath();
    XD.arsenalDeath();   // the charge and the bank are lost, the drone drops a level
    boom(P.x, P.y, 90, false); ringFx(P.x, P.y, 260, '#fff', 0.6); sparks(P.x, P.y, 40, '#7df4ff', 420, 1.6);
    shake(22); G.flash = 0.75; G.flashCol = '#ff5a5a'; sfx('die');
    convertBullets(); lasers.length = 0; walls.length = 0;
    if (P.gun > XD.stageDef().minGun) P.gun--;   // dying costs firepower, but never drops you below what the stage is tuned for
    if (G.lives < 0) { G.lives = 0; G.overT = 1.6; }
    return true;
  }

  function updatePlayer() {
    if (P.inv > 0) P.inv -= DT;
    if (P.grace > 0) P.grace -= DT;
    if (P.phaseLock > 0) P.phaseLock -= DT;
    if (!P.alive) {
      if (G.overT > 0) return;
      P.respawn -= DT;
      if (P.respawn <= 0) {
        resetPlayer(); P.inv = 2.6; G.energy = Math.max(G.energy, 0.6);
        if (G.boss) G.boss.pause = Math.max(G.boss.pause, 1.0);
      }
      return;
    }
    P.sinceEj += DT;

    // ejection from a hull (after re-entry, or after bumping a capital ship): the drive throws the ship clear.
    // Capital-ship bosses always throw you out AHEAD of the prow (never behind or under them), and steering is locked
    // until you are well clear, so a held key can never carry you straight back into the hull.
    let ejecting = false;
    if (P.eject > 0) {
      P.eject -= DT; P.sinceEj = 0;
      let hit = null;
      for (const e of enemies) {
        if (e.dead || e.dying || e.T.fodder) continue;
        if (inHull(e, P.x, P.y, e.boss ? 46 : 24)) { hit = e; break; }
      }
      if (hit) {
        ejecting = true;
        // always thrown toward open space ahead of the ship (left), fanning up/down the further off-centre you are
        let nx = -1, ny = clamp((P.y - hit.y) / hit.rh, -1, 1) * (hit.boss ? 0.5 : 1.3);
        const v = hit.boss ? 1500 : 1000;
        if (hit.boss) P.eject = Math.max(P.eject, 0.1); else if (P.eject < 0.5) ny = 0;
        const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        P.x = clamp(P.x + nx * v * DT, XMIN, XMAX); P.y = clamp(P.y + ny * v * DT, YMIN, YMAX);
        if (P.ejShock) P.grace = Math.max(P.grace, 0.6);
        if (parts.length < 600) parts.push({ x: P.x, y: P.y, vx: -nx * 100, vy: -ny * 100, t: 0, max: 0.3, sz: 4, col: '#7df4ff' });
      }
      else {
        P.eject = 0;
        if (P.ejShock) {
          // the shock cleared the spot the ship came down on; this clears the spot it has been thrown to
          P.grace = Math.max(P.grace, 0.85);
          if (convertBullets(b => { const dx = b.x - P.x, dy = b.y - P.y; return dx * dx + dy * dy < 110 * 110; })) ringFx(P.x, P.y, 110, '#7df4ff', 0.3);
        }
        P.ejShock = false;
      }
    }

    // movement (faster above the plane; focus = slow and precise)
    let mx = (inp.r ? 1 : 0) - (inp.l ? 1 : 0), my = (inp.d ? 1 : 0) - (inp.u ? 1 : 0);
    if (mx && my) { mx *= 0.7071; my *= 0.7071; }
    const sp = G.phased ? (inp.focus ? 300 : 560) : (inp.focus ? 150 : 345);
    if (!ejecting) { P.x = clamp(P.x + mx * sp * DT, XMIN, XMAX); P.y = clamp(P.y + my * sp * DT, YMIN, YMAX); }
    P.tilt = lerp(P.tilt, my, 0.2);
    P.trail.push(P.x, P.y); if (P.trail.length > 16) P.trail.splice(0, 2);

    // phase drive
    const field = anchorAt(P.x, P.y); G.anchored = !!field;
    const want = inp.phase; if (!want) G.needRelease = false;
    if (G.deniedT > 0) G.deniedT -= DT;
    if (!G.phased) {
      if (want && !G.needRelease && P.phaseLock <= 0) {
        if (field) { if (G.deniedT <= 0) { G.deniedT = 0.5; sfx('deny'); popup(P.x, P.y - 40, 'ANCHORED — CANNOT PHASE', '#e23bff'); } }
        else if (G.energy >= PHASE_MIN_ENERGY) enterPhase();
        else if (G.deniedT <= 0) { G.deniedT = 0.5; sfx('deny'); popup(P.x, P.y - 40, 'DRIVE CHARGING', '#ff5a5a'); }
      }
      // passive recharge is slow in the stages (graze and kill for the rest), quicker in a capital-ship duel
      const tut = G.hold ? 3.2 : 1, was = G.energy;
      G.energy = Math.min(1, G.energy + DT / (G.boss ? DUEL_RECHARGE_TIME : RECHARGE_TIME) * tut);
      if (was < PHASE_MIN_ENERGY && G.energy >= PHASE_MIN_ENERGY) { sfx('ready'); G.readyT = 0.5; }
    }
    else {
      if (!G.infiniteEnergy) G.energy -= DT / PHASE_DRAIN_TIME * (field ? ANCHOR_DRAIN : 1);
      if (G.energy < 0.25 && !G.infiniteEnergy) { G.lowT = (G.lowT || 0) + DT; if (G.lowT > 0.16) { G.lowT = 0; sfx('low'); } }
      if (field && G.deniedT <= 0) { G.deniedT = 0.7; sfx('anchor'); popup(P.x, P.y - 50, 'ANCHOR FIELD — DRIVE DESTABILISED', '#e23bff'); }
      if (G.energy <= 0) { G.energy = 0; exitPhase(true); }
      else if (!want) exitPhase(false);
    }
    if (G.infiniteEnergy) G.energy = 1;

    // weapons, charge shot, drone, absorb burst: js/arsenal.js
    XD.updateArsenal();

    XD.collectPickups();
  }

  Object.assign(XD, { resetPlayer, enterPhase, exitPhase, hitPlayer, updatePlayer });
})();
