/* ============================================================
   js/bullets.js : everything that flies.
   - enemy bullets and the emitters patterns use (fireB / ring / fan / wall / addLaser)
   - the player's flat shots
   - beam lasers, gap walls, hull contact, and "shards" (cancelled bullets that home in as score)
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { G, P, W, H, DT, TAU, YMIN, YMAX, clamp, rnd, every, enemies, bullets, bpool, shots, lasers, shards, parts, walls,
    sfx, shake, popup } = XD;

  /* ---------------- enemy bullets ----------------
     Bullet kinds: index -> radius and colour. 0 pink small, 1 orange medium, 2 yellow fast dart, 3 red large. */
  const BK = [{ r: 6, c: '#ff3d8b' }, { r: 8, c: '#ff8a1f' }, { r: 5, c: '#ffe14a' }, { r: 12, c: '#ff3636' }];
  const MAXB = 1100;   // hard cap on live bullets

  // fire one bullet. k = kind index into BK, owner = the enemy (its bullets vanish when it dies), acc = speed growth per second
  function fireB(x, y, ang, spd, k, owner, acc) {
    if (bullets.length >= MAXB) return null;
    const b = bpool.pop() || {};
    b.x = x; b.y = y; b.vx = Math.cos(ang) * spd; b.vy = Math.sin(ang) * spd;
    b.k = k | 0; b.r = BK[k | 0].r; b.owner = owner ? owner.id : 0; b.gz = false; b.acc = acc || 0; b.t = 0;
    bullets.push(b);
    return b;
  }
  // angle from (x,y) to the player — or to the tether drone it left in the plane as a decoy (XD.aimTarget)
  const aimP = (x, y) => { const t = XD.aimTarget(); return Math.atan2(t.y - y, t.x - x); };
  // n bullets in a full circle, rotated by `off` radians
  function ring(x, y, n, spd, k, owner, off) {
    for (let i = 0; i < n; i++) fireB(x, y, (off || 0) + i / n * TAU, spd, k, owner);
  }
  // n bullets spread evenly over `spread` radians, centred on `ang`
  function fan(x, y, ang, n, spread, spd, k, owner) {
    for (let i = 0; i < n; i++) fireB(x, y, ang + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0), spd, k, owner);
  }

  /* gap walls: a full-height column of bullets with one hole. Telegraphed for 0.8s (dashed column,
     gap marked) and never materialises on top of the player. */
  function wall(x, gapY, gapH, spd, k, owner, step) {
    if (walls.length > 6) return;
    walls.push({ x, gapY: clamp(gapY, YMIN + gapH / 2, YMAX - gapH / 2), gapH, spd, k, e: owner, step: step || 28, t: 0, tele: 0.8 });
    sfx('charge');
  }
  function updateWalls() {
    for (let i = walls.length - 1; i >= 0; i--) {
      const w = walls[i]; w.t += DT;
      if (!w.e || w.e.dead || w.e.dying) { walls.splice(i, 1); continue; }
      if (w.t >= w.tele) {
        walls.splice(i, 1);
        for (let y = 18; y < H - 10; y += w.step) {
          if (Math.abs(y - w.gapY) < w.gapH / 2) continue;
          const dx = w.x - P.x, dy = y - P.y;
          if (dx * dx + dy * dy < 80 * 80) continue;
          fireB(w.x, y, Math.PI, w.spd, w.k, w.e);
        }
      }
    }
  }

  /* beam lasers: attached to an enemy at offset (ox,oy), telegraphed for `tele` seconds, then live for
     `dur` seconds with width w. angV sweeps the beam (radians/second) once it is live. */
  function addLaser(e, ox, oy, ang, tele, dur, w, angV) {
    if (lasers.length > 12) return;
    lasers.push({ e, ox, oy, ang, tele, dur, w, angV: angV || 0, t: 0, fired: false });
    sfx('charge');
  }
  function killLasers(e) { for (let i = lasers.length - 1; i >= 0; i--) if (lasers[i].e === e) lasers.splice(i, 1); }

  /* shards: a cancelled bullet becomes a shard that homes in on the player for score + a sliver of energy */
  function shardFrom(x, y) {
    if (shards.length > 260) { G.score += 20 * Math.floor(G.mult); G.energy = Math.min(1, G.energy + 0.002); return; }
    shards.push({ x, y, vx: rnd(-80, 80), vy: rnd(-80, 80), t: 0 });
  }
  // turn every bullet matching fn (or all bullets) into shards; returns how many
  function convertBullets(fn) {
    let n = 0;
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      if (!fn || fn(b)) { shardFrom(b.x, b.y); bpool.push(b); bullets[i] = bullets[bullets.length - 1]; bullets.pop(); n++; }
    }
    return n;
  }

  /* ---------------- the player's flat shots ---------------- */
  /* A shot is { x, y, vx, vy, d } plus optional extras set by XD.addShot (js/arsenal.js):
       pierce  how many more hulls it may pass through after its first hit
       hom     homing turn rate in radians/second (it steers at the nearest hull it can hurt)
       ap      armour-piercing factor: armour multiplier is min(1, armor * ap) instead of armor
       life    seconds before it fizzles (homing shots);  look / col / core / len / wid: how it is drawn
     Whatever the extras, every shot obeys the plane: shields eat it, absolute armour and bosses ignore it. */
  function updateShots() {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      if (s.hom) {
        s.t += DT;
        if (!s.tg || s.tg.dead || s.tg.dying || s.tg.shield || (s.rt = (s.rt || 0) - DT) <= 0) { s.tg = XD.seekTarget(s.x, s.y, s.hit); s.rt = 0.2; }
        if (s.tg) {
          const want = Math.atan2(s.tg.y - s.y, s.tg.x - s.x), cur = Math.atan2(s.vy, s.vx);
          let da = want - cur; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
          const a = cur + clamp(da, -s.hom * DT, s.hom * DT);
          s.vx = Math.cos(a) * s.sp; s.vy = Math.sin(a) * s.sp;
        }
      }
      s.x += s.vx * DT; s.y += s.vy * DT;
      let gone = s.x > W + 20 || s.x < -20 || s.y < -10 || s.y > H + 10 || (s.life > 0 && s.t > s.life);
      if (!gone) for (const e of enemies) {
        if (e.dead || e.dying) continue;
        if (s.hit && s.hit[e.id]) continue;
        if (s.x < e.x - e.rw - 20 || s.x > e.x + e.rw + 20 || s.y < e.y - e.rh - 20 || s.y > e.y + e.rh + 20) continue;
        if (e.shield) {
          // a shield is an ellipse around the hull that simply eats shots
          const dx = (s.x - e.x) / (e.rw + 16), dy = (s.y - e.y) / (e.rh + 16);
          if (dx * dx + dy * dy < 1) {
            gone = true; e.shieldFx = 1; sfx('tink');
            if (parts.length < 600) parts.push({ x: s.x, y: s.y, vx: -200, vy: rnd(-120, 120), t: 0, max: 0.2, sz: 2.5, col: '#39d5ff' });
            if (!G.seenShield && every(G, 'shmsg', 1.2)) popup(e.x - e.rw - 30, e.y - e.rh - 20, 'SHIELDED', '#39d5ff');
            break;
          }
          continue;
        }
        if (XD.inHull(e, s.x, s.y, 4)) {
          if (e.armor <= 0 || e.boss) {
            // absolute armour: the shot does nothing at all (and no shot pierces it)
            gone = true;
            sfx('tink');
            if (parts.length < 600) parts.push({ x: s.x, y: s.y, vx: rnd(-260, -80), vy: rnd(-160, 160), t: 0, max: 0.22, sz: 2, col: '#b9bcc6' });
            if (every(G, 'armsg', 1.6)) popup(s.x - 20, s.y - 24, 'ARMOUR — NO EFFECT', '#b9bcc6');
          } else {
            const arm = s.ap ? Math.min(1, e.armor * s.ap) : e.armor;
            XD.hullDamage(e, s.d * arm);
            sfx(arm < 0.5 ? 'tink' : 'hit');
            if (parts.length < 600) parts.push({ x: s.x, y: s.y, vx: rnd(-220, -60), vy: rnd(-140, 140), t: 0, max: 0.2, sz: 2.5, col: arm < 0.5 ? '#b9bcc6' : '#fff' });
            if (s.pierce > 0) { s.pierce--; s.hit[e.id] = 1; continue; }   // a piercing shot carries on through
            gone = true;
          }
          break;
        }
      }
      if (gone) { shots[i] = shots[shots.length - 1]; shots.pop(); }
    }
  }

  /* ---------------- bullets, lasers, hull contact, shards ---------------- */
  function updateBullets() {
    const px = P.x, py = P.y, can = P.alive && !G.phased, canGraze = P.inv <= 0 && !G.invincible;
    // absorb: bullets the phased ship passes through are banked.  drone: its body stops small bullets.
    const AB = XD.ARSENAL.absorb, absorb = P.alive && G.phased, ar2 = AB.radius * AB.radius;
    const DR = XD.DRONE, dc = XD.droneCfg(), dOn = !!dc && XD.droneActive() && DR.mode !== 'recall', dMaxR = XD.ARSENAL.drone.maxBulletR;
    updateWalls();
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]; b.t += DT;
      if (b.acc) { const f = 1 + b.acc * DT; b.vx *= f; b.vy *= f; }
      b.x += b.vx * DT; b.y += b.vy * DT;
      let gone = b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30;
      if (!gone && absorb && G.bank < AB.cap) {
        const dx = b.x - px, dy = b.y - py;
        if (dx * dx + dy * dy < ar2) { XD.bankBullet(b); gone = true; }
      }
      if (!gone && dOn && b.r <= dMaxR && DR.down <= 0) {
        const dx = b.x - DR.x, dy = b.y - DR.y, rr = dc.blockR + b.r;
        if (dx * dx + dy * dy < rr * rr) { XD.droneBlock(b); gone = true; }
      }
      if (!gone && can) {
        const dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy, hr = b.r * 0.5 + 3;
        if (d2 < hr * hr) { if (XD.hitPlayer()) return; }
        else if (!b.gz && canGraze && d2 < (b.r + 26) * (b.r + 26)) {
          // graze: a near miss charges the drive
          b.gz = true; G.energy = Math.min(1, G.energy + 0.03); G.grazeT = 0.25;
          G.score += 10 * Math.floor(G.mult); G.grazes = (G.grazes || 0) + 1; sfx('graze');
          if (parts.length < 650) parts.push({ x: px + dx * 0.5, y: py + dy * 0.5, vx: rnd(-90, 90), vy: rnd(-90, 90), t: 0, max: 0.25, sz: 2.5, col: '#7df4ff' });
        }
      }
      if (gone) { bpool.push(b); bullets[i] = bullets[bullets.length - 1]; bullets.pop(); }
    }

    // lasers
    for (let i = lasers.length - 1; i >= 0; i--) {
      const l = lasers[i]; if (!l) continue;
      l.t += DT; const e = l.e;
      if (e.dead || e.dying || e.disabled) { lasers.splice(i, 1); continue; }
      if (l.t >= l.tele) {
        if (!l.fired) { l.fired = true; sfx('laser'); shake(6); }
        l.ang += l.angV * DT;
        if (can) {
          const ox = e.x + l.ox, oy = e.y + l.oy, dx = px - ox, dy = py - oy, c = Math.cos(l.ang), s = Math.sin(l.ang);
          const along = dx * c + dy * s, perp = Math.abs(-dx * s + dy * c);
          if (along > 0 && perp < l.w / 2 - 3 && XD.hitPlayer()) break;
        }
      }
      if (l.t > l.tele + l.dur) lasers.splice(i, 1);
    }

    // hull contact: small craft and ordinary hulls kill. A capital-ship boss shoves you back out instead (no free
    // invulnerability), and for 1.5s after any ejection a hull can only push — re-entry is never a cheap death.
    if (P.alive && !G.phased && P.eject <= 0) {
      for (const e of enemies) {
        if (e.dead || e.dying) continue;
        if (XD.inHull(e, px, py, -5)) {
          if (!e.T.fodder && (e.boss || P.sinceEj < 1.5)) {
            P.eject = 0.5; shake(5); sfx('bump');
            if (e.boss && every(P, 'bumpmsg', 1.2)) popup(px, py - 40, 'HULL — NO WAY THROUGH IN THE PLANE', '#b9bcc6');
          }
          else if (P.grace <= 0) XD.hitPlayer();
          break;
        }
      }
    }

    // shards (converted bullets) home in
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i]; s.t += DT;
      if (P.alive && s.t > 0.25) {
        const dx = P.x - s.x, dy = P.y - s.y, d = Math.hypot(dx, dy) || 1, a = 1500 + s.t * 2500;
        s.vx += dx / d * a * DT; s.vy += dy / d * a * DT; s.vx *= 0.93; s.vy *= 0.93;
        if (d < 26) {
          shards[i] = shards[shards.length - 1]; shards.pop();
          G.score += 20 * Math.floor(G.mult); G.energy = Math.min(1, G.energy + 0.0035); sfx('shard');
          continue;
        }
      }
      else { s.vx *= 0.95; s.vy *= 0.95; }
      s.x += s.vx * DT; s.y += s.vy * DT;
      if (s.t > 6) { shards[i] = shards[shards.length - 1]; shards.pop(); }
    }

    XD.movePickups();
  }

  Object.assign(XD, { BK, MAXB, fireB, aimP, ring, fan, wall, updateWalls, addLaser, killLasers, shardFrom, convertBullets, updateShots, updateBullets });
})();
