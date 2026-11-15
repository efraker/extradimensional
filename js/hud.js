/* ============================================================
   js/hud.js : everything drawn in screen space on top of the world —
   the HUD, banners, the tutorial prompt, the title screen, pause / game-over
   panels and the victory screen.
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { G, P, DRONE, W, H, MAX_GUN, INK, BONE, F_HEAD, F_MONO, clamp, hash, ctx, enemies, parts, SCREENS, STAGES, ARSENAL, CHAIN, weaponDef, systemOf, assetImage,
    bossHpFrac, bossStageCount, SPR, gfx, txt, drawBackdrop, drawBooms, shipShape, drawShip } = XD;

  function drawHUD() {
    const t = G.time;
    // score, gut chain, hi-score, stage
    txt(String(Math.floor(G.score)).padStart(8, '0'), 24, 30, 'bold 26px ' + F_MONO, '#fff', 'left', INK, 5);
    const m = Math.floor(G.mult);
    txt('×' + m, 24, 62, 'bold ' + (20 + Math.min(10, m / 2)) + 'px ' + F_HEAD, m >= 16 ? '#ffd23e' : (m > 1 ? '#ffb030' : '#9aa0ad'), 'left', INK, 5);
    if (m > 1) {
      const cx0 = m >= 10 ? 100 : 84;
      ctx.fillStyle = INK; ctx.fillRect(cx0, 56, 104, 10); ctx.fillStyle = G.multT > 0 ? '#ffb030' : '#ff4a4a'; ctx.fillRect(cx0 + 2, 58, 100 * clamp(G.multT / CHAIN.hold, 0, 1), 6);
      txt(G.multT > 0 ? 'GUT CHAIN' : 'CHAIN FALLING', cx0 + 110, 61, 'bold 13px ' + F_MONO, '#ffb030', 'left', INK, 3);
    }
    txt('HI ' + String(Math.max(G.hi, Math.floor(G.score))).padStart(8, '0'), W - 24, 26, 'bold 16px ' + F_MONO, '#9aa0ad', 'right', INK, 4);
    txt('STAGE ' + G.stage + (XD.isMuted() ? '   MUTED' : '') + (G.autofire ? '' : '   MANUAL FIRE'), W - 24, 50, 'bold 14px ' + F_MONO, '#9aa0ad', 'right', INK, 3);
    // lives and gun level (ghosted while the ship is flying in that corner, so nothing hides under them)
    if (P.alive && P.x < 230 && P.y > H - 120) ctx.globalAlpha = 0.3;
    for (let i = 0; i < G.lives; i++) {
      ctx.save(); ctx.translate(34 + i * 34, H - 30); ctx.scale(0.6, 0.6); shipShape(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = '#f4f1e6'; ctx.fill(); ctx.restore();
    }
    txt('GUN', 24, H - 60, 'bold 13px ' + F_MONO, '#9aa0ad', 'left', INK, 3);
    for (let i = 0; i < MAX_GUN; i++) { ctx.fillStyle = INK; ctx.fillRect(58 + i * 16, H - 66, 13, 12); ctx.fillStyle = i < P.gun ? '#7dff6a' : '#30343c'; ctx.fillRect(60 + i * 16, H - 64, 9, 8); }
    ctx.globalAlpha = 1;

    // power-up panel: two rows inside the bottom strip, right of the drive bar (the play field ends above it).
    //   upper row:  CHARGE bar · BANK bar          lower row:  drone shell · weapon badge + name
    // The charge and the bank are also drawn on the ship itself (js/render.js), which is where the eye is.
    {
      const rx = W - 24, wpn = weaponDef(), lab = 'bold 13px ' + F_MONO, dim = '#9aa0ad';
      if (P.alive && P.x > W - 440 && P.y > H - 120) ctx.globalAlpha = 0.3;   // ghosted while the ship is flying in that corner
      const bar = (x, y, frac, col, w) => { ctx.fillStyle = INK; ctx.fillRect(x - w - 2, y - 7, w + 4, 14); ctx.fillStyle = '#30343c'; ctx.fillRect(x - w, y - 5, w, 10); ctx.fillStyle = col; ctx.fillRect(x - w, y - 5, w * clamp(frac, 0, 1), 10); };
      const width = (s, font) => { ctx.font = font; return ctx.measureText(s).width; };
      // lower row: weapon badge + name, then the drone to its left
      let y = H - 22, x = rx;
      const nf = 'bold 15px ' + F_MONO;
      txt(wpn.name, x, y, nf, wpn.color, 'right', INK, 4);
      x -= width(wpn.name, nf) + 8;
      ctx.fillStyle = INK; ctx.fillRect(x - 22, y - 11, 22, 22); ctx.fillStyle = wpn.color; ctx.fillRect(x - 20, y - 9, 18, 18);
      txt(wpn.letter, x - 11, y + 1, 'bold 14px ' + F_MONO, INK, 'center');
      x -= 22 + 20;
      if (DRONE.level > 0) {
        const c = XD.droneCfg(), down = DRONE.down > 0, name = 'DRONE' + (DRONE.level > 1 ? ' MK' + DRONE.level : '');
        if (down) txt(name + '  OFFLINE ' + DRONE.down.toFixed(1) + 's', x, y, lab, '#ff8a8a', 'right', INK, 3);
        else {
          for (let i = 0; i < c.hp; i++) { ctx.fillStyle = INK; ctx.fillRect(x - (c.hp - i) * 8, y - 7, 7, 14); ctx.fillStyle = i < DRONE.hp ? '#7df4ff' : '#30343c'; ctx.fillRect(x - (c.hp - i) * 8 + 1, y - 5, 5, 10); }
          txt(DRONE.mode === 'anchor' ? 'DECOY' : name, x - c.hp * 8 - 8, y, lab, DRONE.mode === 'anchor' ? '#7df4ff' : dim, 'right', INK, 3);
        }
      }
      else txt('NO DRONE', x, y, lab, '#5c616d', 'right', INK, 3);
      // upper row: absorb bank, then the charge to its left
      y = H - 44; x = rx;
      const cap = ARSENAL.absorb.cap, bl = 'BANK ' + G.bank;
      bar(x, y, G.bank / cap, G.bank >= cap ? '#ffffff' : '#7df4ff', 70);
      txt(bl, x - 78, y, lab, G.bank > 0 ? '#7df4ff' : dim, 'right', INK, 3);
      x -= 78 + width('BANK 00', lab) + 18;
      const full = P.charge >= 1;
      bar(x, y, P.charge, full ? (Math.floor(t * 14) % 2 ? '#ffffff' : '#ffb030') : (P.charge >= ARSENAL.charge.min ? '#ffb030' : '#8a6a3a'), 100);
      ctx.fillStyle = INK; ctx.fillRect(x - 100 + 100 * ARSENAL.charge.min - 1, y - 5, 2, 10);   // the minimum-release mark
      txt(full ? 'CHARGED!' : 'CHARGE', x - 108, y, lab, full ? '#ffffff' : (P.charge > 0 ? '#ffb030' : dim), 'right', INK, 3);
      ctx.globalAlpha = 1;
    }

    // phase drive bar
    const bw = 440, bx = W / 2 - bw / 2, bh = 18, by = H - 36, en = G.energy, lowPh = G.phased && en < 0.25, nag = G.hold && G.holdT > 6 && !G.phased;
    if (nag) {
      // the tutorial has been waiting a while: make the bar impossible to miss
      const pu = 0.5 + 0.5 * Math.sin(t * 8);
      ctx.strokeStyle = 'rgba(125,244,255,' + (0.3 + 0.6 * pu) + ')'; ctx.lineWidth = 4 + 6 * pu; ctx.strokeRect(bx - 10 - 6 * pu, by - 10 - 6 * pu, bw + 20 + 12 * pu, bh + 20 + 12 * pu);
    }
    ctx.fillStyle = INK; ctx.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
    ctx.fillStyle = '#161a22'; ctx.fillRect(bx, by, bw, bh);
    const col = G.anchored ? '#e23bff' : (lowPh ? (Math.floor(t * 14) % 2 ? '#ff4a4a' : '#ffffff') : (en < 0.15 ? (Math.floor(t * 10) % 2 ? '#ff4a4a' : '#7a1e1e') : (G.phased ? '#ffffff' : (en < 0.5 ? '#2b93b8' : '#39d5ff'))));
    ctx.fillStyle = col; ctx.fillRect(bx, by, bw * en, bh);
    ctx.fillStyle = 'rgba(7,8,11,0.55)'; ctx.fillRect(bx + bw * 0.5 - 1, by, 2, bh);
    if (G.grazeT > 0 && !G.phased) { ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, G.grazeT * 4) + ')'; ctx.fillRect(bx + bw * en - 10, by - 3, 12, bh + 6); }
    ctx.fillStyle = INK; ctx.fillRect(bx + bw * 0.15 - 1, by, 2, bh);   // the minimum-charge mark
    ctx.strokeStyle = G.readyT > 0 ? '#ffffff' : BONE; ctx.lineWidth = G.readyT > 0 ? 3 : 1.5; ctx.strokeRect(bx - 4, by - 4, bw + 8, bh + 8);
    txt(G.anchored ? 'ANCHORED — DRIVE LOCKED' : (G.phased ? 'ABOVE THE PLANE   ' + (en * 3).toFixed(1) + 's' : (en < 0.15 ? 'DRIVE CHARGING' : (G.readyT > 0 ? 'DRIVE READY' : 'PHASE DRIVE'))),
      W / 2, by - 15, 'bold 14px ' + F_MONO, G.anchored ? '#f3a8ff' : (lowPh ? '#ff8a8a' : (G.phased ? '#fff' : '#8fd8ff')), 'center', INK, 4);

    // boss bar: one segment per phase, and the list of systems that are open right now
    const b = G.boss;
    if (b && !b.entering) {
      const w = 640, x = W / 2 - w / 2, y = 26, f = bossHpFrac(b);
      txt(b.T.name, W / 2, y - 13, 'bold 14px ' + F_MONO, '#ffb4b4', 'center', INK, 4);
      ctx.fillStyle = INK; ctx.fillRect(x - 4, y - 4, w + 8, 20); ctx.fillStyle = '#2a0d10'; ctx.fillRect(x, y, w, 12);
      ctx.fillStyle = b.tethers > 0 ? '#e23bff' : '#ff3b4a'; ctx.fillRect(x, y, w * f, 12);
      let tot = 0, acc = 0;
      for (const c of b.comps) tot += c.maxHp;
      const ns = bossStageCount(b);
      for (let s = ns - 1; s > 0; s--) {
        for (const c of b.comps) if (c.stage === s) acc += c.maxHp;
        ctx.fillStyle = INK; ctx.fillRect(x + w * acc / tot - 1.5, y, 3, 12);
      }
      ctx.strokeStyle = BONE; ctx.lineWidth = 1.5; ctx.strokeRect(x - 4, y - 4, w + 8, 20);
      if (b.stage < ns) {
        const names = [];
        for (const c of b.comps) if (c.stage === b.stage && !c.dead) names.push(systemOf(c.kind).label);
        txt(b.tethers > 0 ? 'TETHERED — DESTROY THE ANCHOR IN THE PLANE' : 'OPEN SYSTEMS: ' + names.join(' · '), W / 2, y + 30, 'bold 16px ' + F_MONO, b.tethers > 0 ? '#f3a8ff' : '#ffd23e', 'center', INK, 4);
      }
    }

    // banner (typed out letter by letter)
    const bn = G.banner;
    if (bn && G.scene !== 'pause') {
      const y = bn.warn ? 176 : 158;
      const sub = typeof bn.sub === 'function' ? bn.sub() : bn.sub;   // a function subtitle follows the game state
      // the banner never hides the ship: it ghosts out while you are flying under it
      const a = clamp(Math.min(bn.t * 4, (bn.dur - bn.t) * 3), 0, 1) * (P.alive && P.y < y + (sub ? 82 : 52) && bn.t > 0.9 ? 0.28 : 1);
      ctx.globalAlpha = a;
      if (bn.warn) {
        ctx.fillStyle = 'rgba(120,0,10,0.55)'; ctx.fillRect(0, y - 46, W, sub ? 110 : 80); ctx.fillStyle = '#ff3636';
        for (let i = -1; i < 34; i++) {
          const xx = i * 44 + ((t * 60) % 44);
          ctx.beginPath(); ctx.moveTo(xx, y - 46); ctx.lineTo(xx + 22, y - 46); ctx.lineTo(xx + 10, y - 36); ctx.lineTo(xx - 12, y - 36); ctx.closePath(); ctx.fill();
        }
      }
      const n = Math.min(bn.text.length, Math.floor(bn.t * 50));
      txt(bn.text.slice(0, n), W / 2, y, '52px ' + F_HEAD, bn.warn ? (Math.floor(t * 6) % 2 ? '#ffffff' : '#ff5a5a') : '#ffffff', 'center', INK, 9);
      if (sub) txt(sub, W / 2, y + 44, 'bold 17px ' + F_MONO, bn.warn ? '#ffd0d0' : '#ffd23e', 'center', INK, 5);
      ctx.globalAlpha = 1;
    }

    // tutorial prompt: shown while a ship spawned with { tutorial: true } is on station
    let tut = null;
    for (const e of enemies) if (e.tutorial && !e.dying) tut = e;
    if (tut && tut.x < tut.tx + 80 && P.alive) {
      let a, b2;
      if (!G.phased) {
        if (G.energy < 0.3) { a = 'DRIVE RECHARGING…'; b2 = 'IT REFILLS IN THE PLANE — FASTER WHEN YOU GRAZE BULLETS'; }
        else if (P.x < tut.x - 380) { a = 'ITS ARMOUR IS ABSOLUTE. YOUR GUN CANNOT HURT IT.'; b2 = 'FLY IN CLOSE FIRST  —  THE DRIVE ONLY LASTS 3 SECONDS'; }
        else { a = 'CLOSE ENOUGH.  NOW LEAVE THE PLANE.'; b2 = 'HOLD  [ SPACE ]  AND FLY OVER THE SHIP'; }
      }
      else if (!P.lockC) { a = 'YOU ARE ABOVE THE PLANE. NOTHING FLAT CAN TOUCH YOU.'; b2 = 'FLY OVER THE SHIP — PUT THE RETICLE ON ITS REACTOR'; }
      else {
        a = 'LOCKED. YOUR WEAPON DETONATES INSIDE THE HULL.'; b2 = G.autofire ? 'HOLD POSITION UNTIL IT BREAKS' : 'HOLD  [ Z ]  TO FIRE';
        // someone holding the charge key here is waiting for something to happen: tell them what
        if (XD.inp.charge && P.charge > 0.3) b2 = 'LET GO OF  [ ' + XD.chargeKeyName() + ' ]  TO RELEASE THE CHARGE INTO IT';
      }
      const big = G.holdT > 6 && !G.phased, ph = big ? 92 : 74, pw = big ? 920 : 800, py0 = H - 104 - ph;
      ctx.fillStyle = 'rgba(7,8,11,0.86)'; ctx.fillRect(W / 2 - pw / 2, py0, pw, ph); ctx.strokeStyle = '#7df4ff'; ctx.lineWidth = big ? 4 : 2; ctx.strokeRect(W / 2 - pw / 2, py0, pw, ph);
      txt(a, W / 2, py0 + 24, 'bold 17px ' + F_MONO, '#fff', 'center');
      txt(b2, W / 2, py0 + (big ? 60 : 52), 'bold ' + (big ? 26 : 18) + 'px ' + F_MONO, Math.floor(t * 3) % 2 ? '#7df4ff' : '#ffffff', 'center');
    }
  }

  /* ---------------- title screen ----------------
     Backdrop art comes from XD.SCREENS.title: an image asset if it loaded, otherwise an enemy sprite. */
  function drawTitle() {
    const t = G.time, scr = SCREENS.title;
    drawBackdrop(0);
    const img = assetImage(scr.backdrop);
    if (img) {
      const iw = img.naturalWidth || W, ih = img.naturalHeight || H, s = Math.max(W / iw, H / ih) * 1.06;
      ctx.globalAlpha = 0.9; ctx.globalCompositeOperation = 'lighten';
      ctx.drawImage(img, W / 2 - iw * s / 2 + Math.sin(t * 0.2) * 14, H / 2 - ih * s / 2 - 18, iw * s, ih * s);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    else if (SPR[scr.sprite]) {
      const sp = SPR[scr.sprite];
      ctx.globalAlpha = 0.9; ctx.drawImage(sp.ext, W / 2 - sp.w * 0.65 + Math.sin(t * 0.2) * 14, H / 2 - sp.h * 0.65 - 18, sp.w * 1.3, sp.h * 1.3); ctx.globalAlpha = 1;
    }
    // the art carries the screen: only the title band and the controls strip are darkened
    let g = ctx.createLinearGradient(0, 0, 0, 250);
    g.addColorStop(0, 'rgba(3,4,8,0.9)'); g.addColorStop(0.7, 'rgba(3,4,8,0.55)'); g.addColorStop(1, 'rgba(3,4,8,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 250);
    g = ctx.createLinearGradient(0, 430, 0, H);
    g.addColorStop(0, 'rgba(3,4,8,0)'); g.addColorStop(0.3, 'rgba(3,4,8,0.8)'); g.addColorStop(1, 'rgba(3,4,8,0.96)'); ctx.fillStyle = g; ctx.fillRect(0, 430, W, H - 430);
    const ty = 104, j = Math.sin(t * 1.7) * 3;
    txt('EXTRADIMENSIONAL', W / 2 - 5 - j, ty + 3, '112px ' + F_HEAD, '#e23bff', 'center');
    txt('EXTRADIMENSIONAL', W / 2 + 5 + j, ty - 3, '112px ' + F_HEAD, '#39d5ff', 'center');
    txt('EXTRADIMENSIONAL', W / 2, ty, '112px ' + F_HEAD, '#f4f1e6', 'center', INK, 10);
    txt('They own every inch of the plane.  You are the only thing in it that can leave.', W / 2, ty + 76, 'italic bold 22px Georgia, serif', '#ffd23e', 'center', INK, 6);
    const pe = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.save(); ctx.translate(W / 2, 470); ctx.scale(1 + 0.04 * pe, 1 + 0.04 * pe); ctx.globalAlpha = 0.72 + 0.28 * pe;
    txt('PRESS  ENTER', 0, 0, '50px ' + F_HEAD, '#ffffff', 'center', INK, 9); ctx.restore(); ctx.globalAlpha = 1;
    drawShip(W / 2 - 232 + Math.sin(t * 1.3) * 8, 470 + Math.sin(t * 2) * 5, 1.3, 0, 0.6 + 0.4 * Math.sin(t * 2));
    txt('HOLD  [ SPACE ]  TO RISE OUT OF THE PLANE:  NOTHING FLAT CAN TOUCH YOU,  AND YOUR WEAPON DETONATES INSIDE THEIR HULLS', W / 2, 528, 'bold 15px ' + F_MONO, '#7df4ff', 'center', INK, 4);
    const cols = [
      [['MOVE', 'ARROWS / WASD'], ['PHASE', 'hold SPACE  (or X / K)'], ['CHARGE', 'hold Z / J, then let go  (or C / L)'], ['FOCUS', 'SHIFT — slow · drone front · skips guns']],
      [['FIRE', 'automatic  (F: manual on Z / J)'], ['PICKUPS', 'D drone · S L K guns · P power'], ['PAUSE', 'P / ESC'], ['MUTE', 'M']]
    ];
    const py = 562;
    ctx.fillStyle = 'rgba(7,8,11,0.78)'; ctx.fillRect(220, py - 17, 840, 112); ctx.strokeStyle = BONE; ctx.lineWidth = 1.5; ctx.strokeRect(220, py - 17, 840, 112);
    cols.forEach((c, ci) => c.forEach((r, i) => {
      const x0 = 236 + ci * 420, yy = py + i * 26;
      ctx.fillStyle = '#7df4ff'; ctx.fillRect(x0, yy - 11, 74, 22);
      txt(r[0], x0 + 37, yy + 1, 'bold 14px ' + F_MONO, INK, 'center'); txt(r[1], x0 + 88, yy + 1, 'bold 15px ' + F_MONO, '#f4f1e6', 'left');
    }));
    txt('Armour only exists in two dimensions.   Graze bullets to charge the drive.   Shots you phase THROUGH are banked and fired back.', W / 2, 676, 'bold 14px ' + F_MONO, '#b4bac6', 'center', INK, 3);
    txt('HI-SCORE  ' + String(G.hi).padStart(8, '0'), W / 2, 702, 'bold 16px ' + F_MONO, '#ffd23e', 'center', INK, 4);
    ctx.drawImage(gfx.vig, 0, 0);
  }

  // a full-width ink band with a headline and lines of text (pause, game over, victory)
  function overlayPanel(title, lines, col, light) {
    ctx.fillStyle = 'rgba(3,4,8,' + (light ? 0.3 : 0.62) + ')'; ctx.fillRect(0, 0, W, H);
    const y0 = 182, y1 = 340 + lines.length * 34 + 6;   // a solid ink band so nothing in the frozen frame cuts through the text
    ctx.fillStyle = 'rgba(3,4,8,0.93)'; ctx.fillRect(0, y0, W, y1 - y0);
    ctx.fillStyle = BONE; ctx.fillRect(0, y0, W, 2); ctx.fillRect(0, y1 - 2, W, 2); ctx.fillRect(0, y0 + 6, W, 1); ctx.fillRect(0, y1 - 7, W, 1);
    let fs = 84; ctx.font = fs + 'px ' + F_HEAD;
    const tw = ctx.measureText(title).width; if (tw > W - 120) fs = Math.floor(fs * (W - 120) / tw);
    txt(title, W / 2, 250, fs + 'px ' + F_HEAD, col || '#fff', 'center', INK, 10);
    lines.forEach((l, i) => txt(l, W / 2, 340 + i * 34, 'bold 19px ' + F_MONO, i === 0 ? '#ffd23e' : '#f4f1e6', 'center', INK, 4));
  }

  // pause and game-over panels (drawn over the frozen play field)
  function drawOverlays() {
    if (G.scene === 'pause') {
      overlayPanel('PAUSED', ['P / ESC / ENTER  —  resume', 'ARROWS / WASD move  ·  hold SPACE to phase  ·  SHIFT focus (drone in front; leaves weapon pickups)',
        'hold ' + (G.autofire ? 'Z / J' : 'C / L') + ' to charge, let go:  a beam down the row  ·  a chained detonation inside a hull',
        'M mute  ·  F auto-fire ' + (G.autofire ? 'ON' : 'OFF') + '  ·  Q quit to title']);
    }
    else if (G.scene === 'gameover') {
      overlayPanel('THE PLANE CLOSES OVER YOU', [
        G.continues > 0 ? 'ENTER  —  continue from ' + (G.atBoss ? 'the capital ship' + (G.cpBoss && (G.cpBoss.stage > 0 || G.cpBoss.dead.length) ? ', what you wrecked stays wrecked' : '') : 'the start of stage ' + G.stage) + '   (' + G.continues + ' left)' : 'ENTER  —  return to title',
        'ESC  —  give up', 'SCORE  ' + Math.floor(G.score) + '     HI  ' + G.hi], '#ff5a5a');
    }
  }

  /* ---------------- victory screen ----------------
     Text and wreck art come from XD.SCREENS.victory, overridden by the LAST stage's own victory: {...} block.
     With no backdrop / sprite named, the wreck is the last stage's boss, opened up. */
  function drawVictory() {
    const t = G.time, vt = G.time - G.endTime, sec = Math.floor(G.endTime - G.startTime);
    const lastStage = STAGES.length ? STAGES[STAGES.length - 1] : null, lastBoss = lastStage ? lastStage.boss : null;
    const scr = Object.assign({}, SCREENS.victory, (lastStage && lastStage.victory) || {});
    drawBackdrop(0);
    // the last capital ship, opened up and broken, drifting
    ctx.save(); ctx.translate(W / 2 + Math.sin(t * 0.15) * 10, H / 2 + 30); ctx.rotate(0.05 + 0.01 * Math.sin(t * 0.3));
    const img = assetImage(scr.backdrop), sp = SPR[scr.sprite || lastBoss];
    if (img) {
      const iw = img.naturalWidth || W, ih = img.naturalHeight || H, s = Math.max(W / iw, H / ih) * 1.1;
      ctx.globalAlpha = 0.6; ctx.globalCompositeOperation = 'lighten'; ctx.drawImage(img, -iw * s / 2, -ih * s / 2, iw * s, ih * s); ctx.globalCompositeOperation = 'source-over';
    }
    else if (sp) { ctx.globalAlpha = 0.6; ctx.drawImage(sp.cut, -sp.cw * 0.7, -sp.ch * 0.7, sp.cw * 1.4, sp.ch * 1.4); }
    // cracks through it
    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#03040a'; ctx.lineWidth = 7; ctx.lineJoin = 'miter';
    for (let c = 0; c < 4; c++) {
      ctx.beginPath(); let x = -420 + c * 260 + hash(c) * 80, y = -300; ctx.moveTo(x, y);
      for (let i = 0; i < 9; i++) { x += (hash(c * 9 + i) - 0.5) * 150; y += 70; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = 1;
    for (const p of parts) { ctx.globalAlpha = 1 - p.t / p.max; ctx.fillStyle = p.col; ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz); }
    ctx.globalAlpha = 1;
    drawBooms();
    ctx.drawImage(gfx.vig, 0, 0);
    const cu = clamp((vt - 0.4) / 1.6, 0, 1), shown = Math.floor(G.score * cu / 10) * 10;   // the score counts up
    // rank: ships lost per stage against XD.RULES.ranks (stock: S none, A up to 1 per stage, B up to 8 in 3 stages)
    const per = G.deaths / Math.max(1, STAGES.length);
    let rank = XD.RULES.lastRank;
    for (const r of XD.RULES.ranks) if (per <= r[1] + 1e-9) { rank = r[0]; break; }
    overlayPanel(scr.title, [scr.line, 'FINAL SCORE  ' + shown + '      HI  ' + G.hi,
      'ships lost ' + G.deaths + '   ·   kills ' + G.kills + '   ·   grazes ' + (G.grazes || 0) + '   ·   time ' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'),
      'ENTER  —  title'], '#ffd23e', true);
    if (vt > 2.2) {
      const pop = 1 + 0.6 * Math.max(0, 1 - (vt - 2.2) * 5);
      ctx.save(); ctx.translate(W - 170, 600); ctx.rotate(-0.12); ctx.scale(pop, pop);
      txt('RANK', 0, -62, 'bold 20px ' + F_MONO, '#ffd23e', 'center', INK, 5);
      txt(rank, 0, 0, '120px ' + F_HEAD, rank === 'S' ? '#ffd23e' : '#f4f1e6', 'center', INK, 12);
      ctx.restore();
    }
  }

  Object.assign(XD, { drawHUD, drawTitle, overlayPanel, drawOverlays, drawVictory });
})();
