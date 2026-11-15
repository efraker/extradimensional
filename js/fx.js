/* ============================================================
   js/fx.js : screen shake, particles, explosions, popups, banners, scoring.
   Pure presentation + score bookkeeping; nothing here knows about enemy types.
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { G, DT, TAU, rnd, parts, booms, popups } = XD;

  function shake(a) { G.shake = Math.min(30, Math.max(G.shake, a)); }

  // n sparks flying out of (x,y)
  function sparks(x, y, n, col, spd, life) {
    for (let i = 0; i < n; i++) {
      if (parts.length > 700) return;
      const a = rnd(TAU), s = rnd(0.3, 1) * (spd || 220);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, max: rnd(0.2, 0.55) * (life || 1), sz: rnd(1.5, 3.5), col });
    }
  }

  // a manga blast of radius R; `internal` = orange (detonation inside a hull) instead of white
  function boom(x, y, R, internal) {
    if (booms.length > 90) booms.shift();
    booms.push({ x, y, t: 0, max: 0.32 + R * 0.0022, R, seed: rnd(100), internal: !!internal, ring: false, lines: R >= 60 });
    sparks(x, y, Math.min(18, 4 + R / 8 | 0), internal ? '#ffb030' : '#ffffff', 160 + R * 2);
    if (R >= 34) {
      // ink splats flung out of the blast
      const n = Math.min(12, 3 + R / 14 | 0);
      for (let i = 0; i < n; i++) {
        if (parts.length > 700) break;
        const a = rnd(TAU), s = rnd(0.35, 1) * (110 + R * 2.2);
        parts.push({ x: x + Math.cos(a) * R * 0.2, y: y + Math.sin(a) * R * 0.2, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          t: 0, max: rnd(0.45, 0.85), sz: rnd(3, 4 + R * 0.07), col: '#07080b', ink: true });
      }
    }
  }

  // an expanding ring
  function ringFx(x, y, R, col, dur) {
    if (booms.length > 90) booms.shift();
    booms.push({ x, y, t: 0, max: dur || 0.45, R, seed: 0, internal: false, ring: true, col: col || '#fff' });
  }

  // the small detonations of the 3-D weapon inside a hull. col = the weapon's detonation colour (default orange)
  function internalFx(x, y, R, minor, col) {
    if (booms.length > 90) booms.shift();
    booms.push({ x, y, t: 0, max: minor ? 0.2 : 0.3, R: R + rnd(8), seed: rnd(100), internal: true, ring: false, lines: !minor && R > 18, col: col || null });
    if (parts.length < 650) {
      for (let i = 0; i < 3; i++) {
        const a = rnd(TAU), s = rnd(60, 240);
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, max: rnd(0.15, 0.4), sz: rnd(1.5, 3), col: i ? (col || '#ffb030') : '#fff' });
      }
    }
  }

  // floating text. big = larger mono text; head = huge tilted sound-effect lettering ("KRAK!")
  function popup(x, y, text, col, big, head) {
    if (popups.length > 40) popups.shift();
    // fresh labels never land on top of each other: a new one steps up past any young neighbour
    if (!head) for (let pass = 0; pass < 4; pass++) {
      let hit = false;
      for (const p of popups) if (!p.head && p.t < 0.5 && Math.abs(p.x - x) < 130 && Math.abs(p.y - y) < 17) { y = p.y - 19; hit = true; }
      if (!hit) break;
    }
    popups.push({ x, y, text, col: col || '#fff', t: 0, big: !!big, head: !!head, rot: head ? rnd(-0.22, 0.22) : 0 });
  }

  // the big typed-out banner across the top third of the screen. warn = red hazard styling.
  // sub may be a function returning the subtitle: it is called every frame, so the text can follow the game
  // (which key charges, whether the ship is above the plane...). There is ONE banner slot: the newest wins.
  function banner(text, sub, dur, warn) { G.banner = { text, sub: sub || '', t: 0, dur: dur || 3.2, warn: !!warn }; return G.banner; }

  // score v times the current gut chain; optionally shows a popup (always when `tag` is given)
  function addScore(v, x, y, show, tag) {
    const m = Math.floor(G.mult);
    const s = Math.round(v * m / 10) * 10;
    G.score += s;
    if (show && (s >= 1000 || tag)) popup(x, y, (tag ? tag + ' ' : '') + '+' + s, tag ? '#ffd23e' : '#fff', !!tag);
  }

  /* ---------------- the gut chain (score multiplier) ----------------
     Tuned by XD.CHAIN (js/core.js, XD.setChainRules). chainAdd(v, true) is a GUT: it refreshes the
     full hold timer. chainAdd(v) is a plain kill: it only keeps the chain warm for a moment. */
  function chainAdd(v, gut) {
    const C = XD.CHAIN;
    G.mult = Math.min(C.max, G.mult + v);
    G.multT = gut ? C.hold : Math.max(G.multT, C.warm);
  }
  function chainTick(held) {
    const C = XD.CHAIN;
    if (G.mult > 1) G.mult = Math.max(1, G.mult - G.mult * C.bleed * DT);     // the constant leak
    if (held) { if (G.mult > 1) G.multT = Math.max(G.multT, 1); }               // a capital-ship duel holds the timer
    if (G.multT > 0) G.multT -= DT;
    else if (G.mult > 1) G.mult = Math.max(1, G.mult - (C.lapse + C.lapseFrac * G.mult) * DT);
  }
  function chainDeath() { G.mult = Math.max(1, Math.floor(G.mult * XD.CHAIN.deathKeep)); G.chain = 0; G.multT = Math.min(G.multT, 2); }

  /* ---------------- beams / arcs and delayed callbacks ---------------- */
  // a short-lived straight beam or arc from (x0,y0) to (x1,y1), width w
  function zap(x0, y0, x1, y1, w, col, dur) {
    if (XD.zaps.length > 40) XD.zaps.shift();
    XD.zaps.push({ x0, y0, x1, y1, w: w || 4, col: col || '#7df4ff', t: 0, max: dur || 0.22 });
  }
  // run f after `sec` seconds of game time (dropped when the stage is reset)
  function later(sec, f) { XD.laters.push({ t: sec, f }); }

  // a one-line lesson shown the first time something happens in a run. Returns true the first time.
  // Lessons never talk over the game: they wait in G.teachQ until the ship is in the plane, no tutorial is holding
  // the timeline and no other banner is up. still() (optional) is asked at that moment: if it says the lesson no
  // longer applies (e.g. the charge has already been let go) it is put back for next time.
  function teach(key, title, sub, dur, still) {
    if (G.taught[key]) return false;
    G.taught[key] = true;
    G.teachQ.push({ key, title, sub, dur: dur || 4.2, still: still || null });
    return true;
  }
  function teachTick() {
    const q = G.teachQ;
    if (!q.length || G.scene !== 'play') return;
    if (G.phased || G.hold || G.bossWarn > 0 || !XD.P.alive || (G.banner && G.banner.t < G.banner.dur - 0.25)) return;
    const l = q.shift();
    if (l.still && !l.still()) { G.taught[l.key] = false; return; }
    banner(l.title, l.sub, l.dur);
  }

  function updateFx() {
    const zs = XD.zaps, ls = XD.laters;
    for (let i = zs.length - 1; i >= 0; i--) { zs[i].t += DT; if (zs[i].t >= zs[i].max) zs.splice(i, 1); }
    for (let i = ls.length - 1; i >= 0; i--) { ls[i].t -= DT; if (ls[i].t <= 0) { const f = ls[i].f; ls.splice(i, 1); f(); } }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += DT; p.x += p.vx * DT; p.y += p.vy * DT; p.vx *= 0.96; p.vy *= 0.96;
      if (p.t >= p.max) { parts[i] = parts[parts.length - 1]; parts.pop(); }
    }
    for (let i = booms.length - 1; i >= 0; i--) { const b = booms[i]; b.t += DT; if (b.t >= b.max) booms.splice(i, 1); }
    for (let i = popups.length - 1; i >= 0; i--) { const p = popups[i]; p.t += DT; p.y -= 26 * DT; if (p.t > 1.2) popups.splice(i, 1); }
    if (G.shake > 0) G.shake = Math.max(0, G.shake - DT * 40);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - DT * 4);
    if (G.grazeT > 0) G.grazeT -= DT;
    if (G.readyT > 0) G.readyT -= DT;
    if (G.banner) { G.banner.t += DT; if (G.banner.t > G.banner.dur) G.banner = null; }
    teachTick();
  }

  Object.assign(XD, { shake, sparks, boom, ringFx, internalFx, popup, banner, addScore, updateFx,
    chainAdd, chainTick, chainDeath, zap, later, teach });
})();
