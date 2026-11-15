/* ============================================================
   js/render.js : drawing the world.
   The play field is drawn through a transform that tips the plane away as the ship leaves it
   (G.ph goes 0 -> 1), cross-fading every hull from its exterior sprite to its inked cutaway.
   HUD, title, overlays and the victory screen are in js/hud.js.
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { G, P, DRONE, W, H, TAU, INK, F_HEAD, F_MONO, clamp, rnd, hash, ctx, inp, enemies, bullets, shots, lasers, pickups, shards, parts, booms, popups, walls, zaps,
    ARSENAL, weaponDef,
    PICKUPS, systemOf, assetImage, targetable, SPR, gfx } = XD;

  // text with an optional ink outline
  function txt(s, x, y, font, fill, align, stroke, sw) {
    ctx.font = font; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = sw || 4; ctx.strokeStyle = stroke; ctx.strokeText(s, x, y); }
    ctx.fillStyle = fill; ctx.fillText(s, x, y);
  }

  /* ---------------- the plane transform ---------------- */
  let shx = 0, shy = 0;                           // screen shake offset this frame
  const SKEW = 0.17, SQUASH = 0.2, LIFT = 64;     // how far the plane tips away when you leave it
  // world -> screen
  function w2s(x, y) { const k = G.ph; return [640 + shx + (x - 640) - SKEW * k * (y - 360), 360 + shy + 16 * k + (1 - SQUASH * k) * (y - 360)]; }
  function applyWorld() { const k = G.ph; ctx.translate(640 + shx, 360 + shy + 16 * k); ctx.transform(1, 0, -SKEW * k, 1 - SQUASH * k, 0, 0); ctx.translate(-640, -360); }

  /* ---------------- backdrop: gradient, optional stage image, stars, far-off armada ---------------- */
  function drawBackdrop(k) {
    ctx.drawImage(gfx.bg, 0, 0);
    const bi = assetImage(gfx.backdropImage);
    if (bi) {
      // optional stage backdrop image, scaled to cover the screen
      const iw = bi.naturalWidth || W, ih = bi.naturalHeight || H, s = Math.max(W / iw, H / ih);
      ctx.drawImage(bi, W / 2 - iw * s / 2, H / 2 - ih * s / 2, iw * s, ih * s);
    }
    const t = G.time;
    for (const s of gfx.stars) {
      let x = (s.x - t * s.sp) % W; if (x < 0) x += W;
      const y = s.y + k * (s.L + 1) * 9;
      ctx.globalAlpha = s.a * (1 - 0.4 * k); ctx.fillStyle = s.L === 2 ? '#cfe8ff' : '#ffffff';
      if (s.L === 2) ctx.fillRect(x, y, 10, 1.5); else ctx.fillRect(x, y, s.sz, s.sz);
    }
    for (const a of gfx.armada) {
      const sp = SPR[a.k]; if (!sp || !sp.sil) continue;
      const span = W + 500; let x = (a.x - t * a.sp) % span; if (x < 0) x += span; x -= 250;
      ctx.globalAlpha = (0.05 + a.s * 0.45) * (G.boss && G.scene !== 'title' ? 0.45 : 1);
      ctx.drawImage(sp.sil, x, a.y + k * 18 * a.s * 3, sp.sw * a.s, sp.sh * a.s);
    }
    ctx.globalAlpha = 1;
    if (k > 0.01) { ctx.fillStyle = 'rgba(4,10,26,' + (0.62 * k) + ')'; ctx.fillRect(0, 0, W, H); }
  }

  // the grid that shows the plane itself once you are above it
  function drawGrid(k) {
    const off = (G.time * 90) % 80;
    ctx.globalAlpha = 0.16 * k; ctx.strokeStyle = '#8fd8ff'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = -200 - off + 40; x < W + 280; x += 80) { ctx.moveTo(x, -120); ctx.lineTo(x, H + 160); }
    for (let y = -120 + 40; y <= H + 160; y += 80) { ctx.moveTo(-240, y); ctx.lineTo(W + 280, y); }
    ctx.stroke();
    ctx.globalAlpha = 0.42 * k; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let x = -200 - off; x < W + 280; x += 80) { ctx.moveTo(x, -120); ctx.lineTo(x, H + 160); }
    for (let y = -120; y <= H + 160; y += 80) { ctx.moveTo(-240, y); ctx.lineTo(W + 280, y); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }

  /* ---------------- one internal system inside a cutaway (drawn in the enemy's local space) ---------------- */
  function drawComp(e, c, k) {
    const x = c.ox, y = c.oy, r = c.r, fod = e.T.fodder, sys = systemOf(c.kind);
    if (c.dead) {
      // a wrecked system is a jagged ink blot
      ctx.globalAlpha = k; ctx.fillStyle = INK; ctx.beginPath();
      for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, rr = r * (i % 2 ? 0.75 : 1.5 + 0.4 * hash(i + c.ox)); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; return;
    }
    const open = targetable(e, c), col = sys.color, t = G.time;
    ctx.globalAlpha = k * (open ? 1 : 0.6);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, TAU); ctx.fill();
    ctx.fillStyle = open ? col : '#8d897b'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (!fod) {
      // the system's own icon (data/systems.js)
      ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = Math.max(1.5, r * 0.14);
      if (sys.icon) sys.icon(ctx, x, y, r, t);
      // sealed (boss system of a later phase): crossed out
      if (!open && e.boss) { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke(); }
      // open: pulsing ring
      if (open) {
        ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r + 7 + 3 * Math.sin(t * 7), 0, TAU); ctx.stroke();
        ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r + 9 + 3 * Math.sin(t * 7), 0, TAU); ctx.stroke();
      }
      // damaged: remaining-hp arc, and cracks
      if (c.hp < c.maxHp) {
        const f = c.hp / c.maxHp;
        ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
        ctx.lineWidth = 4.5; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
        // the system cracks as it takes damage
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath();
        const nc = Math.ceil((1 - f) * 5);
        for (let i = 0; i < nc; i++) {
          const a = hash(i * 3.7 + c.ox) * TAU;
          ctx.moveTo(x + Math.cos(a) * r * 0.15, y + Math.sin(a) * r * 0.15);
          ctx.lineTo(x + Math.cos(a + 0.4) * r * 0.6, y + Math.sin(a + 0.4) * r * 0.6);
          ctx.lineTo(x + Math.cos(a - 0.1) * r * 1.05, y + Math.sin(a - 0.1) * r * 1.05);
        }
        ctx.stroke();
      }
      // name plate
      const lab = open ? sys.label : (e.boss ? 'SEALED' : sys.label);
      ctx.font = 'bold 13px ' + F_MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(lab).width + 10;
      ctx.fillStyle = open ? INK : 'rgba(7,8,11,0.6)'; ctx.fillRect(x - tw / 2, y + r + 13, tw, 17);
      ctx.fillStyle = open ? col : '#cfcabb'; ctx.fillText(lab, x, y + r + 22);
    }
    if (c.flash > 0) { ctx.globalAlpha = k * Math.min(1, c.flash); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  /* ---------------- one enemy: exterior <-> cutaway cross-fade by k ---------------- */
  function drawEnemy(e, k) {
    const s = SPR[e.type];
    ctx.save(); ctx.translate(e.x, e.y);
    if (e.dying > 0) ctx.translate(rnd(-3, 3), rnd(-3, 3));
    if (e.rot) ctx.rotate(clamp(e.rot, -0.12, 0.12));
    if (s.blend) ctx.globalCompositeOperation = s.blend;   // image art may ask for a blend mode (e.g. 'lighten' for art on black)
    if (k < 0.99) { ctx.globalAlpha = 1 - k; ctx.drawImage(s.ext, -s.w / 2, -s.h / 2); }
    if (k > 0.01) { ctx.globalAlpha = k; ctx.drawImage(s.cut, -s.cw / 2, -s.ch / 2); }
    if (e.flash > 0) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, e.flash) * 0.5;
      if (k > 0.5) ctx.drawImage(s.cut, -s.cw / 2, -s.ch / 2); else ctx.drawImage(s.ext, -s.w / 2, -s.h / 2);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (k > 0.01) {
      for (const c of e.comps) drawComp(e, c, k);
      if (e.noInt) {
        // phase-locked hull: nothing to hit inside
        ctx.globalAlpha = k; ctx.strokeStyle = '#e23bff'; ctx.lineWidth = 3; ctx.beginPath();
        ctx.moveTo(-12, -12); ctx.lineTo(12, 12); ctx.moveTo(12, -12); ctx.lineTo(-12, 12); ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    // in the plane a capital ship's hull marks where its currently open systems are, so you can line the dive up first
    if (e.boss && !e.entering && !e.dying && k < 0.6) {
      const pu = 0.5 + 0.5 * Math.sin(G.time * 6);
      for (const c of e.comps) {
        if (!targetable(e, c)) continue;
        const sys = systemOf(c.kind), col = sys.color, rr = c.r + 11 + 4 * pu;
        ctx.globalAlpha = Math.max(0, 1 - k * 1.7) * (0.6 + 0.4 * pu);
        for (let pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = pass ? col : INK; ctx.lineWidth = pass ? 3 : 7; ctx.beginPath();
          ctx.moveTo(c.ox, c.oy - rr); ctx.lineTo(c.ox + rr, c.oy); ctx.lineTo(c.ox, c.oy + rr); ctx.lineTo(c.ox - rr, c.oy); ctx.closePath(); ctx.stroke();
        }
        const ty = c.oy - rr - 10 - 5 * pu;
        ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath();
        ctx.moveTo(c.ox - 9, ty - 12); ctx.lineTo(c.ox + 9, ty - 12); ctx.lineTo(c.ox, ty); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.font = 'bold 13px ' + F_MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const lab = 'DIVE: ' + sys.label, tw = ctx.measureText(lab).width + 10;
        ctx.fillStyle = INK; ctx.fillRect(c.ox - tw / 2, c.oy + rr + 6, tw, 17); ctx.fillStyle = col; ctx.fillText(lab, c.ox, c.oy + rr + 15);
      }
      ctx.globalAlpha = 1;
    }
    if (e.shield) {
      // the shield only covers the forward half
      const fx = Math.max(0, e.shieldFx), a = (0.55 + 0.45 * fx) * (1 - 0.6 * k) * (0.8 + 0.2 * Math.sin(G.time * 14 + e.seed));
      ctx.globalAlpha = a * 0.25; ctx.fillStyle = '#39d5ff'; ctx.beginPath(); ctx.ellipse(0, 0, e.rw + 16, e.rh + 16, 0, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
      ctx.globalAlpha = a; ctx.strokeStyle = fx > 0.3 ? '#fff' : '#39d5ff'; ctx.lineWidth = 3 + fx * 3; ctx.beginPath(); ctx.ellipse(0, 0, e.rw + 16, e.rh + 16, 0, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // the no-phase field around an anchor, and its tether to the ship it protects
  function drawAnchorField(e) {
    const R = (e.field || e.T.field) * clamp(e.t / 1.6, 0, 1), act = e.t >= 1.6, t = G.time;
    if (R < 2) return;
    ctx.save(); ctx.translate(e.x, e.y);
    const g = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
    g.addColorStop(0, 'rgba(150,70,255,0.02)'); g.addColorStop(0.8, 'rgba(150,70,255,' + (act ? 0.06 : 0.03) + ')'); g.addColorStop(1, 'rgba(190,70,255,0.16)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#e23bff'; ctx.lineWidth = act ? 3 : 1.5; ctx.setLineDash([16, 10]); ctx.lineDashOffset = -t * 40;
    ctx.globalAlpha = act ? 0.9 : 0.5 + 0.4 * Math.sin(t * 30);
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 0.22; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + t * 0.3; ctx.moveTo(Math.cos(a) * 34, Math.sin(a) * 34); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); }
    ctx.stroke();
    ctx.globalAlpha = 0.3; const rr = R * ((t * 0.5) % 1); ctx.beginPath(); ctx.arc(0, 0, Math.max(1, R - rr), 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1; ctx.restore();
    txt('ANCHOR FIELD — NO PHASE', e.x, Math.max(G.boss ? 92 : 16, e.y - R - 12), 'bold 14px ' + F_MONO, '#f3a8ff', 'center', INK, 4);
    if (e.parent && !e.parent.dead) {
      const p = e.parent;
      ctx.strokeStyle = '#e23bff'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.55 + 0.3 * Math.sin(t * 12); ctx.setLineDash([6, 8]); ctx.lineDashOffset = t * 60;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.quadraticCurveTo((e.x + p.x) / 2, (e.y + p.y) / 2 + 40 * Math.sin(t * 2 + e.seed), p.x - p.rw * 0.5, p.y); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  }

  // beam lasers: a telegraph (with the sweep arc shown for sweeping beams), then the beam
  function drawLasers(k) {
    const dim = 1 - 0.65 * k;
    for (const l of lasers) {
      const ox = l.e.x + l.ox, oy = l.e.y + l.oy;
      ctx.save(); ctx.translate(ox, oy); ctx.rotate(l.ang);
      if (l.t < l.tele) {
        const u = l.t / l.tele;
        ctx.globalAlpha = (0.10 + 0.16 * u) * dim; ctx.fillStyle = '#ff3636'; ctx.fillRect(0, -l.w / 2, 1800, l.w);
        if (l.angV) {
          ctx.globalAlpha = (0.09 + 0.07 * u) * dim; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 1800, 0, l.angV * l.dur, l.angV < 0); ctx.closePath(); ctx.fill();
          ctx.save(); ctx.rotate(l.angV * l.dur); ctx.globalAlpha = 0.7 * dim; ctx.strokeStyle = '#ff8080'; ctx.lineWidth = 2; ctx.setLineDash([6, 12]);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1800, 0); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
        }
        ctx.globalAlpha = (0.45 + 0.5 * u) * (0.55 + 0.45 * Math.sin(G.time * 45)) * dim; ctx.strokeStyle = '#ff8080'; ctx.lineWidth = 2; ctx.setLineDash([16, 10]);
        ctx.beginPath(); ctx.moveTo(0, -l.w / 2); ctx.lineTo(1800, -l.w / 2); ctx.moveTo(0, l.w / 2); ctx.lineTo(1800, l.w / 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = dim; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 4 + u * l.w * 0.45, 0, TAU); ctx.fill();
      }
      else {
        const f = 1 - clamp((l.t - l.tele - l.dur + 0.12) / 0.12, 0, 1), w = l.w * f * (0.9 + 0.1 * Math.sin(G.time * 70));
        ctx.globalAlpha = dim * 0.4; ctx.fillStyle = '#ff3c5a'; ctx.fillRect(0, -w * 0.85, 1800, w * 1.7);
        ctx.globalAlpha = dim; ctx.fillStyle = '#ff5a7a'; ctx.fillRect(0, -w / 2, 1800, w); ctx.fillStyle = '#fff'; ctx.fillRect(0, -w * 0.28, 1800, w * 0.56);
        ctx.beginPath(); ctx.arc(0, 0, w * 0.8, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // a jagged n-pointed star path (the outline of a manga blast)
  function starPath(x, y, r, n, seed) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = i / (n * 2) * TAU + seed, rr = i % 2 ? r * (0.5 + 0.12 * hash(seed + i)) : r * (0.95 + 0.35 * hash(seed + i * 3));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  // layered manga blasts: speed lines, an inked outer star, a hot inner star
  function drawBooms() {
    for (const b of booms) {
      const u = b.t / b.max, eo = 1 - (1 - u) * (1 - u);
      if (b.ring) { ctx.globalAlpha = 1 - u; ctx.strokeStyle = b.col; ctx.lineWidth = 5 * (1 - u) + 1; ctx.beginPath(); ctx.arc(b.x, b.y, b.R * eo, 0, TAU); ctx.stroke(); continue; }
      const r = b.R * (0.3 + 0.7 * eo), al = Math.min(1, (1 - u) * 1.6);
      if (b.lines) {
        ctx.globalAlpha = al; ctx.beginPath(); const n = 16;
        for (let i = 0; i < n; i++) {
          const a = i / n * TAU + b.seed * 1.7 + hash(i + b.seed) * 0.3, r0 = r * (1.15 + 0.25 * hash(i * 2 + b.seed)), r1 = r0 + b.R * (0.3 + 0.6 * hash(i * 5 + b.seed)) * (0.35 + eo);
          ctx.moveTo(b.x + Math.cos(a) * r0, b.y + Math.sin(a) * r0); ctx.lineTo(b.x + Math.cos(a) * r1, b.y + Math.sin(a) * r1);
        }
        ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 1.6; ctx.strokeStyle = b.internal ? '#ffd9a0' : '#f2efe4'; ctx.stroke();
      }
      ctx.globalAlpha = al;
      starPath(b.x, b.y, r, 11, b.seed);
      // (b.col: a 3-D weapon's own detonation colour; the default internal blast is orange with a red heart)
      ctx.fillStyle = u < 0.25 ? '#ffffff' : (b.internal ? (b.col || '#ffb030') : '#f2efe4'); ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
      if (b.R >= 20 && u < 0.8) {
        starPath(b.x, b.y, r * 0.6, 8, b.seed + 1.9);
        ctx.fillStyle = b.internal ? (u < 0.35 ? '#fff6d0' : (b.col ? '#ffffff' : '#ff5a1f')) : (u < 0.35 ? '#ffffff' : '#b9b5a8'); ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke();
      }
      else if (b.internal && u < 0.6) { ctx.fillStyle = b.col ? '#ffffff' : '#ff5a1f'; ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.32, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- the player ship ---------------- */
  function shipShape() {
    ctx.beginPath(); ctx.moveTo(25, 0); ctx.lineTo(5, -7); ctx.lineTo(-5, -15); ctx.lineTo(-19, -15); ctx.lineTo(-12, -5); ctx.lineTo(-18, 0);
    ctx.lineTo(-12, 5); ctx.lineTo(-19, 15); ctx.lineTo(-5, 15); ctx.lineTo(5, 7); ctx.closePath();
  }
  function drawShip(x, y, sc, tilt, k) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc * (1 - Math.abs(tilt) * 0.2));
    const fl = 11 + 6 * Math.sin(G.time * 55);   // engine flame flicker
    ctx.fillStyle = k > 0.5 ? '#ffffff' : '#7df4ff'; ctx.beginPath(); ctx.moveTo(-15, -4.5); ctx.lineTo(-15 - fl, 0); ctx.lineTo(-15, 4.5); ctx.closePath(); ctx.fill();
    ctx.lineJoin = 'round';
    shipShape(); ctx.lineWidth = 10 + 3 * k; ctx.strokeStyle = 'rgba(57,213,255,' + (0.4 + 0.4 * k) + ')'; ctx.stroke();
    shipShape(); ctx.lineWidth = 4.5 + 2.5 * k; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = '#f4f1e6'; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(-14, -11); ctx.lineTo(0, -8); ctx.moveTo(-14, 11); ctx.lineTo(0, 8); ctx.moveTo(-9, -13); ctx.lineTo(-4, -9); ctx.moveTo(-9, 13); ctx.lineTo(-4, 9); ctx.stroke();
    ctx.fillStyle = '#17a9cb'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(3, -3.6); ctx.lineTo(-2, 0); ctx.lineTo(3, 3.6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function drawShipGhost(x, y, sc, col, a) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.globalAlpha = a; shipShape(); ctx.fillStyle = col; ctx.fill(); ctx.restore(); ctx.globalAlpha = 1;
  }

  /* ---------------- the tether drone ---------------- */
  function droneShape(lv) {
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(3, -9); ctx.lineTo(-11, -7);
    if (lv > 1) { ctx.lineTo(-15, -13); ctx.lineTo(-9, -3); }
    ctx.lineTo(-6, 0);
    if (lv > 1) { ctx.lineTo(-9, 3); ctx.lineTo(-15, 13); }
    ctx.lineTo(-11, 7); ctx.lineTo(3, 9); ctx.closePath();
  }
  // drawn in the plane (world space): it is a flat thing, and it stays there when the ship rises
  function drawDrone(k) {
    if (DRONE.level <= 0 || !P.alive) return;
    const c = XD.droneCfg(), down = DRONE.down > 0, anch = DRONE.mode === 'anchor', t = G.time, x = DRONE.x, y = DRONE.y;
    ctx.save(); ctx.translate(x, y);
    if (anch && !down) {
      // the decoy marker: this is what they are aiming at. It has to read at a glance from above the plane,
      // where everything flat is dimmed: a halo, a solid pulsing ring and a dashed one.
      const pu = 0.5 + 0.5 * Math.sin(t * 9), rr = 26 + 4 * pu;
      ctx.drawImage(gfx.glow, -60, -60);
      ctx.globalAlpha = 0.16 + 0.12 * pu; ctx.fillStyle = '#7df4ff'; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.45 + 0.45 * pu; ctx.strokeStyle = '#7df4ff'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.setLineDash([7, 6]); ctx.lineDashOffset = -t * 40; ctx.beginPath(); ctx.arc(0, 0, rr + 8, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    const sc = DRONE.level > 1 ? 1.15 : 1; ctx.scale(sc, sc);
    ctx.lineJoin = 'round';
    droneShape(DRONE.level); ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(57,213,255,' + (down ? 0.12 : 0.45) + ')'; ctx.stroke();
    droneShape(DRONE.level); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = down ? '#6d7078' : '#f4f1e6'; ctx.fill();
    ctx.fillStyle = down ? INK : (Math.floor(t * 10) % 2 && anch ? '#ffffff' : '#17a9cb'); ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(-1, 0, 4.2, 0, TAU); ctx.fill(); ctx.stroke();
    if (DRONE.flash > 0) { ctx.globalAlpha = Math.min(1, DRONE.flash); droneShape(DRONE.level); ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalAlpha = 1; }
    // shell durability: one tick per bullet it can still stop
    const n = c.hp, a0 = -Math.PI / 2, span = TAU / n;
    for (let i = 0; i < n; i++) {
      ctx.strokeStyle = i < DRONE.hp && !down ? '#7df4ff' : 'rgba(110,116,128,0.7)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 19, a0 + i * span + 0.12, a0 + (i + 1) * span - 0.12); ctx.stroke();
    }
    ctx.restore();
    if (anch && !down && k > 0.3) txt('DECOY', x, y + 48, 'bold 14px ' + F_MONO, '#7df4ff', 'center', INK, 5);
    if (down) txt('OFFLINE', x, y + 32, 'bold 11px ' + F_MONO, '#ff8a8a', 'center', INK, 3);
  }

  /* ---------------- the player's flat shots (look comes from the weapon, data/weapons.js) ---------------- */
  function drawShots() {
    for (const s of shots) {
      const lk = s.look, col = s.col || '#39d5ff', core = s.core || '#ffffff';
      if (!lk || lk === 'bolt') {
        ctx.fillStyle = col; ctx.fillRect(s.x - 13, s.y - 3, 24, 6); ctx.fillStyle = core; ctx.fillRect(s.x - 6, s.y - 1.5, 17, 3);
        continue;
      }
      if (lk === 'drone') { ctx.fillStyle = INK; ctx.fillRect(s.x - 10, s.y - 3.5, 18, 7); ctx.fillStyle = col; ctx.fillRect(s.x - 9, s.y - 2, 16, 4); continue; }
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.vy, s.vx));
      if (lk === 'beam') {
        // a long bar: ink edge, the shot colour, a core that pokes out ahead
        const L = s.len || 60, w = s.wid || 4;
        ctx.fillStyle = INK; ctx.fillRect(-L - 2, -w - 2, L + 12, w * 2 + 4);
        ctx.fillStyle = col; ctx.fillRect(-L, -w, L + 8, w * 2); ctx.fillStyle = core; ctx.fillRect(-L, -w / 2, L + 12, w);
      }
      else if (lk === 'fan') {
        const L = s.len || 14, w = s.wid || 5;
        ctx.fillStyle = INK; ctx.fillRect(-L / 2 - 1.5, -w / 2 - 1.5, L + 3, w + 3); ctx.fillStyle = col; ctx.fillRect(-L / 2, -w / 2, L, w); ctx.fillStyle = core; ctx.fillRect(0, -w / 4, L / 2, w / 2);
      }
      else if (lk === 'dart') {
        ctx.scale(1.25, 1.25);
        ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-8, -7); ctx.lineTo(-4, 0); ctx.lineTo(-8, 7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -5); ctx.lineTo(-2, 0); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = core; ctx.fillRect(1, -1, 6, 2);
      }
      else {   // 'burst': the absorbed shots coming back — cyan needles with a white core
        ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(0, -6); ctx.lineTo(-16, 0); ctx.lineTo(0, 6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(0, -4); ctx.lineTo(-12, 0); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  // beams and arcs: the charge lance, the charged detonation's chains, weapon jump arcs
  function drawZaps() {
    for (const z of zaps) {
      const u = z.t / z.max, w = z.w * (1 - u * 0.75), a = 1 - u * u;
      ctx.lineCap = 'butt';
      ctx.globalAlpha = a; ctx.strokeStyle = INK; ctx.lineWidth = w + 7; ctx.beginPath(); ctx.moveTo(z.x0, z.y0); ctx.lineTo(z.x1, z.y1); ctx.stroke();
      ctx.strokeStyle = z.col; ctx.lineWidth = w + 2; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, w * 0.55); ctx.stroke();
      if (z.w >= 16) {
        // a heavy beam drags speed lines along its edges
        ctx.strokeStyle = '#dffaff'; ctx.lineWidth = 2; ctx.beginPath();
        const dx = z.x1 - z.x0, dy = z.y1 - z.y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        for (let i = 0; i < 14; i++) {
          const f0 = hash(i * 3.3 + z.x0) * 0.85, f1 = f0 + 0.08 + 0.1 * hash(i), o = (hash(i * 7.7) - 0.5) * (z.w * 2.6 + 30 * u);
          ctx.moveTo(z.x0 + dx * f0 + nx * o, z.y0 + dy * f0 + ny * o); ctx.lineTo(z.x0 + dx * Math.min(1, f1) + nx * o, z.y0 + dy * Math.min(1, f1) + ny * o);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- pickups (look comes from data/pickups.js) ---------------- */
  function drawPickups() {
    for (const p of pickups) {
      const def = PICKUPS[p.kind] || { color: '#7dff6a', label: p.kind, labelSize: 13, shape: 'diamond', spin: 0 };
      // colour and label may be functions of the pickup (the weapon capsule cycles)
      const col = typeof def.color === 'function' ? def.color(p) : def.color, lab = typeof def.label === 'function' ? def.label(p) : def.label;
      const r = 13 + 1.5 * Math.sin(p.t * 8);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(def.spin ? p.t * def.spin : 0);
      ctx.fillStyle = INK; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath();
      if (def.shape === 'hex') { for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } }
      else if (def.shape === 'square') { ctx.rect(-r * 0.92, -r * 0.92, r * 1.84, r * 1.84); }
      else if (def.shape === 'pod') { ctx.arc(0, 0, r * 1.05, 0, TAU); }
      else { ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (def.shape === 'square') {
        // weapon pickups: a solid block of the weapon's colour with an ink letter, and corner ticks
        ctx.fillStyle = col; ctx.fillRect(-r * 0.62, -r * 0.62, r * 1.24, r * 1.24);
        ctx.strokeStyle = col; ctx.lineWidth = 2; const q = r * 1.25;
        ctx.beginPath(); ctx.moveTo(-q, -q + 6); ctx.lineTo(-q, -q); ctx.lineTo(-q + 6, -q); ctx.moveTo(q, q - 6); ctx.lineTo(q, q); ctx.lineTo(q - 6, q); ctx.stroke();
      }
      if (def.cycle) {
        // a cycling capsule: a ring that runs down until the next letter
        const u = (p.t / def.cycle) % 1;
        ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, r * 1.75, 0, TAU); ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, r * 1.75, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - u)); ctx.stroke();
      }
      ctx.restore();
      if (def.shape === 'pod') { ctx.save(); ctx.translate(p.x, p.y); ctx.scale(0.62, 0.62); droneShape(1); ctx.fillStyle = '#f4f1e6'; ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-1, 0, 4, 0, TAU); ctx.fill(); ctx.restore(); }
      else txt(lab, p.x, p.y + 1, 'bold ' + def.labelSize + 'px ' + F_MONO, def.shape === 'square' ? INK : col, 'center');
    }
  }

  /* ---------------- the whole play field ---------------- */
  function drawWorld() {
    const k = G.ph, t = G.time;
    ctx.save(); applyWorld();
    if (k > 0.01) drawGrid(k);
    for (const e of enemies) if (e.T.field && !e.dying) drawAnchorField(e);
    for (const e of enemies) if (!e.T.fodder) drawEnemy(e, k);
    for (const e of enemies) if (e.T.fodder) drawEnemy(e, k);
    drawLasers(k);
    // gap-wall telegraphs: where the wall will be, and where the hole in it is
    for (const w of walls) {
      const u = clamp(w.t / w.tele, 0, 1), top = w.gapY - w.gapH / 2, bot = w.gapY + w.gapH / 2, dim = 1 - 0.6 * k;
      ctx.fillStyle = 'rgba(255,138,31,' + ((0.06 + 0.12 * u) * dim) + ')'; ctx.fillRect(w.x - 9, 0, 18, top); ctx.fillRect(w.x - 9, bot, 18, H - bot);
      ctx.globalAlpha = (0.35 + 0.6 * u) * dim; ctx.strokeStyle = '#ff8a1f'; ctx.lineWidth = 3; ctx.setLineDash([12, 9]); ctx.lineDashOffset = -t * 70;
      ctx.beginPath(); ctx.moveTo(w.x, 0); ctx.lineTo(w.x, top); ctx.moveTo(w.x, bot); ctx.lineTo(w.x, H); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#7dff6a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(w.x - 30, top); ctx.lineTo(w.x + 30, top); ctx.moveTo(w.x - 30, bot); ctx.lineTo(w.x + 30, bot); ctx.stroke();
      txt('GAP', w.x, w.gapY, 'bold 15px ' + F_MONO, '#7dff6a', 'center', INK, 4); ctx.globalAlpha = 1;
    }
    drawPickups();
    ctx.fillStyle = '#9ff7ff'; for (const s of shards) { ctx.fillRect(s.x - 2, s.y - 2, 4, 4); }
    ctx.globalAlpha = 1 - 0.8 * k;   // your flat shots fade with the plane
    drawShots();
    ctx.globalAlpha = 1; drawDrone(k);
    // enemy bullets are flat things: they dim to ghosts when we are above the plane
    ctx.globalAlpha = 1 - 0.68 * k;
    for (const b of bullets) { const s = gfx.bulletSpr[b.k]; ctx.drawImage(s.c, b.x - s.R, b.y - s.R); }
    ctx.globalAlpha = 1;
    // particles: ink blots, or sparks drawn as short streaks
    for (const p of parts) {
      const a = 1 - p.t / p.max;
      if (p.ink) {
        ctx.globalAlpha = Math.min(1, a * 1.6); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.sz * (0.45 + 0.55 * a), 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(236,232,220,0.45)'; ctx.lineWidth = 1; ctx.stroke();
      }
      else {
        ctx.globalAlpha = a; const lx = p.vx * 0.035, ly = p.vy * 0.035;
        if (Math.abs(lx) + Math.abs(ly) < 3) { ctx.fillStyle = p.col; ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz); }
        else { ctx.strokeStyle = p.col; ctx.lineWidth = p.sz * 0.8; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - lx, p.y - ly); ctx.stroke(); }
      }
    }
    ctx.globalAlpha = 1;
    drawBooms();
    drawZaps();
    // leaving the plane is an EVENT: a shock front tears outward from the ship, trailing speed lines
    if (G.phFx < 0.42) {
      const u = G.phFx / 0.42, eo = 1 - (1 - u) * (1 - u), R = 40 + 1300 * eo, fx = G.phFxX, fy = G.phFxY;
      // one bright front with a thin cyan/magenta fringe (the same split the ship shows mid-shift)
      ctx.globalAlpha = (1 - u) * (1 - u) * 0.85; ctx.lineWidth = 4; ctx.strokeStyle = '#39d5ff'; ctx.beginPath(); ctx.arc(fx, fy, R + 7, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#e23bff'; ctx.beginPath(); ctx.arc(fx, fy, Math.max(1, R - 7), 0, TAU); ctx.stroke();
      ctx.lineWidth = 7 * (1 - u) + 2; ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(fx, fy, R, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#dffaff'; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < 22; i++) {
        const a = i / 26 * TAU + hash(i) * 0.3, r0 = R * (0.3 + 0.35 * hash(i * 3.1)), r1 = r0 + R * 0.22;
        ctx.moveTo(fx + Math.cos(a) * r0, fy + Math.sin(a) * r0); ctx.lineTo(fx + Math.cos(a) * r1, fy + Math.sin(a) * r1);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    // above the plane: the ship's shadow on it, and the weapon reticle (orange once locked)
    if (P.alive && k > 0.02) {
      ctx.globalAlpha = 0.5 * k; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(P.x, P.y, 22, 9, 0, 0, TAU); ctx.fill();
      const lock = P.lockC, rx = P.retX, ry = P.retY, rr = lock ? lock.r + 9 : 15 + 2 * Math.sin(t * 10), col = lock ? '#ff7a1f' : '#7df4ff';
      const wfx = weaponDef().above.fx;   // the equipped weapon's own colour above the plane (none = the classic orange)
      ctx.globalAlpha = k; ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(rx, ry); ctx.stroke();
      ctx.strokeStyle = lock && wfx ? wfx : col; ctx.lineWidth = lock && wfx ? 3 : 2; ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(rx, ry); ctx.stroke();
      if (lock && wfx && !P.lockE.T.fodder) { ctx.strokeStyle = wfx; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(rx, ry, rr + 7, 0, TAU); ctx.stroke(); }
      ctx.save(); ctx.translate(rx, ry); ctx.rotate(lock ? t * 3 : t * 1.2);
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? col : INK; ctx.lineWidth = pass ? 2.6 : 6;
        for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; ctx.beginPath(); ctx.arc(0, 0, rr, a + 0.25, a + TAU / 4 - 0.25); ctx.stroke(); }
      }
      ctx.restore();
      ctx.fillStyle = col; ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
      if (lock && !P.lockE.T.fodder) {
        // LOCK (and a ramping weapon's DRILL xN under it) on an ink plate, so it reads over whatever system label is beside the reticle
        const lx = rx + rr + 10, ly = ry - rr * 0.4, rp0 = weaponDef().above.ramp;
        ctx.fillStyle = 'rgba(7,8,11,0.82)'; ctx.fillRect(lx - 4, ly - 10, rp0 ? 88 : 46, rp0 ? 38 : 20);
        txt('LOCK', lx, ly, 'bold 15px ' + F_MONO, '#ff7a1f', 'left', INK, 4);
        // a ramping weapon shows how far its drill has spun up
        const rp = weaponDef().above.ramp;
        if (rp) { const u = clamp(P.drill / rp.time, 0, 1); txt('DRILL \u00d7' + (rp.from + (rp.to - rp.from) * u).toFixed(1), lx, ly + 18, 'bold 14px ' + F_MONO, u >= 1 ? '#ffffff' : '#ffd23e', 'left', INK, 4); }
      }
      // the charged detonation's reach, while a charge is held above the plane
      if (P.charge >= ARSENAL.charge.min) {
        const B = ARSENAL.charge.blast, R = B.radius * (0.6 + 0.4 * P.charge);
        ctx.globalAlpha = k * (P.charge >= 1 ? 0.9 : 0.5); ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(P.x, P.y, R, 0, TAU); ctx.stroke();
        ctx.strokeStyle = P.charge >= 1 ? (Math.floor(t * 12) % 2 ? '#ffffff' : '#ffb030') : '#ffb030'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.lineDashOffset = t * 60;
        ctx.beginPath(); ctx.arc(P.x, P.y, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    }
    for (const p of popups) {
      ctx.globalAlpha = clamp(1.2 - p.t, 0, 1);
      if (p.head) {
        const sc = 1 + 0.9 * Math.max(0, 1 - p.t * 7);
        ctx.save(); ctx.translate(clamp(p.x, 120, W - 120), clamp(p.y, 70, H - 70)); ctx.rotate(p.rot); ctx.scale(sc, sc);
        txt(p.text, 0, 0, '34px ' + F_HEAD, '#ffffff', 'center', INK, 8); ctx.restore();
      }
      else txt(p.text, clamp(p.x, 190, W - 190), clamp(p.y, 64, H - 64), (p.big ? 'bold 20px ' : 'bold 14px ') + F_MONO, p.col, 'center', INK, 5);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // player ship — drawn in screen space, lifted off the plane
    if (P.alive && (P.inv <= 0 || Math.floor(t * 20) % 2 === 0)) {
      const s = w2s(P.x, P.y), sx = s[0], sy = s[1] - LIFT * k, sc = 1 + 0.3 * k;
      // cyan is the player's colour and nobody else's: engine wake, halo, outline
      if (k < 0.7) {
        const n = P.trail.length;
        for (let i = 0; i < n - 2; i += 2) {
          const q = w2s(P.trail[i], P.trail[i + 1]), a = i / n;
          ctx.globalAlpha = a * 0.4 * (1 - k); ctx.fillStyle = '#39d5ff'; ctx.beginPath(); ctx.ellipse(q[0] - 16, q[1], 9 * a + 3, 3.5 * a + 1.5, 0, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(gfx.glow, sx - 60, sy - 60);
      if (k > 0.03) {
        // the tether down to the plane
        ctx.globalAlpha = k * 0.8; ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(sx, sy + 8); ctx.lineTo(s[0], s[1]); ctx.stroke();
        ctx.strokeStyle = '#39d5ff'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -t * 50;
        ctx.beginPath(); ctx.moveTo(sx, sy + 8); ctx.lineTo(s[0], s[1]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      if (DRONE.level > 0 && DRONE.down <= 0) {
        // the drone's tether: a faint leash in the plane, a taut bright line while it holds your place below
        const dq = w2s(DRONE.x, DRONE.y), taut = DRONE.mode !== 'follow';
        ctx.globalAlpha = taut ? 0.95 : 0.3;
        if (taut) { ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(dq[0], dq[1]); ctx.stroke(); }
        ctx.strokeStyle = taut ? '#7df4ff' : '#39d5ff'; ctx.lineWidth = taut ? 2.2 : 1.2; ctx.setLineDash(taut ? [9, 5] : [3, 5]); ctx.lineDashOffset = t * 70;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(dq[0], dq[1]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      const tr = Math.sin(Math.PI * clamp(k, 0, 1));   // chromatic split while the ship is between dimensions
      if (tr > 0.06) { drawShipGhost(sx - 16 * tr, sy + 5 * tr, sc * 1.06, '#39d5ff', 0.75 * tr); drawShipGhost(sx + 16 * tr, sy - 5 * tr, sc * 1.06, '#e23bff', 0.75 * tr); }
      drawShip(sx, sy, sc, P.tilt, k);
      if (k < 0.5) {
        // the hitbox: a small blinking dot inside a ring (brighter while focusing)
        const fr = (inp.focus ? 11 : 9) + 1.5 * Math.sin(t * 9);
        ctx.strokeStyle = 'rgba(255,255,255,' + (inp.focus ? 0.95 : 0.55) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(s[0], s[1], fr, 0, TAU); ctx.stroke();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s[0], s[1], 6, 0, TAU); ctx.fill();
        ctx.fillStyle = Math.floor(t * 12) % 2 ? '#ff3050' : '#ffffff'; ctx.beginPath(); ctx.arc(s[0], s[1], 4, 0, TAU); ctx.fill();
      }
      // the drive gauge ring around the ship
      const ex = sx, ey = sy, en = G.energy, low = G.phased && en < 0.25;
      if (en < 0.999 || k > 0.02 || bullets.length > 20) {
        ctx.lineWidth = low ? 9 : 6; ctx.strokeStyle = 'rgba(7,8,11,0.7)'; ctx.beginPath(); ctx.arc(ex, ey, 36, 0, TAU); ctx.stroke();
        ctx.lineWidth = low ? 6 : 4;
        ctx.strokeStyle = G.anchored ? '#e23bff' : (low ? (Math.floor(t * 14) % 2 ? '#ff4a4a' : '#ffffff') : (en < 0.15 ? '#ff4a4a' : (G.phased ? '#ffffff' : (G.grazeT > 0 ? '#ffffff' : '#39d5ff'))));
        ctx.beginPath(); ctx.arc(ex, ey, 36, -Math.PI / 2, -Math.PI / 2 + TAU * en); ctx.stroke();
      }
      // charge shot: an orb building at the nose, lines pulled into it; white and spiked when full
      const nx = sx + 31 * sc, ch = P.charge;
      if (ch > 0.02) {
        const full = ch >= 1, r = 3 + 12 * ch + (full ? 2.5 * Math.sin(t * 30) : 0);
        ctx.strokeStyle = full ? '#ffffff' : '#7df4ff'; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + t * 4, r0 = r + 6 + 22 * (1 - ((t * 2.4 + i * 0.37) % 1)); ctx.moveTo(nx + Math.cos(a) * r0, sy + Math.sin(a) * r0); ctx.lineTo(nx + Math.cos(a) * (r0 + 9), sy + Math.sin(a) * (r0 + 9)); }
        ctx.stroke();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(nx, sy, r + 3, 0, TAU); ctx.fill();
        ctx.fillStyle = full ? (Math.floor(t * 14) % 2 ? '#ffffff' : '#7df4ff') : '#39d5ff'; ctx.beginPath(); ctx.arc(nx, sy, r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(nx, sy, r * 0.5, 0, TAU); ctx.fill();
        // the charge arc, outside the drive ring
        ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(7,8,11,0.75)'; ctx.beginPath(); ctx.arc(ex, ey, 45, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5); ctx.stroke();
        ctx.lineWidth = 4; ctx.strokeStyle = full ? (Math.floor(t * 14) % 2 ? '#ffffff' : '#ffb030') : '#ffb030'; ctx.beginPath(); ctx.arc(ex, ey, 45, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * ch); ctx.stroke();
      }
      if (P.chargeFx < 0.14) {
        // muzzle star on release
        const u = P.chargeFx / 0.14;
        ctx.globalAlpha = 1 - u; ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath();
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, rr = (i % 2 ? 12 : 34) * (0.6 + u); ctx.lineTo(nx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
      }
      // absorb bank: the shots you have swallowed orbit the ship until you drop back in
      if (G.bank > 0) {
        const cap = ARSENAL.absorb.cap, n = Math.min(12, Math.ceil(G.bank / cap * 12)), pu = G.bankFx > 0 ? 1.3 : 1;
        for (let i = 0; i < n; i++) {
          const a = i / n * TAU + t * 3.2, bx = sx + Math.cos(a) * 54 * pu, by = sy + Math.sin(a) * 26 * pu;
          ctx.fillStyle = INK; ctx.fillRect(bx - 5, by - 5, 10, 10); ctx.fillStyle = G.bank >= cap ? '#ffffff' : '#7df4ff'; ctx.fillRect(bx - 3, by - 3, 6, 6);
        }
        // (the number is left off while the ship is over a hull: system labels live there; the orbiting pips and the HUD bar remain)
        if (!P.lockC && !P.overHull) txt('BANK ' + G.bank, sx, sy + 58, 'bold 13px ' + F_MONO, G.bank >= cap ? '#ffffff' : '#7df4ff', 'center', INK, 4);
      }
      if (P.grace > 0 && !G.phased) { ctx.globalAlpha = Math.min(1, P.grace * 2.5); ctx.strokeStyle = '#7df4ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s[0], s[1], 26, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    }
  }

  /* ---------------- one frame ---------------- */
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (G.scene === 'title') { XD.drawTitle(); return; }
    if (G.scene === 'victory') { XD.drawVictory(); return; }
    const frozen = G.scene !== 'play';
    shx = frozen ? 0 : rnd(-1, 1) * G.shake; shy = frozen ? 0 : rnd(-1, 1) * G.shake;
    const k = G.ph;
    drawBackdrop(k);
    drawWorld();
    if (k > 0.01) {
      // above the plane: a cold tint and scanlines over everything flat
      ctx.fillStyle = 'rgba(120,220,255,' + (0.05 * k) + ')'; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.10 * k; ctx.fillStyle = '#000';
      for (let y = Math.floor(G.time * 40) % 4; y < H; y += 4) ctx.fillRect(0, y, W, 1);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(gfx.vig, 0, 0);
    if (G.anchored && P.alive) { ctx.strokeStyle = 'rgba(226,59,255,' + (0.35 + 0.2 * Math.sin(G.time * 10)) + ')'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, W - 10, H - 10); }
    // flashes never blot out the action: white ones are capped, a death is a red edge-flash
    if (G.flash > 0) {
      if (G.flashCol === '#ff5a5a') { ctx.globalAlpha = Math.min(0.8, G.flash * 1.1); ctx.drawImage(gfx.red, 0, 0); }
      else { ctx.globalAlpha = Math.min(0.38, G.flash); ctx.fillStyle = G.flashCol; ctx.fillRect(0, 0, W, H); }
      ctx.globalAlpha = 1;
    }
    // the drive is about to drop you
    if (G.phased && G.energy < 0.16 && !G.infiniteEnergy) { ctx.globalAlpha = (0.16 - G.energy) / 0.16 * 0.7; ctx.drawImage(gfx.red, 0, 0); ctx.globalAlpha = 1; }
    XD.drawHUD();
    XD.drawOverlays();
  }

  Object.assign(XD, { txt, drawBackdrop, drawBooms, shipShape, drawShip, drawWorld, render });
})();
