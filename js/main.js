/* ============================================================
   js/main.js : scene keys, the fixed-step main loop, and boot.
   Loaded LAST: by now every engine file and every data file has run, so the registries are full.
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { G, P, W, H, DT, F_MONO, ctx, lerp, canvas, pressed, saveHi, toggleMute, musicTick, updateFx, startRun, updatePlay, continueRun, buildBackdrop, initGfx, render } = XD;

  // back to the title screen, leaving no stale ship state behind (a quit while phased / charging)
  function toTitle() {
    G.scene = 'title'; G.phased = false; G.ph = 0; G.hitstop = 0; G.banner = null; G.boss = null; P.charge = 0;
    buildBackdrop(0);
  }

  // keys that act once per press, depending on the scene
  function handleMeta() {
    if (pressed.KeyM) toggleMute();
    if (pressed.KeyF) G.autofire = !G.autofire;
    switch (G.scene) {
      case 'title': if (pressed.Enter) startRun(); break;
      case 'play': if (pressed.KeyP || pressed.Escape) G.scene = 'pause'; break;
      case 'pause':
        if (pressed.KeyP || pressed.Escape || pressed.Enter) G.scene = 'play';
        else if (pressed.KeyQ) { saveHi(); toTitle(); }
        break;
      case 'gameover':
        if (pressed.Enter) { if (G.continues > 0) continueRun(); else toTitle(); }
        else if (pressed.Escape) toTitle();
        break;
      case 'victory': if (pressed.Enter && G.time - G.endTime > 1.5) toTitle(); break;
    }
    for (const k in pressed) delete pressed[k];
  }

  // one fixed simulation step (1/60 s)
  function step() {
    if (G.scene === 'pause') return;
    if (G.hitstop > 0) { G.hitstop--; return; }   // a few frozen frames on big hits
    G.time += DT;
    if (G.scene === 'play') { updatePlay(); if (G.scene === 'victory') G.endTime = G.time; }
    else if (G.scene === 'gameover' || G.scene === 'victory') updateFx();
  }

  let lastTs = 0, acc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    let dt = (ts - lastTs) / 1000; lastTs = ts;
    if (!(dt > 0)) dt = DT;
    if (dt > 0.1) dt = 0.1;
    G.fps = lerp(G.fps, 1 / dt, 0.08);
    try {
      handleMeta();
      acc += dt * G.timeScale;
      let n = 0; const maxN = Math.ceil(7 * Math.max(1, G.timeScale));
      while (acc >= DT && n < maxN) { step(); acc -= DT; n++; }
      if (acc > DT) acc = 0;
      musicTick();
      render();
    } catch (err) {
      XD.lastError = String(err && err.message || err);
      if (window.console) console.error(err && err.stack || err);
    }
    // Someone who double-clicks index.html has no console open: say so on the canvas when the game has hit an
    // exception, or (on the title screen) when a data file contains mistakes XD.validate / XD.warn reported.
    if (XD.lastError || (XD.warnings && G.scene === 'title')) {
      const msg = XD.lastError ? 'SCRIPT ERROR: ' + XD.lastError + '   (F12: console)'
        : XD.warnings + ' CONTENT WARNING' + (XD.warnings > 1 ? 'S' : '') + ' — PRESS F12 AND READ THE CONSOLE';
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(60,0,0,0.85)'; ctx.fillRect(0, H - 20, W, 20);
      ctx.font = 'bold 13px ' + F_MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffb4b4';
      ctx.fillText(msg.slice(0, 150), 10, H - 10);
    }
  }

  // scale the canvas to fit the window, keeping 16:9
  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    canvas.style.width = Math.floor(W * s) + 'px'; canvas.style.height = Math.floor(H * s) + 'px';
  }
  addEventListener('resize', fit); fit();

  XD.validate();   // report content mistakes by id (console.warn) before anything is built from the registries
  initGfx();
  G.endTime = 0;
  requestAnimationFrame(ts => { lastTs = ts; requestAnimationFrame(frame); });
})();
