/* ============================================================
   js/audio.js : WebAudio sound effects and the generative music.
   Everything is guarded: if audio is unavailable the game is silent, never broken.
   The music's key, tempo and lead style come from the current stage definition
   (stage.music = { key, bpm, busy }), so new stages need no changes here.
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { G } = XD;

  let AC = null, master = null, sfxGain = null, musGain = null, musFilter = null, noiseBuf = null;
  let muted = false, audioFailed = false;

  // Created lazily on the first key press / click (browsers require a user gesture).
  function audioInit() {
    if (audioFailed) return;
    try {
      if (AC) {
        if (AC.state === 'suspended') { const p = AC.resume(); if (p && p.catch) p.catch(() => {}); }
        return;
      }
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      AC = new C();
      master = AC.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(AC.destination);
      const comp = AC.createDynamicsCompressor(); comp.connect(master);
      sfxGain = AC.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(comp);
      musFilter = AC.createBiquadFilter(); musFilter.type = 'lowpass'; musFilter.frequency.value = 9000; musFilter.connect(comp);
      musGain = AC.createGain(); musGain.gain.value = 0.55; musGain.connect(musFilter);
      noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      try { if (AC && AC.close) { const p = AC.close(); if (p && p.catch) p.catch(() => {}); } } catch (_) { /* ignore */ }
      AC = null; audioFailed = true;
    }
  }
  function audioOK() { return AC && !muted && AC.state === 'running'; }

  // one enveloped oscillator sweep from f0 to f1
  function toneAt(type, f0, f1, dur, vol, t, dest) {
    try {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = type; o.frequency.setValueAtTime(Math.max(20, f0), t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || sfxGain); o.start(t); o.stop(t + dur + 0.03);
    } catch (e) { /* ignore */ }
  }
  // one burst of filtered noise, filter sweeping f0 -> f1
  function noiseAt(dur, vol, f0, f1, t, type, dest) {
    try {
      const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = AC.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || sfxGain); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
    } catch (e) { /* ignore */ }
  }

  /* ---------------- sound effects ----------------
     SFX[name](t) plays the effect at audio time t. SFXMIN is the minimum gap between repeats. */
  const sfxLast = {};
  const SFXMIN = { shot: 0.07, hit: 0.05, tink: 0.09, pop: 0.04, graze: 0.05, int: 0.06, shard: 0.04, boom: 0.08, deny: 0.25, charge: 0.2, low: 0.16, bump: 0.2,
    chargeup: 0.09, block: 0.05, bank: 0.04, dart: 0.08, beamshot: 0.1 };
  const SFX = {
    shot(t) { toneAt('square', 880, 440, 0.05, 0.035, t); },
    hit(t) { toneAt('square', 300, 160, 0.05, 0.06, t); },
    tink(t) { toneAt('triangle', 2300, 1900, 0.04, 0.07, t); },
    pop(t) { noiseAt(0.12, 0.22, 2400, 300, t); toneAt('square', 420, 90, 0.1, 0.08, t); },
    boom(t) { noiseAt(0.45, 0.5, 1400, 80, t); toneAt('sine', 130, 35, 0.4, 0.4, t); },
    bigboom(t) { noiseAt(1.3, 0.7, 2200, 50, t); toneAt('sine', 90, 24, 1.2, 0.6, t); toneAt('sawtooth', 60, 30, 0.8, 0.2, t + 0.1); },
    int(t) { toneAt('sine', 190, 60, 0.09, 0.28, t); noiseAt(0.07, 0.12, 900, 200, t); },
    intboom(t) { toneAt('sine', 240, 40, 0.5, 0.5, t); noiseAt(0.5, 0.4, 3000, 120, t); toneAt('square', 660, 110, 0.25, 0.1, t); },
    phasein(t) { toneAt('sawtooth', 110, 880, 0.28, 0.12, t); toneAt('sine', 220, 1760, 0.3, 0.14, t); noiseAt(0.3, 0.1, 300, 6000, t, 'bandpass'); },
    phaseout(t) { toneAt('sawtooth', 700, 90, 0.22, 0.11, t); toneAt('sine', 1200, 160, 0.24, 0.12, t); },
    shock(t) { noiseAt(0.35, 0.5, 5000, 200, t); toneAt('sine', 300, 50, 0.3, 0.4, t); },
    graze(t) { toneAt('sine', 1900, 2500, 0.035, 0.05, t); },
    shard(t) { toneAt('sine', 1300 + Math.random() * 500, 2200, 0.04, 0.035, t); },
    pickup(t) { toneAt('square', 660, 660, 0.06, 0.08, t); toneAt('square', 990, 990, 0.07, 0.08, t + 0.06); toneAt('square', 1320, 1320, 0.1, 0.08, t + 0.12); },
    deny(t) { toneAt('square', 140, 110, 0.14, 0.14, t); toneAt('square', 110, 90, 0.14, 0.14, t + 0.12); },
    die(t) { noiseAt(0.9, 0.7, 3000, 60, t); toneAt('sawtooth', 500, 30, 0.8, 0.35, t); },
    warn(t) { toneAt('square', 520, 520, 0.16, 0.12, t); toneAt('square', 390, 390, 0.2, 0.12, t + 0.18); },
    charge(t) { toneAt('sawtooth', 200, 1400, 0.9, 0.07, t); },
    laser(t) { noiseAt(0.7, 0.3, 6000, 1500, t, 'bandpass'); toneAt('sawtooth', 90, 70, 0.7, 0.2, t); },
    start(t) { toneAt('square', 330, 330, 0.1, 0.1, t); toneAt('square', 495, 495, 0.1, 0.1, t + 0.1); toneAt('square', 660, 660, 0.25, 0.1, t + 0.2); },
    lock(t) { toneAt('sine', 1500, 1800, 0.04, 0.06, t); },
    anchor(t) { toneAt('sawtooth', 80, 60, 0.6, 0.2, t); toneAt('square', 160, 120, 0.6, 0.08, t); },
    ready(t) { toneAt('sine', 880, 1320, 0.09, 0.07, t); },
    low(t) { toneAt('square', 1200, 1500, 0.05, 0.06, t); },
    bump(t) { toneAt('square', 160, 70, 0.09, 0.16, t); },
    // --- power-ups ---
    chargeup(t) { const c = XD.P.charge || 0; toneAt('sawtooth', 160 + 700 * c, 200 + 760 * c, 0.07, 0.035 + 0.03 * c, t); },
    chargefull(t) { toneAt('square', 1320, 1320, 0.05, 0.09, t); toneAt('square', 1760, 1760, 0.09, 0.09, t + 0.05); },
    lance(t) { noiseAt(0.35, 0.4, 7000, 600, t, 'bandpass'); toneAt('sawtooth', 1400, 110, 0.32, 0.22, t); toneAt('sine', 220, 50, 0.3, 0.35, t); },
    megaboom(t) { noiseAt(1.1, 0.75, 4000, 60, t); toneAt('sine', 150, 22, 1.0, 0.65, t); toneAt('square', 880, 55, 0.4, 0.14, t); toneAt('sawtooth', 70, 30, 0.9, 0.25, t + 0.12); },
    block(t) { toneAt('triangle', 1500, 900, 0.05, 0.09, t); },
    dronedown(t) { toneAt('square', 400, 90, 0.25, 0.12, t); },
    droneup(t) { toneAt('sine', 500, 1000, 0.12, 0.08, t); },
    recall(t) { toneAt('sawtooth', 300, 1500, 0.14, 0.09, t); noiseAt(0.14, 0.12, 800, 5000, t, 'bandpass'); },
    bank(t) { toneAt('sine', 700 + Math.min(40, XD.G.bank) * 28, 900 + Math.min(40, XD.G.bank) * 28, 0.035, 0.05, t); },
    burst(t) { noiseAt(0.3, 0.3, 500, 6000, t, 'bandpass'); toneAt('square', 330, 1320, 0.22, 0.09, t); },
    weapon(t) { toneAt('square', 440, 440, 0.06, 0.08, t); toneAt('square', 660, 660, 0.06, 0.08, t + 0.06); toneAt('square', 880, 880, 0.06, 0.08, t + 0.12); toneAt('square', 1320, 1320, 0.14, 0.08, t + 0.18); },
    dart(t) { toneAt('triangle', 1200, 700, 0.05, 0.035, t); },
    beamshot(t) { toneAt('sawtooth', 1500, 500, 0.08, 0.04, t); }
  };
  function sfx(n) {
    if (!audioOK()) return;
    const t = AC.currentTime;
    if (t - (sfxLast[n] || -9) < (SFXMIN[n] || 0.03)) return;
    sfxLast[n] = t;
    if (SFX[n]) SFX[n](t);
  }

  /* ---------------- music: a 16-step sequencer scheduled slightly ahead of the audio clock ---------------- */
  const mus = { step: 0, next: 0 };
  const SCALE = [0, 3, 5, 7, 10, 12, 15];
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);   // MIDI note -> Hz

  function musicTick() {
    if (!AC || AC.state !== 'running') return;
    try {
      const now = AC.currentTime;
      // the whole mix ducks under a low-pass while paused or above the plane
      musFilter.frequency.setTargetAtTime(G.scene === 'pause' ? 400 : (G.phased ? 650 : 9000), now, 0.08);
      if (muted) { mus.next = now; return; }
      if (mus.next < now - 0.3) mus.next = now + 0.05;
      const play = G.scene === 'play' || G.scene === 'pause';
      const boss = !!G.boss || G.bossWarn > 0;
      const m = XD.stageDef().music;
      const bpm = play ? (m.bpm + (boss ? 16 : 0)) : 80;
      const sd = 60 / bpm / 4;
      while (mus.next < now + 0.15) { musStep(mus.step++, mus.next, play, boss, sd, m); mus.next += sd; }
    } catch (e) { /* ignore */ }
  }
  function musStep(i, t, play, boss, sd, m) {
    if (G.scene === 'pause') return;
    const s = i % 16, bar = Math.floor(i / 16) % 8;
    const root = play ? m.key + (boss ? 2 : 0) : 36;
    const prog = [0, 0, -4, -2, 0, 0, 3, -2][bar];
    if (!play || G.scene === 'gameover') {
      // menus: a slow drone and a sparse arpeggio
      if (s === 0) {
        toneAt('sawtooth', mf(root + prog), mf(root + prog), sd * 14, 0.09, t, musGain);
        toneAt('sine', mf(root + prog + 7), mf(root + prog + 7), sd * 14, 0.07, t, musGain);
      }
      if (s % 4 === 2) toneAt('triangle', mf(root + 24 + SCALE[(i >> 2) % 5]), mf(root + 24 + SCALE[(i >> 2) % 5]), sd * 3, 0.035, t, musGain);
      return;
    }
    const bp = boss ? [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1] : [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
    if (bp[s]) toneAt('sawtooth', mf(root + prog + (s === 13 ? 12 : 0)), mf(root + prog), sd * 1.6, 0.13, t, musGain);   // bass
    if (s % 4 === 0) toneAt('sine', 150, 40, 0.13, 0.32, t, musGain);                                                   // kick
    if (s % 8 === 4) noiseAt(0.11, 0.14, 3500, 900, t, 'bandpass', musGain);                                            // snare
    if (s % 2 === 1) noiseAt(0.03, 0.05, 9000, 7000, t, 'highpass', musGain);                                           // hat
    if (m.busy || boss) {
      if (s % 2 === 0) { const n = root + 24 + prog + SCALE[(i * 3 + bar * 2) % 7]; toneAt('square', mf(n), mf(n), sd * 1.2, 0.028, t, musGain); }
    } else if (s % 4 === 2) {
      const n = root + 24 + prog + SCALE[(i + bar) % 5]; toneAt('triangle', mf(n), mf(n), sd * 2.5, 0.05, t, musGain);
    }
    if (G.phased && s % 4 === 0) { toneAt('sine', mf(root + 36), mf(root + 36.3), sd * 4, 0.05, t, sfxGain); }
  }

  function toggleMute() { muted = !muted; try { if (master) master.gain.value = muted ? 0 : 0.55; } catch (e) { /* ignore */ } }
  const isMuted = () => muted;

  Object.assign(XD, { audioInit, sfx, musicTick, toggleMute, isMuted });
})();
