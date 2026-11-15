/* ============================================================
   js/sprites.js : pre-rendered art.
   - procedural ink sprites for every enemy type (exterior, cutaway, far-off silhouette)
   - optional IMAGE art for a type (def.art), built when its asset loads; the procedural
     sprite stays in place until then and forever if the image is missing
   - bullet sprites, the stage backdrop, vignette / flash overlays
   XD.SPR[typeId] = { ext, w, h,  cut, cw, ch,  sil, sw, sh,  blend }
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { W, H, TAU, INK, PAPER, BONE, clamp, lerp, rnd, hash, TYPES, SCREENS, BK, whenAsset, assetImage, loadAssets } = XD;

  const SPR = {};        // sprite set currently used to draw each enemy type
  const SPR_PROC = {};   // the procedural set (always built; the fallback for image art)
  // shared pre-rendered layers, filled by initGfx / buildBackdrop
  const gfx = { bg: null, vig: null, red: null, glow: null, bulletSpr: [], stars: [], armada: [], backdropImage: null };

  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }
  // trace a hull polygon (unit coordinates scaled by the half-extents rw, rh)
  function polyPath(g, poly, rw, rh) {
    g.beginPath();
    for (let i = 0; i < poly.length; i++) { const x = poly[i][0] * rw, y = poly[i][1] * rh; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath();
  }

  /* ---------------- procedural enemy sprite ---------------- */
  function buildSprite(key) {
    const T = TYPES[key], rw = T.rw, rh = T.rh, big = rh > 20, pad = big ? (T.boss ? 46 : 30) : 10;
    const w = Math.ceil(rw * 2 + pad * 2), h = Math.ceil(rh * 2 + pad * 2);

    // ---- exterior: spiked armour plate ----
    const ext = mk(w, h);
    let g = ext.getContext('2d');
    g.translate(w / 2, h / 2); g.lineJoin = 'round';
    if (T.spikes) {
      // bone spikes along every edge of the hull polygon
      const p = T.poly; let k = 0;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        const ax = a[0] * rw, ay = a[1] * rh, bx = b[0] * rw, by = b[1] * rh;
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const n = Math.max(1, Math.round(len / (big ? (T.boss ? 40 : 28) : 16)));
        let nx = (by - ay) / len, ny = -(bx - ax) / len;
        if (nx * (ax + bx) + ny * (ay + by) < 0) { nx = -nx; ny = -ny; }   // outward normal
        const tx = (bx - ax) / len, ty = (by - ay) / len;
        for (let j = 0; j < n; j++) {
          k++;
          const u = (j + 0.5) / n, cx = lerp(ax, bx, u), cy = lerp(ay, by, u);
          const hg = (big ? (T.boss ? 17 : 11) : 5) * (0.55 + hash(k * 7.3 + rw) * 1.4), hw = hg * 0.36, lean = (hash(k * 3.1) - 0.25) * hg * 0.6;
          g.beginPath(); g.moveTo(cx - tx * hw, cy - ty * hw); g.lineTo(cx + nx * hg + lean, cy + ny * hg); g.lineTo(cx + tx * hw, cy + ty * hw); g.closePath();
          g.fillStyle = '#4b4d55'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = BONE; g.stroke();
        }
      }
    }
    // hull: heavy ink outline, bone-to-shadow gradient
    polyPath(g, T.poly, rw, rh); g.lineWidth = big ? 7 : 5; g.strokeStyle = INK; g.stroke();
    const gr = g.createLinearGradient(0, -rh, 0, rh);
    gr.addColorStop(0, '#dcd8ca'); gr.addColorStop(0.42, '#96948d'); gr.addColorStop(1, '#2e2f36');
    g.fillStyle = gr; g.fill();
    g.save(); polyPath(g, T.poly, rw, rh); g.clip();
    // hatching in the lower half, highlights along the top
    g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 1.2; g.beginPath();
    for (let x = -rw - rh; x < rw + rh * 2; x += big ? 5 : 4) { g.moveTo(x, rh * 0.12); g.lineTo(x - rh * 0.9, rh * 1.05); }
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.beginPath();
    for (let x = -rw - rh; x < rw + rh; x += 9) { g.moveTo(x, -rh); g.lineTo(x + rh * 0.5, -rh * 0.5); }
    g.stroke();
    if (big) {
      // plate seams and rivets
      g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 1.6; g.beginPath();
      const np = Math.max(3, Math.round(rw / 24));
      for (let i = 1; i < np; i++) { const x = -rw + i * (2 * rw / np) + (hash(i + rw) - 0.5) * 8; g.moveTo(x, -rh); g.lineTo(x + (hash(i * 2.2) - 0.5) * 16, rh); }
      g.moveTo(-rw, -rh * 0.2); g.lineTo(rw, -rh * 0.3); g.moveTo(-rw, rh * 0.4); g.lineTo(rw, rh * 0.3); g.stroke();
      g.fillStyle = 'rgba(7,8,11,0.75)';
      for (let i = 0; i < rw / 2.5; i++) { g.fillRect((hash(i * 1.7 + rh) * 2 - 1) * rw, (hash(i * 4.1 + rw) * 2 - 1) * rh, 2, 2); }
    }
    g.restore();
    polyPath(g, T.poly, rw, rh); g.lineWidth = big ? 2.4 : 1.8; g.strokeStyle = BONE; g.stroke();
    // gun turrets
    if (T.guns) for (const gp of T.guns) {
      g.save(); g.translate(gp[0], gp[1]);
      const L = T.boss ? 34 : 24;
      g.fillStyle = '#14161b'; g.strokeStyle = BONE; g.lineWidth = 1.5; g.fillRect(-L, -3.5, L, 7); g.strokeRect(-L, -3.5, L, 7);
      g.beginPath(); g.arc(0, 0, T.boss ? 11 : 8, 0, TAU); g.fill(); g.stroke(); g.restore();
    }
    // the glowing eye at the prow (bosses also get a socket and teeth) and the engine glow at the stern
    const ex = T.boss ? -rw * 0.74 : (big ? -rw * 0.6 : -rw * 0.3), ey = T.boss ? -rh * 0.16 : 0;
    const er = T.boss ? rh * 0.12 : (big ? Math.max(4, rh * 0.13) : 2.6);
    if (T.boss) {
      g.fillStyle = INK; g.beginPath(); g.ellipse(ex, ey, er * 1.5, er * 1.1, -0.3, 0, TAU); g.fill(); g.strokeStyle = BONE; g.lineWidth = 1.5; g.stroke();
      g.strokeStyle = BONE; g.lineWidth = 2; g.beginPath();
      let zx = -rw * 0.93; g.moveTo(zx, rh * 0.1);
      for (let i = 0; i < 9; i++) { zx += rw * 0.04; g.lineTo(zx, rh * (0.1 + (i % 2 ? 0.02 : 0.13)) + i * rh * 0.012); }
      g.stroke();
    }
    const eg = g.createRadialGradient(ex, ey, 0, ex, ey, er * 2.4);
    eg.addColorStop(0, '#fff'); eg.addColorStop(0.3, T.glow); eg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = eg; g.beginPath(); g.arc(ex, ey, er * 2.4, 0, TAU); g.fill();
    g.fillStyle = T.glow; g.globalAlpha = 0.85; g.fillRect(rw - 3, -rh * 0.28, big ? 7 : 4, rh * 0.56); g.globalAlpha = 1;
    if (T.field) {
      // anchors wear their field emitter rings
      g.strokeStyle = T.glow; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, rw * 0.52, 0, TAU); g.stroke();
      g.strokeStyle = BONE; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, rw * 0.3, 0, TAU); g.stroke();
    }

    // ---- cutaway: the hull opened up on paper, decks and crew inked in ----
    const cut = mk(w, h);
    g = cut.getContext('2d'); g.translate(w / 2, h / 2); g.lineJoin = 'round';
    if (T.noInt) { g.drawImage(ext, -w / 2, -h / 2); }   // phase-locked hulls never open
    else {
      polyPath(g, T.poly, rw, rh);
      g.lineWidth = big ? 9 : 6; g.strokeStyle = '#f6f3e8'; g.stroke();
      g.lineWidth = big ? 5 : 3.2; g.strokeStyle = INK; g.stroke();
      g.fillStyle = PAPER; g.fill();
      if (big) {
        g.save(); polyPath(g, T.poly, rw, rh); g.clip();
        const dk = clamp(rh / 2.6, 14, 30);   // deck height
        let row = 0;
        for (let y = -rh + dk * 0.8; y < rh + dk; y += dk, row++) {
          let x = -rw, ci = 0;
          while (x < rw) {
            // one compartment: dark hold, hatched store, crew, or bunks — chosen by hash so the layout is stable
            const cw = 14 + hash(row * 13.7 + ci * 5.3 + rw) * (T.boss ? 58 : 34), hh = hash(row * 3.3 + ci * 9.1 + rh);
            if (hh < 0.14) { g.fillStyle = '#1c1d22'; g.fillRect(x, y - dk, cw, dk); }
            else if (hh < 0.32) {
              g.strokeStyle = 'rgba(7,8,11,0.5)'; g.lineWidth = 1; g.beginPath();
              for (let q = dk; q < cw; q += 4) { g.moveTo(x + q, y - dk); g.lineTo(x + q - dk, y); }
              g.stroke();
            }
            else if (hh > 0.62) {
              const nf = 1 + Math.floor(hash(ci + row * 1.9) * 3); g.fillStyle = INK;
              for (let f = 0; f < nf; f++) {
                const fx = x + 4 + (cw - 8) * hash(f * 7.7 + ci * 1.3 + row);
                g.fillRect(fx - 1, y - 9, 2, 8); g.beginPath(); g.arc(fx, y - 10.5, 1.9, 0, TAU); g.fill(); g.fillRect(fx - 3, y - 7, 6, 1.2);
              }
            }
            else if (hh > 0.46) {
              g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(x + 3, y - dk * 0.62, cw - 7, dk * 0.62 - 1.5);
              g.beginPath(); g.moveTo(x + 3, y - dk * 0.3); g.lineTo(x + cw - 4, y - dk * 0.3); g.stroke();
            }
            g.fillStyle = INK; g.fillRect(x + cw - 1, y - dk, 2, dk);   // bulkhead
            x += cw; ci++;
          }
          g.fillStyle = INK; g.fillRect(-rw, y - 1.2, rw * 2, 2.4);       // deck plate
        }
        polyPath(g, T.poly, rw, rh); g.lineWidth = T.boss ? 18 : 11; g.strokeStyle = INK; g.stroke();
        g.restore();
      }
    }

    // ---- flat one-colour silhouette for the far-off armada (no eyes, no outline: scenery must never read as a threat) ----
    const sil = mk(w, h);
    {
      const q = sil.getContext('2d');
      q.drawImage(ext, 0, 0); q.globalCompositeOperation = 'source-in'; q.fillStyle = '#8ea2c8'; q.fillRect(0, 0, w, h);
    }
    SPR_PROC[key] = { ext, w, h, cut, cw: w, ch: h, sil, sw: w, sh: h, blend: null };
    SPR[key] = SPR_PROC[key];
  }

  /* ---------------- image art (def.art) ----------------
     Two shapes are supported (see MODDING.md):
       { image, size, silhouette, interior?, eye?, filter?, cutTint?, blend? }   one image + outline polygons
       { exterior?, cutaway?, size?, blend? }                                    separate ready-made images
     Either way the procedural sprite is the fallback until (and unless) the images load. */

  // one image + outlines: the exterior is the image clipped to `silhouette` with procedural armour plate painted
  // over the `interior` polygon; the cutaway is the same image tinted to paper, so the art itself is the cross-section.
  function buildOutlineArt(key) {
    const T = TYPES[key], art = T.art, img = assetImage(art.image), proc = SPR_PROC[key];
    const w = art.size[0], h = art.size[1], SIL = art.silhouette, INT = art.interior;
    const path = (g, pts) => { g.beginPath(); pts.forEach((p, i) => { if (i) g.lineTo(p[0] * w, p[1] * h); else g.moveTo(p[0] * w, p[1] * h); }); g.closePath(); };
    const make = armour => {
      const c = mk(w, h), g = c.getContext('2d');
      g.save();
      if (SIL) { path(g, SIL); g.clip(); }
      // e.g. crush a JPEG's dark greys to true black so the 'lighten' blend leaves no halo
      if (art.filter) { try { g.filter = art.filter; } catch (e) { /* unsupported: draw unfiltered */ } }
      g.drawImage(img, 0, 0, w, h);
      if (art.filter) { try { g.filter = 'none'; } catch (e) { /* ignore */ } }
      if (armour) {
        if (INT) {
          path(g, INT);
          const gr = g.createLinearGradient(0, h * 0.13, 0, h * 0.8);
          gr.addColorStop(0, '#cfcbbd'); gr.addColorStop(0.45, '#84827c'); gr.addColorStop(1, '#26272d'); g.fillStyle = gr;
          g.shadowColor = 'rgba(0,0,0,0.95)'; g.shadowBlur = 18; g.fill(); g.shadowBlur = 0; g.shadowColor = 'transparent';
          g.save(); path(g, INT); g.clip();
          // overlapping scale plates
          g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 1.6;
          for (let y = h * 0.12, r = 0; y < h * 0.84; y += 17, r++) {
            g.beginPath();
            for (let x = w * 0.17 + (r % 2 ? 15 : 0); x < w * 0.97; x += 30) { g.moveTo(x + 14, y); g.arc(x, y, 14, 0, Math.PI); }
            g.stroke();
          }
          // shadow hatching below, highlights above, rivets
          g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1; g.beginPath();
          for (let x = 0; x < w + h; x += 6) { g.moveTo(x, h * 0.56); g.lineTo(x - h * 0.3, h * 0.86); }
          g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.3)'; g.beginPath();
          for (let x = 0; x < w; x += 11) { g.moveTo(x, h * 0.1); g.lineTo(x + 40, h * 0.24); }
          g.stroke();
          g.fillStyle = 'rgba(7,8,11,0.7)';
          for (let i = 0; i < 160; i++) g.fillRect(w * (0.2 + 0.74 * hash(i * 1.31)), h * (0.15 + 0.63 * hash(i * 2.77)), 2, 2);
          g.restore();
          path(g, INT); g.lineJoin = 'round'; g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
        }
        if (art.eye) {
          const E = art.eye, ex = w * E.x, ey = h * E.y, er = E.r || 34;
          const eg = g.createRadialGradient(ex, ey, 0, ex, ey, er);
          eg.addColorStop(0, '#fff'); eg.addColorStop(0.25, E.color || T.glow); eg.addColorStop(1, E.fade || 'rgba(0,0,0,0)');
          g.fillStyle = eg; g.beginPath(); g.arc(ex, ey, er, 0, TAU); g.fill();
        }
      }
      else {
        // cutaway: tint the art to paper
        g.globalCompositeOperation = 'multiply'; g.fillStyle = art.cutTint || '#f4eddb'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
      }
      g.restore();
      return c;
    };
    SPR[key] = { ext: make(true), w, h, cut: make(false), cw: w, ch: h, sil: proc.sil, sw: proc.sw, sh: proc.sh, blend: art.blend || null };
  }

  // separate images: each layer that has loaded replaces the procedural one, drawn at art.size (default: the hull box)
  function buildLayerArt(key) {
    const T = TYPES[key], art = T.art, proc = SPR_PROC[key];
    const w = art.size ? art.size[0] : T.rw * 2, h = art.size ? art.size[1] : T.rh * 2;
    const layer = name => {
      const img = assetImage(name);
      if (!img) return null;
      const c = mk(w, h); c.getContext('2d').drawImage(img, 0, 0, w, h);
      return c;
    };
    const ext = layer(art.exterior), cut = layer(art.cutaway);
    SPR[key] = {
      ext: ext || proc.ext, w: ext ? w : proc.w, h: ext ? h : proc.h,
      cut: cut || proc.cut, cw: cut ? w : proc.cw, ch: cut ? h : proc.ch,
      sil: proc.sil, sw: proc.sw, sh: proc.sh, blend: (ext || cut) ? (art.blend || null) : null
    };
  }

  // hook a type's art up to the asset loader
  function watchArt(key) {
    const art = TYPES[key].art;
    if (!art) return;
    if (art.image) whenAsset(art.image, () => buildOutlineArt(key));
    else {
      if (art.exterior) whenAsset(art.exterior, () => buildLayerArt(key));
      if (art.cutaway) whenAsset(art.cutaway, () => buildLayerArt(key));
    }
  }

  /* ---------------- bullet sprites (one per kind in XD.BK) ---------------- */
  function buildBulletSprites() {
    for (const k of BK) {
      const R = k.r + 6, c = mk(R * 2, R * 2), g = c.getContext('2d');
      const gr = g.createRadialGradient(R, R, 0, R, R, R);
      gr.addColorStop(0, '#fff'); gr.addColorStop(k.r * 0.45 / R, '#fff'); gr.addColorStop(k.r * 0.6 / R, k.c); gr.addColorStop(k.r / R, k.c);
      gr.addColorStop(Math.min(0.99, k.r / R + 0.01), k.c + '55'); gr.addColorStop(1, k.c + '00');
      g.fillStyle = gr; g.fillRect(0, 0, R * 2, R * 2);
      g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(R, R, k.r + 0.5, 0, TAU); g.stroke();
      gfx.bulletSpr.push({ c, R });
    }
  }

  /* ---------------- backdrop ----------------
     n = stage number (1-based), or 0 for the title screen. Hue, armada size and optional backdrop
     image all come from the stage definition. */
  function buildBackdrop(n) {
    const S = n ? XD.stageDef(n) : SCREENS.title;
    gfx.bg = gfx.bg || mk(W, H);
    gfx.backdropImage = n ? (S.backdrop || null) : null;
    const g = gfx.bg.getContext('2d'), hue = S.hue;
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'hsl(' + hue + ',45%,9%)'); gr.addColorStop(1, 'hsl(' + (hue + 20) + ',40%,4.5%)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // nebula blotches
    for (let i = 0; i < 8; i++) {
      const x = rnd(W), y = rnd(H), r = rnd(160, 430), rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'hsla(' + (hue + rnd(-25, 25)) + ',60%,22%,0.2)'); rg.addColorStop(1, 'hsla(0,0%,0%,0)');
      g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    // the armada on the horizon: small flat silhouettes, mostly kept to the top and bottom bands, out of the play lane
    const armada = gfx.armada; armada.length = 0;
    const cnt = S.armadaCount, kinds = (S.armada || SCREENS.armada).filter(k => TYPES[k]);
    if (!kinds.length) return;
    for (let i = 0; i < cnt; i++) {
      const mid = i % 4 === 3, s = mid ? rnd(0.05, 0.09) : rnd(0.08, 0.2);
      const y = mid ? rnd(170, 550) : (i % 2 ? rnd(8, 120) : rnd(590, 700));
      armada.push({ x: rnd(W + 500), y, s, k: kinds[i % kinds.length], sp: 5 + s * 60 });
    }
    armada.sort((a, b) => a.s - b.s);
  }

  /* ---------------- boot: build everything, then start loading images ---------------- */
  function initGfx() {
    for (const k in TYPES) buildSprite(k);
    buildBulletSprites();
    for (let i = 0; i < 170; i++) {
      const L = i < 95 ? 0 : (i < 145 ? 1 : 2);   // three parallax layers
      gfx.stars.push({ x: rnd(W), y: rnd(H), L, sp: [12, 38, 120][L], sz: [1, 1.6, 2][L], a: rnd(0.3, 1) });
    }
    // red edge flash (death, drive about to fail)
    gfx.red = mk(W, H);
    {
      const q = gfx.red.getContext('2d'), rg = q.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.98);
      rg.addColorStop(0, 'rgba(255,40,50,0)'); rg.addColorStop(0.6, 'rgba(255,40,50,0.45)'); rg.addColorStop(1, 'rgba(255,40,50,0.95)');
      q.fillStyle = rg; q.fillRect(0, 0, W, H);
    }
    // cyan halo under the player ship
    gfx.glow = mk(120, 120);
    {
      const q = gfx.glow.getContext('2d'), rg = q.createRadialGradient(60, 60, 4, 60, 60, 60);
      rg.addColorStop(0, 'rgba(57,213,255,0.55)'); rg.addColorStop(0.45, 'rgba(57,213,255,0.18)'); rg.addColorStop(1, 'rgba(57,213,255,0)');
      q.fillStyle = rg; q.fillRect(0, 0, 120, 120);
    }
    // vignette
    gfx.vig = mk(W, H);
    {
      const g = gfx.vig.getContext('2d'), vg = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.62)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }
    buildBackdrop(0);
    for (const k in TYPES) watchArt(k);
    loadAssets();
  }

  Object.assign(XD, { SPR, SPR_PROC, gfx, mk, polyPath, buildSprite, buildBackdrop, initGfx });
})();
