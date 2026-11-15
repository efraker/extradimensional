/* ============================================================
   js/enemies.js : engine side of enemies.
   Spawning, hull tests, damage and its consequences, death, drops, the built-in movement
   behaviours (XD.defineAI) and the per-tick update. WHAT the enemies are lives in
   data/enemies.js, how they shoot in data/patterns.js, what their systems do in data/systems.js.
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { G, P, W, H, DT, clamp, lerp, rnd, enemies, parts, TYPES, PATTERNS, AIS, DROPS, CHAIN, defineAI, systemOf, pickupUseful, firstUseful, chainAdd,
    sfx, shake, boom, ringFx, popup, addScore, fan, aimP, convertBullets, killLasers, dropPickup } = XD;

  let eid = 1;   // unique id per spawned enemy (bullets remember their owner's id)

  /* ---------------- spawning ----------------
     spawn(type, x, y, overrides) creates an enemy from XD.TYPES[type]. `overrides` is copied onto the
     instance last, so it can set the movement (ai, spd, y0, tx, stay, amp, ...), a guaranteed `drop`,
     or any custom field a pattern wants to read. Ships face LEFT; component offsets are from the hull centre. */
  function spawn(type, x, y, o) {
    const T = TYPES[type];
    if (!T) { XD.warn('spawn: unknown enemy type "' + type + '" (XD.defineEnemy) — nothing was spawned'); return null; }
    const e = {
      id: eid++, type, T, x, y, vx: 0, vy: 0, rw: T.rw, rh: T.rh, hp: T.hp, maxHp: T.hp, armor: T.armor,
      shield: !!T.shield, shieldFx: 0, comps: [], t: 0, tm: {}, cn: {}, flash: 0, dying: 0, dead: false,
      disabled: false, stalled: false, noSpawn: false, ai: 'drift', spd: 60, x0: x, y0: y, seed: rnd(1000),
      boss: !!T.boss, stage: 0, score: T.score, noInt: !!T.noInt, rot: 0, tethers: 0, pause: 0, entering: false, leaving: false
    };
    // comps: [kind, ox, oy, r, hp, phase?]
    for (const c of T.comps) e.comps.push({ kind: c[0], name: c[0], ox: c[1], oy: c[2], r: c[3], hp: c[4], maxHp: c[4], stage: c[5], dead: false, flash: 0 });
    // unique names for duplicated kinds (magazine, magazine2, ...)
    const seen = {};
    for (const c of e.comps) { seen[c.kind] = (seen[c.kind] || 0) + 1; if (seen[c.kind] > 1) c.name = c.kind + seen[c.kind]; }
    // overrides are copied last. Reserved (engine-owned) fields you should not override: id, T, type, comps, boss,
    // stage, tm, cn, dead, dying. An overridden hp also becomes the instance's full hp.
    if (o) { Object.assign(e, o); if (o.hp !== undefined && o.maxHp === undefined) e.maxHp = o.hp; }
    enemies.push(e);
    return e;
  }

  // is world point (x,y) inside the hull polygon of e (grown by `pad` pixels)?
  function inHull(e, x, y, pad) {
    const dx = (x - e.x) / (e.rw + (pad || 0)), dy = (y - e.y) / (e.rh + (pad || 0));
    if (dx < -1 || dx > 1 || dy < -1 || dy > 1) return false;
    const p = e.T.poly;
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
      if (((yi > dy) !== (yj > dy)) && (dx < (xj - xi) * (dy - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  // live enemies of one type
  function countType(t) { let n = 0; for (const e of enemies) if (e.type === t && !e.dead && !e.dying) n++; return n; }

  // can the 3-D weapon lock component c of enemy e right now?
  function targetable(e, c) {
    if (c.dead || e.dying || e.dead || e.noInt || e.entering) return false;
    if (e.boss && (c.stage !== e.stage || e.tethers > 0)) return false;   // bosses open one phase at a time, and not while tethered
    return true;
  }

  // the anchor whose field covers (x,y), if any. Any enemy type with a `field` radius is an anchor.
  function anchorAt(x, y) {
    for (const e of enemies) {
      if (!e.T.field || e.dead || e.dying || e.t < 1.6) continue;
      const dx = x - e.x, dy = y - e.y, f = e.field || e.T.field;
      if (dx * dx + dy * dy < f * f) return e;
    }
    return null;
  }

  // world position of gun mount i of enemy e (T.guns)
  function gunPos(e, i) { const g = e.T.guns[i]; return [e.x + g[0], e.y + g[1]]; }

  // spawn an anchor that tethers `e`: it flies in from (fromX,fromY) and holds station at offset (ax,ay)
  function spawnAnchorFor(e, ax, ay, fromX, fromY, type) {
    const a = spawn(type || 'anchor', fromX, fromY, { ai: 'attach', parent: e, ax, ay });
    if (a) e.tethers++;
    return a;
  }

  /* ---------------- damage & consequences ---------------- */
  function hullDamage(e, d) {
    if (e.dead || e.dying || e.boss) return;
    e.hp -= d; e.flash = 1;
    if (e.hp <= 0) killEnemy(e, 'ext');
  }
  function compDamage(e, c, d) {
    c.hp -= d; c.flash = 1; e.flash = Math.max(e.flash, 0.35);
    if (c.hp <= 0) { c.hp = 0; c.dead = true; compDestroyed(e, c); }
  }
  // an area blast (magazines): damages every non-boss hull in range and cancels bullets
  function blast(x, y, R, dmg, src) {
    ringFx(x, y, R, '#ffb030', 0.5); boom(x, y, R * 0.6, true); shake(16); sfx('bigboom');
    G.flash = Math.max(G.flash, 0.35); G.flashCol = '#ffd9a0';
    for (const o of enemies) {
      if (o === src || o.dead || o.dying || o.boss) continue;
      const dx = o.x - x, dy = o.y - y, rr = R + Math.max(o.rw, o.rh) * 0.6;
      if (dx * dx + dy * dy < rr * rr) { o.hp -= dmg; o.flash = 1; if (o.hp <= 0) killEnemy(o, 'blast'); }
    }
    convertBullets(b => { const dx = b.x - x, dy = b.y - y; return dx * dx + dy * dy < R * R; });
  }
  // a component just reached 0 hp: common fanfare, then the system's own consequence (data/systems.js)
  function compDestroyed(e, c) {
    const cx = e.x + c.ox, cy = e.y + c.oy, sys = systemOf(c.kind);
    boom(cx, cy, c.r * 4 + 30, true); shake(e.T.fodder ? 3 : 9);
    if (!e.T.fodder) {
      G.hitstop = e.boss ? 7 : 4;
      sfx('intboom');
      popup(cx, cy - 26, sys.label + ' DESTROYED', '#ffd23e');
      popup(cx + (cx > W / 2 ? -1 : 1) * rnd(70, 130), cy - 96, sys.krak || 'KRAK!', '#fff', false, true);
      addScore(300 * (e.boss ? 6 : 1), cx, cy, false);
      chainAdd(e.boss ? CHAIN.bossSystem : CHAIN.system, true); G.energy = Math.min(1, G.energy + 0.06);
    }
    if (e.boss) { XD.bossCompDown(e, c); return; }
    // every system is a different answer: reactor = slow jackpot, the side systems are quick and each pays off its own way
    if (sys.onDestroyed) sys.onDestroyed(e, c, cx, cy);
  }

  /* how: 'ext' (shot down in the plane), 'int' (gutted from inside), 'blast' (caught in a magazine blast) */
  function killEnemy(e, how) {
    if (e.dying || e.dead) return;
    const cap = !e.T.fodder, internal = (how === 'int' || how === 'blast');
    // the chain is about GUTTING: capital ships and their systems build it, fodder only keeps it warm
    if (internal) { chainAdd(cap ? CHAIN.gut : CHAIN.gutFodder, cap); G.chain++; }
    else chainAdd(cap ? CHAIN.kill : CHAIN.killFodder, false);
    G.kills++;
    // "full gut": every side system wrecked before the ship died is worth chain and score
    let side = 0, tot = 0;
    if (internal && cap && !e.boss) for (const c of e.comps) { if (systemOf(c.kind).fatal) continue; tot++; if (c.dead) side++; }
    if (side > 0) chainAdd(side * CHAIN.side + (side === tot ? CHAIN.fullGut : 0), true);
    // (a boss pays out once, when the stage is cleared: js/bosses.js stageCleared)
    if (!e.boss) addScore(e.score * (internal ? 1.5 : 1) * (1 + 0.5 * side), e.x, e.y - e.rh, true, internal && cap ? (side > 0 && side === tot ? 'FULL GUT' : 'GUTTED') : null);
    if (!internal) G.energy = Math.min(1, G.energy + (cap ? 0.15 : 0.03));
    else G.energy = Math.min(1, G.energy + (cap ? 0.12 : 0.02));
    convertBullets(b => b.owner === e.id); killLasers(e);
    if (e.T.field) {
      // an anchor dying releases its tether on the ship it was protecting
      ringFx(e.x, e.y, e.field || e.T.field, '#e23bff', 0.6);
      for (const o of enemies) if (o === e.parent) o.tethers = Math.max(0, o.tethers - 1);
    }
    if (cap) {
      e.dying = e.boss ? (e.T.deathTime || 3.6) : (internal ? 0.9 : 0.5);
      e.dyT = 0; e.internalDeath = internal;
      sfx(e.boss ? 'bigboom' : 'boom'); shake(e.boss ? 26 : 12);
    }
    else { e.dead = true; boom(e.x, e.y, 36, internal); sfx('pop'); }
    // drops
    if (e.boss) return;
    if (e.drop) { dropPickup(e.x, e.y, e.drop); }
    else if (cap) {
      if (e.T.dropCell || Math.random() < DROPS.capitalCellChance) dropPickup(e.x, e.y, DROPS.cell);
      // bonus drop: the first useful entry of DROPS.bonus (gun upgrade, drone, weapon...), else a second cell
      if (e.T.dropBonus) dropPickup(e.x + 30, e.y + 20, firstUseful(DROPS.bonus || DROPS.upgrade) || DROPS.cell);
    }
    else {
      G.fodderKills++;
      // special drops on a fixed kill count (weapon capsule, drone), only while they are useful
      let special = null;
      for (const r of DROPS.fodderSpecials) if (G.fodderKills % r.every === r.at && pickupUseful(r.id)) { special = r.id; break; }
      if (special) dropPickup(e.x, e.y, special);
      else if (G.fodderKills % DROPS.fodderEvery === 0) {
        dropPickup(e.x, e.y, pickupUseful(DROPS.upgrade) && (G.fodderKills % DROPS.fodderUpgradeEvery === DROPS.fodderUpgradeAt) ? DROPS.upgrade : DROPS.cell);
      }
    }
  }

  /* ---------------- movement behaviours ----------------
     Selected per enemy by e.ai (set in the spawn overrides). Add your own with XD.defineAI(id, fn). */

  // default: scroll left at e.spd with a gentle bob (e.bob, default 10)
  defineAI('drift', e => {
    if (!e.stalled) e.x -= e.spd * DT;
    e.y = e.y0 + (e.bob || 10) * Math.sin(e.t * 0.8 + e.seed);
  });
  // scroll left on a sine wave: amp (60), freq (2.2), phase (0)
  defineAI('sine', e => {
    e.x -= e.spd * DT;
    e.y = e.y0 + (e.amp || 60) * Math.sin(e.t * (e.freq || 2.2) + (e.phase || 0));
  });
  // enter along the top/bottom edge and swoop across the lane: dir (+1 from the top, -1 from the bottom), amp (380)
  defineAI('swoop', e => {
    e.x -= e.spd * DT;
    const u = clamp((1300 - e.x) / 900, 0, 1);
    e.y = e.y0 + e.dir * (e.amp || 380) * (u * u * (3 - 2 * u));
  });
  // fly in to x = tx, flash for 0.55s, fire an aimed fan, then charge the player's row
  defineAI('dive', e => {
    if (e.st === undefined) { e.st = 0; }
    if (e.st === 0) {
      e.x -= Math.min(560, (e.x - e.tx) * 3 + 60) * DT;
      if (e.x <= e.tx + 4) { e.st = 1; e.wait = 0.55; }
    }
    else if (e.st === 1) {
      e.wait -= DT; e.flash = Math.max(e.flash, 0.25 + 0.25 * Math.sin(e.t * 40));
      if (e.wait <= 0) {
        e.st = 2;
        fan(e.x - 20, e.y, aimP(e.x, e.y), 3 + (XD.tier() > 1 ? 2 : 0), 0.5, 250 * XD.bs(), 2, e);
        e.vx = -540; e.vy = clamp((P.y - e.y) * 1.1, -220, 220);
      }
    }
    else { e.x += e.vx * DT; e.y += e.vy * DT; }
  });
  // fly in to x = tx, hold station for `stay` seconds (bobbing by e.bob, default 14), then leave to the left
  defineAI('hold', e => {
    if (!e.leaving) {
      if (e.x > e.tx) e.x -= Math.min(e.spd * 3, (e.x - e.tx) * 2 + 24) * DT;
      e.y = e.y0 + (e.bob || 14) * Math.sin(e.t * 0.9 + e.seed);
      if (e.x < e.tx + 30) { e.stay -= DT; if (e.stay <= 0 && !e.stalled) e.leaving = true; }
    }
    else if (!e.stalled) { e.vx = Math.max(e.vx - 70 * DT, -150); e.x += e.vx * DT; }
  });
  // keep station at offset (ax, ay) from e.parent; dies with it (anchors)
  defineAI('attach', e => {
    const p = e.parent;
    if (!p || p.dead || p.dying) { e.hp = 0; killEnemy(e, 'ext'); return; }
    e.x = lerp(e.x, p.x + e.ax, 0.06);
    e.y = lerp(e.y, p.y + e.ay + Math.sin(e.t * 1.3 + e.seed) * 30, 0.06);
  });

  function moveEnemy(e) {
    if (e.disabled) {
      // bridge destroyed: the ship drifts blind until its crew scuttles it
      e.x += (-14) * DT; e.y += (e.driftV || 0) * DT; e.rot += 0.03 * DT * (e.driftV > 0 ? 1 : -1);
      if (!e.stalled) e.x -= 10 * DT;
      if (e.scuttle !== undefined) {
        e.scuttle -= DT;
        e.flash = Math.max(e.flash, e.scuttle < 1 ? 0.5 + 0.5 * Math.sin(e.t * 50) : 0);
        if (e.scuttle <= 0) killEnemy(e, 'int');
      }
      return;
    }
    if (e.stalled && !e.boss) {
      // no engines: the armada leaves it behind (full credit, never a lingering turret)
      e.vx = Math.min(300, (e.vx > 0 ? e.vx : 0) + 130 * DT); e.x += e.vx * DT; e.y += 6 * DT; e.rot += 0.05 * DT;
      if (e.x - e.rw > W + 30) {
        e.dead = true; G.kills++; chainAdd(CHAIN.leftBehind, true); G.chain++;
        killLasers(e); convertBullets(b => b.owner === e.id);
        addScore(e.score, W - 170, clamp(e.y, 90, 630), true, 'LEFT BEHIND');
        dropPickup(W - 50, e.y, DROPS.cell); G.energy = Math.min(1, G.energy + 0.1); sfx('boom');
      }
      return;
    }
    (AIS[e.ai] || AIS.drift)(e);
  }

  /* ---------------- per-tick update ---------------- */
  const DEATH_CRIES = ['KRAK!', 'BWAAAM!', 'KA-THOOM!', 'SKREEE!'];
  function updateEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.t += DT;
      if (e.flash > 0) e.flash -= DT * 5;
      if (e.shieldFx > 0) e.shieldFx -= DT * 4;
      for (const c of e.comps) if (c.flash > 0) c.flash -= DT * 6;
      // a shield cracked by a charged beam comes back when its timer runs out (unless the generator was gutted meanwhile)
      if (e.shieldCrack > 0) {
        e.shieldCrack -= DT;
        if (e.shieldCrack <= 0 && !e.dead && !e.dying) {
          let gen = false;
          for (const c of e.comps) if (c.kind === 'shield' && !c.dead) gen = true;
          if (gen) { e.shield = true; e.shieldFx = 1; }
        }
      }

      if (e.dying > 0) {
        // capital ships take a moment to come apart
        e.dying -= DT; e.dyT -= DT; e.y += 12 * DT; e.rot += 0.05 * DT;
        if (e.boss) {
          // a boss blows its systems one after another
          e.dyN = (e.dyN || 0) + DT;
          if (e.dyN > 0.42 && e.comps.length) {
            e.dyN = 0; e.dyI = (e.dyI || 0) + 1;
            const c = e.comps[e.dyI % e.comps.length], cx = e.x + c.ox, cy = e.y + c.oy;
            boom(cx, cy, 120, true); ringFx(cx, cy, 170, '#ffb030', 0.45);
            popup(cx + rnd(-30, 30), cy - 40, DEATH_CRIES[e.dyI % 4], '#fff', false, true);
            G.flash = Math.max(G.flash, 0.2); G.flashCol = '#ffd9a0'; G.hitstop = 3;
          }
        }
        if (e.dyT <= 0) {
          e.dyT = e.boss ? 0.07 : 0.09;
          const px = e.x + rnd(-e.rw, e.rw) * 0.8, py = e.y + rnd(-e.rh, e.rh) * 0.8;
          boom(px, py, rnd(30, 70) + (e.boss ? 30 : 0), e.internalDeath);
          if (e.boss) { shake(10); sfx('boom'); }
        }
        if (e.dying <= 0) {
          e.dead = true;
          boom(e.x, e.y, Math.min(260, e.rw * 1.5), true); ringFx(e.x, e.y, e.rw * 2.2, '#fff', 0.6);
          shake(e.boss ? 30 : 14); sfx('bigboom');
          G.flash = Math.max(G.flash, e.boss ? 1 : 0.3); G.flashCol = '#fff';
          if (e.boss) XD.bossDead(e);
        }
      }
      else if (!e.dead) {
        moveEnemy(e);
        // a ship that is leaving and has already drawn level with you holds fire: nothing shoots you in the back point-blank
        if (!e.dead && !e.disabled && !e.dying && P.alive && !(e.leaving && e.x - e.rw < P.x + 120)) {
          if (e.boss) XD.bossFire(e);
          else { const fire = PATTERNS[e.T.pattern]; if (fire) fire(e); }
        }
        // visible damage states on the outside of the hull: wrecked systems burn and smoke
        if (!e.dead && !e.boss && !e.T.fodder && parts.length < 620) {
          e.smk = (e.smk || 0) + DT;
          if (e.smk > 0.07) {
            e.smk = 0;
            for (const c of e.comps) if (c.dead) parts.push({ x: e.x + c.ox + rnd(-6, 6), y: e.y + c.oy + rnd(-6, 6), vx: rnd(30, 90), vy: rnd(-70, -20),
              t: 0, max: rnd(0.4, 0.8), sz: rnd(3, 6), col: Math.random() < 0.5 ? '#ff8a1f' : '#07080b', ink: true });
          }
        }
        // off-screen: gone without credit
        if (!e.boss && (e.x < -e.rw - 120 || e.y < -300 || e.y > H + 300)) { e.dead = true; e.gone = true; }
      }
      if (e.dead) { enemies[i] = enemies[enemies.length - 1]; enemies.pop(); if (G.boss === e && e.gone) G.boss = null; }
    }
  }

  Object.assign(XD, { spawn, inHull, countType, targetable, anchorAt, gunPos, spawnAnchorFor,
    hullDamage, compDamage, blast, compDestroyed, killEnemy, moveEnemy, updateEnemies });
})();
