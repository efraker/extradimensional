/* ============================================================
   js/arsenal.js : the power-up systems, all built around the phase drive.
     - main guns   : the equipped weapon (XD.WEAPONS, data/weapons.js) fires one way in the
                     plane and another way above it
     - charge shot : hold the charge key (the gun keeps firing at half rate while it builds);
                     let go in the plane = a beam down the row, let go above a hull = one big
                     internal detonation that chains along the decks
     - tether drone: companion pod; blocks small shots; when the ship phases it stays behind
                     in the plane as a decoy / gun, and snaps back when the ship drops in
     - absorb burst: bullets the phased ship passes through are banked and fired back as a
                     homing burst on re-entry
   All numbers live in data/weapons.js (XD.defineWeapon / XD.setArsenal).
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { G, P, DRONE, W, H, DT, TAU, MAX_GUN, clamp, lerp, rnd, inp, every, enemies, bullets, shots, parts,
    WEAPONS, WEAPON_ORDER, weaponDef, ARSENAL,
    sfx, shake, sparks, boom, ringFx, internalFx, popup, zap, later, teach, addScore, convertBullets,
    inHull, targetable, compDamage, hullDamage, killEnemy } = XD;

  const gunScale = k => 1 + k * (P.gun - 1);

  /* ============================================================
     MAIN GUNS
     ============================================================ */
  function equipWeapon(id) {
    const w = WEAPONS[id];
    if (!w) return false;
    if (P.weapon === id) { addScore(2000, P.x, P.y + 78, true, w.name); return false; }
    P.weapon = id; P.fireT = 0; P.fireT3 = 0; P.drill = 0; P.drillC = null; G.seenWeapons[id] = true;
    sfx('weapon'); ringFx(P.x, P.y, 70, w.color, 0.35);
    popup(P.x, P.y + 78, w.name, w.color, true);
    if (w.teach) teach('weapon_' + id, w.teach[0], w.teach[1], 4.6);
    return true;
  }

  // one plane-bound player shot. o: { oy, ang, d, speed, pierce, hom, ap, life, look, col, core, len, wid }
  function addShot(x, y, o, cap) {
    if (shots.length >= (cap || 90)) return null;
    const sp = o.speed || 1150, a = o.ang || 0;
    const s = { x, y: y + (o.oy || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, d: o.d === undefined ? 1 : o.d,
      pierce: o.pierce | 0, hom: o.hom || 0, ap: o.ap || 0, life: o.life || 0, look: o.look || '', col: o.col, core: o.core,
      len: o.len || 0, wid: o.wid || 0, hit: o.pierce ? {} : null, t: 0, sp };
    shots.push(s);
    return s;
  }

  // the flat gun: the equipped weapon's `plane.volley(level)` every `plane.interval` seconds
  // (slow = a charge is building: half rate)
  function firePlane(firing, slow) {
    P.fireT -= DT;
    if (!firing || P.fireT > 0 || P.eject > 0) return;
    const w = weaponDef(), pl = w.plane;
    P.fireT = pl.interval * (slow ? 2 : 1); sfx(pl.sfx || 'shot');
    const v = pl.volley(P.gun);
    for (const q of v) {
      addShot(P.x + 18, P.y, { oy: q.oy, ang: q.ang, d: q.d, speed: q.speed || pl.speed, pierce: q.pierce === undefined ? pl.pierce : q.pierce,
        hom: q.hom === undefined ? pl.homing : q.hom, ap: q.ap === undefined ? pl.armorPierce : q.ap, life: q.life || pl.life,
        look: pl.look, col: pl.color || w.color, core: pl.core || w.core, len: pl.len, wid: pl.wid }, pl.cap);
    }
  }

  // nearest enemy a homing plane shot can actually hurt (bosses, shields and absolute armour are skipped)
  function seekTarget(x, y, skip) {
    let best = null, bd = 1e12;
    for (const e of enemies) {
      if (e.dead || e.dying || e.boss || e.armor <= 0 || e.shield || e.x - e.rw > W + 10) continue;
      if (skip && skip[e.id]) continue;
      const dx = e.x - x, dy = e.y - y; let d = dx * dx + dy * dy;
      if (dx < 0) d *= 4;   // prefers what is ahead of it
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // the 3-D weapon: lock the nearest open system under the ship and detonate inside it, the way the
  // equipped weapon's `above` block says (single / several targets / ramping drill / long sticky reach)
  function fireAbove(firing, slow) {
    const w = weaponDef(), A = w.above, fxCol = A.fx || null;
    let best = null, bestE = null, bd = 1e9; P.overHull = null;
    // a jumping weapon that has just destroyed its target reaches further for the next one (and hits it harder: jumpBoost)
    if (P.lockC && P.lockC.dead && A.jump) P.jumpT = A.jumpTime || 0.5;
    if (P.jumpT > 0) P.jumpT -= DT;
    const reach = A.jump && P.jumpT > 0 ? Math.max(A.reach, A.sticky) : A.reach;
    const near = [];   // every open system within A.radius of the ship (for multi-target weapons)
    for (const e of enemies) {
      if (e.dead || e.dying || e.x - e.rw > W + 20) continue;
      if (!P.overHull && inHull(e, P.x, P.y, 4)) P.overHull = e;
      for (const c of e.comps) {
        if (!targetable(e, c)) continue;
        const dx = e.x + c.ox - P.x, dy = e.y + c.oy - P.y; const d = Math.hypot(dx, dy) - c.r;
        if (d < (e.T.fodder ? A.fodderReach : reach) && d < bd) { bd = d; best = c; bestE = e; }
        if (A.targets > 1 && d < A.radius) near.push({ e, c, d });
      }
    }
    // a sticky lock holds on to the system it already has while it stays within `sticky` pixels
    if (A.sticky && P.lockC && P.lockE && P.lockC !== best && targetable(P.lockE, P.lockC) && !P.lockE.T.fodder) {
      const d = Math.hypot(P.lockE.x + P.lockC.ox - P.x, P.lockE.y + P.lockC.oy - P.y) - P.lockC.r;
      if (d < A.sticky) { best = P.lockC; bestE = P.lockE; }
    }
    if (best !== P.lockC && best) {
      sfx('lock');
      // a jumping weapon shows the arc to its new target
      if (A.jump && G.ph > 0.5) {
        zap(P.retX, P.retY, bestE.x + best.ox, bestE.y + best.oy, 4, w.color, 0.25);
        if (P.jumpT > 0 && !bestE.T.fodder) popup(bestE.x + best.ox, bestE.y + best.oy - best.r - 34, 'JUMP', w.color);
      }
    }
    P.lockC = best; P.lockE = bestE;
    const tx = best ? bestE.x + best.ox : P.x, ty = best ? bestE.y + best.oy : P.y;
    P.retX = lerp(P.retX, tx, 0.45); P.retY = lerp(P.retY, ty, 0.45);
    // the drill (weapons with a ramp) belongs to ONE system: a new system starts it again, but a lock that
    // merely slips for a moment only lets it spin down
    if (best) {
      if (best !== P.drillC) { P.drill = 0; P.drillC = best; }
      if (firing && !bestE.T.fodder) P.drill += DT * (slow ? 0.5 : 1);
    }
    else P.drill = Math.max(0, P.drill - 3 * DT);

    P.fireT3 -= DT;
    if (!firing || P.fireT3 > 0) return;
    P.fireT3 = A.interval * (slow ? 2 : 1);
    let dmg = A.damage * gunScale(0.14);
    if (A.ramp) dmg *= lerp(A.ramp.from, A.ramp.to, clamp(P.drill / A.ramp.time, 0, 1));
    if (A.jumpBoost && P.jumpT > 0) dmg *= A.jumpBoost;
    if (best) {
      const hitOne = (e, c, d, main) => {
        const jx = rnd(-c.r, c.r) * 0.7, jy = rnd(-c.r, c.r) * 0.7;
        const cx = e.x + c.ox, cy = e.y + c.oy, fod = e.T.fodder;
        internalFx(cx + jx, cy + jy, fod ? 10 : (c.r * 1.25 + 12) * (main ? (A.fxScale || 1) * (A.ramp ? 0.7 + 0.5 * clamp(P.drill / A.ramp.time, 0, 1) : 1) : 0.7), !main, fxCol);
        if (!fod && main) {
          // the blast runs along the decks around the system
          for (let q = 0; q < 2; q++) {
            const a = rnd(TAU), dd = rnd(30, 78), qx = cx + Math.cos(a) * dd, qy = cy + Math.sin(a) * dd * 0.6;
            if (inHull(e, qx, qy, -8)) { internalFx(qx, qy, rnd(8, 15), true, fxCol); break; }
          }
          shake(2.2); e.flash = Math.max(e.flash, 0.22);
        }
        compDamage(e, c, d);
      };
      sfx('int');
      hitOne(bestE, best, dmg, true);
      if (A.targets > 1) {
        // the same detonation, lighter, inside every other open system in range
        near.sort((a, b) => a.d - b.d);
        let n = 1;
        for (const q of near) {
          if (n >= A.targets) break;
          if (q.c === best || !targetable(q.e, q.c)) continue;
          n++;
          if (every(P, 'fanzap', 0.1)) zap(P.retX, P.retY, q.e.x + q.c.ox, q.e.y + q.c.oy, 2, w.color, 0.12);
          hitOne(q.e, q.c, dmg * (A.share === undefined ? 1 : A.share), false);
        }
      }
    }
    else if (P.overHull) {
      // over a hull but no system in reach: chip the hull (or bounce off a sealed one)
      const e = P.overHull;
      internalFx(P.x + rnd(-8, 8), P.y + rnd(-8, 8), 10, false, fxCol);
      if (e.noInt || e.boss) {
        if (every(e, 'nolock', 0.5)) {
          sfx('tink');
          popup(P.x, P.y - 30, e.noInt ? 'PHASE-LOCKED HULL' : (e.tethers > 0 ? 'ANCHOR-TETHERED' : 'SEALED — FIND THE OPEN SYSTEM'), '#e23bff');
        }
      }
      else { sfx('int'); e.hp -= A.hull; e.flash = Math.max(e.flash, 0.3); if (e.hp <= 0) killEnemy(e, 'int'); }
    }
    else if (every(P, 'fizz', 0.12)) { ringFx(P.x, P.y, 14, 'rgba(125,244,255,0.5)', 0.18); }
  }

  /* ============================================================
     CHARGE SHOT
     ============================================================ */
  // released in the plane: a beam through everything in the row. lv = charge level (min..1)
  // (the data block is still called charge.lance; on screen it is "the beam", so it is not confused with the LANCE gun)
  function chargeLance(lv) {
    const L = ARSENAL.charge.lance, full = lv >= 1;
    const dmg = L.damage * lv * gunScale(L.gunScale), wid = lerp(L.width, L.fullWidth, clamp((lv - 0.35) / 0.65, 0, 1));
    const x0 = P.x + 22, y = P.y;
    let x1 = W + 60, n = 0;
    const row = [];
    for (const e of enemies) {
      if (e.dead || e.dying || e.x + e.rw < x0 || e.x - e.rw > W + 20) continue;
      if (Math.abs(e.y - y) > e.rh * 0.85 + wid / 2) continue;
      row.push(e);
    }
    row.sort((a, b) => (a.x - a.rw) - (b.x - b.rw));
    for (const e of row) {
      const fx = Math.max(x0, e.x - e.rw * 0.8);
      if (e.shield) {
        // cracks the shield: it stays down for a few seconds (its generator restarts it)
        e.shield = false; e.shieldCrack = L.crack * lv; e.shieldFx = 1;
        ringFx(e.x, e.y, e.rw + 30, '#39d5ff', 0.35); popup(e.x - e.rw - 20, e.y - e.rh - 22, 'SHIELD CRACKED', '#39d5ff', true);
        hullDamage(e, dmg * L.shielded * Math.min(1, e.armor * L.armorPierce)); n++;
        continue;
      }
      if (e.boss || e.armor <= 0) {
        // absolute armour stops the lance dead
        x1 = fx; sfx('tink'); sparks(fx, y, 14, '#b9bcc6', 300);
        popup(fx - 30, y - 30, 'ARMOUR — NO EFFECT', '#b9bcc6');
        break;
      }
      n++;
      boom(clamp(fx, 0, W), y + rnd(-6, 6), 26, false);
      hullDamage(e, dmg * Math.min(1, e.armor * L.armorPierce));
    }
    // a full charge also burns small shots out of the row
    if (full && L.cancel) convertBullets(b => b.r <= L.cancelR && b.x > x0 && b.x < x1 && Math.abs(b.y - y) < wid / 2 + b.r);
    zap(x0, y, Math.min(x1, W + 60), y, wid, '#7df4ff', full ? 0.34 : 0.24);
    sfx('lance'); shake(5 + 7 * lv); P.chargeFx = 0;
    ringFx(x0, y, 40 + 30 * lv, '#ffffff', 0.25);
    if (full) {
      G.hitstop = Math.max(G.hitstop || 0, 3);
      popup(P.x + 150, P.y - 54, n > 2 ? 'SHRAAAK!' : 'ZWIP!', '#fff', false, true);
      if (n > 1) popup(P.x + 150, P.y + 44, 'BEAM ×' + n, '#7df4ff', true);
    }
    return n;
  }

  // released above the plane: one big detonation inside every open system in range, then along the decks
  function chargeBlast(lv) {
    const B = ARSENAL.charge.blast, R = B.radius * (0.6 + 0.4 * lv), dmg = B.damage * lv * gunScale(B.gunScale);
    const cx = P.x, cy = P.y, hits = [];
    for (const e of enemies) {
      if (e.dead || e.dying) continue;
      for (const c of e.comps) {
        if (!targetable(e, c)) continue;
        if (Math.hypot(e.x + c.ox - cx, e.y + c.oy - cy) - c.r < R) hits.push({ e, c, st: e.stage });
      }
    }
    P.chargeFx = 0;
    if (!hits.length) {
      const e = P.overHull;
      if (e && !e.noInt && !e.boss && !e.dead && !e.dying) {
        // nothing in range but we are inside a hull: the decks take it
        boom(cx, cy, 70, true); sfx('intboom'); shake(8);
        e.hp -= B.hull * lv; e.flash = 1; if (e.hp <= 0) killEnemy(e, 'int');
      }
      else {
        ringFx(cx, cy, R * 0.6, 'rgba(125,244,255,0.6)', 0.3); sfx('shock'); shake(4);
        popup(cx, cy - 40, e ? 'SEALED — CHARGE WASTED' : 'NOTHING TO GUT — CHARGE WASTED', '#9aa0ad');
      }
      return 0;
    }
    let caps = 0;
    const hulls = [];
    // one release never deletes a boss system outright: at most bossCap of its full hit points
    const hurt = (e, c, d) => compDamage(e, c, e.boss && B.bossCap ? Math.min(d, c.maxHp * B.bossCap) : d);
    for (const h of hits) {
      if (!targetable(h.e, h.c)) continue;
      const x = h.e.x + h.c.ox, y = h.e.y + h.c.oy;
      if (!h.e.T.fodder) { caps++; if (hulls.indexOf(h.e) < 0) hulls.push(h.e); boom(x, y, h.c.r * 3 + 40, true); h.e.flash = 1; }
      zap(cx, cy, x, y, 5, '#ffb030', 0.2);
      hurt(h.e, h.c, dmg);
    }
    // ...then the blast chains along the decks to the systems it did not reach
    for (const e of hulls) {
      const done = hits.filter(h => h.e === e).map(h => h.c);
      let from = done[0];
      const st0 = hits.find(h => h.e === e).st;   // the phase the blast was released in: a hop never crosses into the one it has just opened
      B.chain.forEach((f, i) => {
        later(B.chainDelay * (i + 1), () => {
          if (e.dead || e.dying || !from || e.stage !== st0) return;
          let nx = null, nd = B.chainRange;
          for (const c of e.comps) {
            if (done.indexOf(c) >= 0 || !targetable(e, c)) continue;
            const d = Math.hypot(c.ox - from.ox, c.oy - from.oy);
            if (d < nd) { nd = d; nx = c; }
          }
          if (!nx) return;
          const ax = e.x + from.ox, ay = e.y + from.oy, bx = e.x + nx.ox, by = e.y + nx.oy;
          zap(ax, ay, bx, by, 6, '#ffb030', 0.22);
          for (let q = 1; q < 4; q++) internalFx(lerp(ax, bx, q / 4) + rnd(-6, 6), lerp(ay, by, q / 4) + rnd(-6, 6), 12, true);
          boom(bx, by, nx.r * 3 + 24, true); sfx('intboom'); shake(8);
          popup(bx, by - 30, 'CHAIN', '#ffd23e');
          done.push(nx); from = nx;
          hurt(e, nx, dmg * f);
        });
      });
    }
    boom(cx, cy, R * 0.55, true); ringFx(cx, cy, R, '#ffb030', 0.5); ringFx(cx, cy, R * 0.6, '#ffffff', 0.3);
    sfx('megaboom'); shake(12 + 10 * lv);
    G.flash = Math.max(G.flash, 0.3); G.flashCol = '#ffd9a0';
    if (caps) {
      G.hitstop = Math.max(G.hitstop || 0, Math.round(B.hitstop * lv));
      popup(cx + (cx > W / 2 ? -120 : 120), cy - 110, lv >= 1 ? 'KA-DOOOM!' : 'DOOM!', '#fff', false, true);
      popup(cx, cy + 60, 'CHARGED DETONATION' + (caps > 1 ? ' ×' + caps : ''), '#ffd23e', true);
    }
    return hits.length;
  }

  // returns 0 = the charge key is up, 1 = a charge is building (the gun fires at half rate), 2 = held at full
  function updateCharge() {
    const C = ARSENAL.charge;
    P.chargeFx += DT;
    if (inp.charge && P.eject <= 0) {
      const was = P.charge;
      P.charge = Math.min(1, P.charge + DT / C.time);
      if (P.charge < 1) sfx('chargeup');
      else if (was < 1) {
        sfx('chargefull'); ringFx(P.x, P.y, 46, '#ffffff', 0.25);
        teach('charge_full', 'FULLY CHARGED',
          () => (G.phased ? 'LET GO OVER AN OPEN SYSTEM: ONE BIG DETONATION INSIDE THE HULL'
            : 'LET GO OF  [ ' + XD.chargeKeyName() + ' ]  FOR A BEAM DOWN THE ROW — OR CARRY IT ABOVE THE PLANE AND LET GO INSIDE A HULL'),
          3.6, () => P.charge >= 1);
      }
      return P.charge >= 1 ? 2 : 1;
    }
    if (P.charge > 0) {
      const lv = P.charge; P.charge = 0;
      if (lv >= C.min) {
        if (G.phased) chargeBlast(lv); else chargeLance(lv);
        P.fireT = Math.max(P.fireT, C.recover); P.fireT3 = Math.max(P.fireT3, C.recover);
      }
    }
    return 0;
  }

  /* ============================================================
     ABSORB BURST
     ============================================================ */
  // called from the bullet update for a bullet the phased ship has just passed through
  function bankBullet(b) {
    G.bank++; G.bankFx = 0.25; sfx('bank');
    if (parts.length < 650) parts.push({ x: b.x, y: b.y, vx: (P.x - b.x) * 6, vy: (P.y - b.y) * 6 - 60, t: 0, max: 0.2, sz: 3, col: '#7df4ff' });
    if (G.bank === 3) teach('absorb', 'ABSORB BURST', 'SHOTS YOU PHASE THROUGH ARE BANKED — THEY FIRE BACK WHEN YOU DROP INTO THE PLANE', 4.2);
    if (G.bank === ARSENAL.absorb.cap) popup(P.x, P.y - 70, 'BANK FULL', '#7df4ff', true);
  }
  // fire the banked shots as a homing burst of ordinary plane-bound shots — or, when nothing in the plane can be
  // hurt by them (a capital-ship duel, a screen of shields and absolute armour), feed them back into the drive
  function releaseBank() {
    G.bankPending = false;
    const A = ARSENAL.absorb, n0 = G.bank;
    if (n0 <= 0 || !P.alive) { G.bank = 0; return 0; }
    G.bank = 0;
    if (A.refund && !seekTarget(P.x, P.y)) {
      G.energy = Math.min(1, G.energy + A.refund * n0); G.readyT = 0.5;
      sfx('ready'); ringFx(P.x, P.y, 60 + n0, '#7df4ff', 0.3);
      popup(P.x, P.y - 62, 'BANK → DRIVE  +' + Math.round(A.refund * n0 * 100) + '%', '#7df4ff', true);
      return n0;
    }
    const n = Math.ceil(n0 / A.perShot), d = A.damage * n0 / n;
    for (let i = 0; i < n; i++) {
      const a = (n > 1 ? (i / (n - 1) - 0.5) : 0) * A.spread + rnd(-0.08, 0.08);
      addShot(P.x, P.y, { ang: a, d, speed: A.speed * rnd(0.85, 1.1), hom: A.turn, ap: A.armorPierce, life: A.life, look: 'burst', col: '#7df4ff', core: '#ffffff' }, 200);
    }
    sfx('burst'); ringFx(P.x, P.y, 80 + n0 * 2, '#7df4ff', 0.35);
    popup(P.x, P.y - 62, 'BURST ×' + n0, '#7df4ff', true);
    return n0;
  }

  /* ============================================================
     TETHER DRONE
     ============================================================ */
  const droneCfg = () => ARSENAL.drone.levels[DRONE.level] || null;
  const droneActive = () => DRONE.level > 0 && DRONE.down <= 0 && P.alive;
  // what the enemies' aimed fire is pointed at: the ship — or the drone it left behind as a decoy
  function aimTarget() { return (G.phased && DRONE.mode === 'anchor' && droneActive()) ? DRONE : P; }

  function droneHome() {
    const D = ARSENAL.drone;
    DRONE.mode = 'follow'; DRONE.x = P.x + D.offX; DRONE.y = P.y + D.offY * DRONE.side; DRONE.fireT = 0;
  }
  // collect a drone pickup: gain or upgrade the drone. Returns false at the top level.
  function giveDrone() {
    const max = ARSENAL.drone.levels.length - 1;
    if (DRONE.level >= max) { DRONE.hp = droneCfg().hp; DRONE.down = 0; return false; }
    DRONE.level++; DRONE.hp = droneCfg().hp; DRONE.down = 0; DRONE.regen = 0;
    if (DRONE.level === 1) droneHome();
    ringFx(DRONE.x, DRONE.y, 60, '#7df4ff', 0.35);
    return true;
  }
  // the ship was lost: the drone drops one level
  function droneLose() {
    if (DRONE.level <= 0) return;
    boom(DRONE.x, DRONE.y, 30, false);
    DRONE.level--; DRONE.mode = 'follow'; DRONE.down = 0;
    if (DRONE.level > 0) DRONE.hp = droneCfg().hp;
  }
  function dronePhaseIn() {
    if (DRONE.level <= 0) return;
    DRONE.mode = 'anchor'; DRONE.fireT = 0.15;
    ringFx(DRONE.x, DRONE.y, 34, '#7df4ff', 0.3);
    teach('drone_anchor', 'DRONE DECOY', 'WHEN YOU PHASE IT HOLDS YOUR PLACE: THEY AIM AT IT, NOT AT YOU — THEN IT SNAPS BACK THROUGH THEIR SHOTS', 4);
  }
  function dronePhaseOut() {
    if (DRONE.level <= 0 || DRONE.mode !== 'anchor') return;
    DRONE.mode = 'recall'; DRONE.hitIds = {}; DRONE.swept = 0; sfx('recall');
  }
  // a small bullet ran into the drone
  function droneBlock(b) {
    const c = droneCfg();
    DRONE.hp -= b.r > ARSENAL.drone.heavyR ? 2 : 1;   // the medium (orange) shots cost two points of shell
    DRONE.flash = 1; DRONE.regen = 0; sfx('block');
    if (parts.length < 650) for (let i = 0; i < 3; i++) parts.push({ x: b.x, y: b.y, vx: rnd(-160, 160), vy: rnd(-160, 160), t: 0, max: 0.2, sz: 2.5, col: '#7df4ff' });
    if (DRONE.hp <= 0) {
      DRONE.hp = 0; DRONE.down = c.down; sfx('dronedown');
      popup(DRONE.x, DRONE.y - 26, 'DRONE OFFLINE', '#ff8a8a');
    }
  }
  function updateDrone(firing) {
    if (DRONE.level <= 0) return;
    const D = ARSENAL.drone, c = droneCfg();
    DRONE.t += DT;
    if (DRONE.flash > 0) DRONE.flash -= DT * 5;
    if (!P.alive) return;
    if (DRONE.down > 0) {
      DRONE.down -= DT;
      if (DRONE.down <= 0) { DRONE.hp = c.hp; DRONE.regen = 0; sfx('droneup'); ringFx(DRONE.x, DRONE.y, 30, '#7df4ff', 0.3); }
    }
    else if (DRONE.hp < c.hp) { DRONE.regen += DT; if (DRONE.regen >= c.regen) { DRONE.regen = 0; DRONE.hp++; } }

    if (DRONE.mode === 'anchor' && !G.phased) dronePhaseOut();
    if (DRONE.mode === 'follow') {
      // trails the ship on the side it is not moving towards; FOCUS swings it in front as a buckler
      const my = (inp.d ? 1 : 0) - (inp.u ? 1 : 0);
      if (my) DRONE.side = -my;
      const front = inp.focus;
      const tx = P.x + (front ? D.frontX : D.offX), ty = P.y + (front ? 0 : D.offY * DRONE.side);
      const f = front ? 0.3 : D.follow;
      DRONE.x = lerp(DRONE.x, tx, f); DRONE.y = lerp(DRONE.y, ty, f);
    }
    else if (DRONE.mode === 'recall') {
      // snap back along the tether, damaging whatever is in the way and sweeping small shots out of its wake
      for (let q = 0; q < 2; q++) {
        const dx = P.x + D.offX - DRONE.x, dy = P.y - DRONE.y, d = Math.hypot(dx, dy), st = D.recallSpeed * DT / 2;
        if (d <= st + 20) {
          DRONE.mode = 'follow'; ringFx(DRONE.x, DRONE.y, 26, '#7df4ff', 0.2);
          if (DRONE.swept > 0) popup(P.x, P.y + 46, 'SNAP-BACK ×' + DRONE.swept, '#7df4ff');
          break;
        }
        DRONE.x += dx / d * st; DRONE.y += dy / d * st;
        if (c.wake) {
          const wx = DRONE.x, wy = DRONE.y, w2 = c.wake * c.wake;
          DRONE.swept += convertBullets(b => b.r <= D.maxBulletR && (b.x - wx) * (b.x - wx) + (b.y - wy) * (b.y - wy) < w2);
        }
        if (parts.length < 650) parts.push({ x: DRONE.x, y: DRONE.y, vx: -dx / d * 60, vy: -dy / d * 60, t: 0, max: 0.25, sz: 4, col: '#7df4ff' });
        for (const e of enemies) {
          if (e.dead || e.dying || DRONE.hitIds[e.id] || !inHull(e, DRONE.x, DRONE.y, 10)) continue;
          DRONE.hitIds[e.id] = 1;
          if (e.boss || e.armor <= 0 || e.shield) { sfx('tink'); sparks(DRONE.x, DRONE.y, 6, '#b9bcc6', 200); continue; }
          boom(DRONE.x, DRONE.y, 24, false); sfx('hit'); DRONE.swept++;
          hullDamage(e, e.T.fodder ? 99 : c.recall * e.armor);
        }
      }
    }
    // its gun: with the ship's while it follows; on its own, at whatever the ship is gutting, while anchored
    if (DRONE.down > 0 || DRONE.mode === 'recall') return;
    const anch = DRONE.mode === 'anchor';
    DRONE.fireT -= DT * (anch ? D.anchorRate : 1);
    if (DRONE.fireT <= 0 && (anch || firing) && P.eject <= 0) {
      DRONE.fireT = c.interval;
      let ang = 0;
      if (anch) {
        // (a boss or an absolute-armour hull shrugs its shots off: then it picks on something it can hurt instead)
        const t = P.lockE && !P.lockE.T.fodder && !P.lockE.boss && P.lockE.armor > 0 && !P.lockE.shield ? P.lockE : null;
        if (t) ang = Math.atan2(t.y + (P.lockC ? P.lockC.oy : 0) - DRONE.y, t.x + (P.lockC ? P.lockC.ox : 0) - DRONE.x);
        else { const e = seekTarget(DRONE.x, DRONE.y); if (e) ang = Math.atan2(e.y - DRONE.y, e.x - DRONE.x); }
      }
      for (let i = 0; i < c.shots; i++) {
        const off = c.shots > 1 ? (i - (c.shots - 1) / 2) : 0;
        addShot(DRONE.x + 10, DRONE.y + off * 8, { ang: ang + off * 0.05, d: c.dmg, speed: D.shotSpeed, look: 'drone', col: '#7df4ff', core: '#ffffff' }, 110);
      }
    }
  }

  /* ============================================================
     per-tick entry points (called from js/player.js)
     ============================================================ */
  function updateArsenal() {
    // the gun never falls silent because the charge key is held: it drops to half rate while the charge builds,
    // and is back at full rate once the charge is full and merely being carried
    const charging = updateCharge();
    const firing = !!inp.fire, slow = charging === 1;
    if (!G.phased) {
      firePlane(firing, slow);
      P.retX = P.x; P.retY = P.y; P.lockE = P.lockC = null; P.overHull = null; P.drill = 0; P.drillC = null;
    }
    else fireAbove(firing, slow);
    updateDrone(firing);
    if (G.bankPending && P.eject <= 0 && !G.phased) releaseBank();
    if (G.bankFx > 0) G.bankFx -= DT;
  }
  // the ship left / re-entered the plane. inside = it came down inside a hull (it is about to be thrown clear)
  function arsenalPhase(entering, inside) {
    if (entering) { dronePhaseIn(); return; }
    dronePhaseOut();
    if (G.bank > 0) { if (inside) G.bankPending = true; else releaseBank(); }
  }
  function arsenalDeath() { P.charge = 0; G.bank = 0; G.bankPending = false; droneLose(); }
  function arsenalRespawn() { P.charge = 0; P.drill = 0; P.drillC = null; P.jumpT = 0; if (DRONE.level > 0) droneHome(); }
  // a new run: back to the starting weapon (XD.setStartWeapon, else the first one defined), no drone
  function arsenalReset() {
    P.weapon = XD.startWeapon(); P.charge = 0; P.drill = 0; P.drillC = null; G.bank = 0; G.bankPending = false;
    G.taught = {}; G.teachQ.length = 0; G.seenWeapons = {}; G.seenWeapons[P.weapon] = true;
    DRONE.level = 0; DRONE.mode = 'follow'; DRONE.down = 0; DRONE.hp = 0;
  }

  // debug / tester hook: __game.give('drone' | <weapon id> | 'gun' | 'cell' | 'charge' | 'bank' | 'life')
  function give(what) {
    what = String(what || '').toLowerCase();
    if (what === 'drone') return giveDrone();
    if (WEAPONS[what]) { if (P.weapon !== what) equipWeapon(what); return true; }
    if (what === 'gun') { if (P.gun < MAX_GUN) { P.gun++; return true; } return false; }
    if (what === 'cell') { G.energy = Math.min(1, G.energy + 0.34); return true; }
    if (what === 'charge') { P.charge = 1; return true; }
    if (what === 'bank') { G.bank = Math.min(ARSENAL.absorb.cap, G.bank + 20); return true; }
    if (what === 'life') { G.lives++; return true; }
    return false;
  }

  Object.assign(XD, { equipWeapon, addShot, seekTarget, chargeLance, chargeBlast, bankBullet, releaseBank,
    droneCfg, droneActive, aimTarget, giveDrone, droneBlock, updateArsenal, arsenalPhase, arsenalDeath, arsenalRespawn, arsenalReset, give });
})();
