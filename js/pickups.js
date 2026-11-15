/* ============================================================
   js/pickups.js : engine side of pickups (what each one DOES lives in data/pickups.js).
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { G, P, W, DT, YMIN, YMAX, clamp, pickups, PICKUPS, sfx, ringFx, addScore } = XD;

  // drop pickup `kind` (an id registered with XD.definePickup) at (x,y), clamped into the play field
  function dropPickup(x, y, kind) {
    const def = PICKUPS[kind];
    if (!def) { XD.warn('dropPickup: unknown pickup id "' + kind + '" (XD.definePickup) — nothing was dropped'); return; }
    if (def.weapon) G.seenWeapons[def.weapon] = true;   // the weapon capsule only offers weapons the run has met
    pickups.push({ x: clamp(x, 60, W - 40), y: clamp(y, YMIN + 10, YMAX - 10), kind, t: 0, vx: -70, vy: 0 });
  }

  // pickups drift left with the scroll and bob a little
  function movePickups() {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.t += DT; p.x += p.vx * DT; p.y += Math.sin(p.t * 3) * 0.4;
      if (p.x < -30) pickups.splice(i, 1);
    }
  }

  // magnetise nearby pickups to the ship (all of them once the stage is cleared) and apply the ones it touches.
  // A pickup defined with optional: true (the weapon squares) is a CHOICE: it is never pulled in, and it is left
  // alone while FOCUS is held, so a gun you like is not swapped by something drifting through your row.
  function collectPickups() {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i], def = PICKUPS[p.kind], opt = !!(def && def.optional);
      const dx = P.x - p.x, dy = P.y - p.y, d = Math.hypot(dx, dy);
      if (opt && XD.inp.focus) { if (d < 60 && XD.every(G, 'leave', 0.8)) XD.popup(p.x, p.y - 30, 'LEFT IT', '#9aa0ad'); continue; }
      if (!opt && (d < 150 || G.clearT > 0)) { const ms = G.clearT > 0 ? 700 : 320; p.x += dx / (d || 1) * ms * DT; p.y += dy / (d || 1) * ms * DT; }
      if (d < (opt ? 24 : 30)) {
        pickups.splice(i, 1); sfx('pickup'); ringFx(P.x, P.y, 50, '#7dff6a', 0.3);
        if (def && def.collect) def.collect(p);
        addScore(200, P.x, P.y, false);
      }
    }
  }

  Object.assign(XD, { dropPickup, movePickups, collectPickups });
})();
