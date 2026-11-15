/* ============================================================
   data/systems.js : the internal systems (component kinds) a hull can contain.
   XD.defineSystem(kind, {
     label,            // text on the cutaway name plate and in banners
     color,            // colour of the system when it is open to attack
     krak,             // sound-effect lettering when it blows
     fatal,            // true = destroying it kills the ship (so it does not count as a "side system" for FULL GUT)
     onDestroyed(e, c, cx, cy),      // consequence on an ordinary ship (cx, cy = world position of the system)
     onBossDestroyed(e, c, cx, cy),  // extra consequence on a boss (the phase logic itself is in js/bosses.js)
     onBossResume(e, c),             // re-apply a lasting consequence when a continue restores a boss with this system already wrecked
     icon(ctx, x, y, r, t)           // draws the pictogram inside the system disc; stroke/fill start as ink
   })
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { TAU, rnd, defineSystem, popup, ringFx, blast, killEnemy, killLasers, convertBullets } = XD;

  // the status line that appears above a crippled ship
  const status = (e, text, col) => popup(e.x, e.y - e.rh - 26, text, col, true);

  // the single weak point of fodder craft
  defineSystem('core', {
    label: 'CORE', color: '#ffb030', fatal: true,
    onDestroyed(e) { killEnemy(e, 'int'); }
  });

  // slow jackpot: the ship dies outright
  defineSystem('reactor', {
    label: 'REACTOR', color: '#ffb030', krak: 'KA-THOOM!', fatal: true,
    onDestroyed(e) { killEnemy(e, 'int'); },
    icon(ctx, x, y, r, t) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + t * 1.5; ctx.moveTo(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45); ctx.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95); }
      ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r * 0.38 * (1 + 0.18 * Math.sin(t * 9)), 0, TAU); ctx.fill(); ctx.stroke();
    }
  });

  // an area blast that hurts everything nearby, breaches the hull (armour gone) and silences the guns
  defineSystem('magazine', {
    label: 'MAGAZINE', color: '#ff4a3a', krak: 'BWAAAM!',
    onDestroyed(e, c, cx, cy) {
      blast(cx, cy, 240, 60, e);
      e.hp -= e.maxHp * 0.6; e.magDead = true; e.armor = 1;
      if (e.hp <= 0) killEnemy(e, 'int');
      else status(e, 'HULL BREACHED — GUNS DEAD — SHOOT IT', '#ff8a5a');
    },
    onBossDestroyed(e, c, cx, cy) { blast(cx, cy, 260, 60, e); },
    icon(ctx, x, y, r) {
      for (let i = -1; i <= 1; i++) {
        const sx = x + i * r * 0.5;
        ctx.beginPath(); ctx.moveTo(sx - r * 0.16, y + r * 0.55); ctx.lineTo(sx - r * 0.16, y - r * 0.2); ctx.lineTo(sx, y - r * 0.62);
        ctx.lineTo(sx + r * 0.16, y - r * 0.2); ctx.lineTo(sx + r * 0.16, y + r * 0.55); ctx.closePath(); ctx.fill();
      }
    }
  });

  // drops the shield so the flat gun works
  defineSystem('shield', {
    label: 'SHIELD GEN', color: '#39d5ff', krak: 'ZZAKT!',
    onDestroyed(e) {
      e.shield = false; ringFx(e.x, e.y, e.rw + 40, '#39d5ff', 0.4);
      status(e, 'SHIELD DOWN — SHOOT IT', '#39d5ff');
    },
    onBossDestroyed(e) { ringFx(e.x, e.y, e.rw + 60, '#39d5ff', 0.6); },
    icon(ctx, x, y, r) {
      ctx.beginPath(); ctx.arc(x, y, r * 0.68, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r * 0.32, 0, TAU); ctx.fill();
    }
  });

  // blinds the ship: it stops firing, drifts, and its crew scuttles it a few seconds later
  defineSystem('bridge', {
    label: 'BRIDGE', color: '#4a8dff', krak: 'KRAK!',
    onDestroyed(e) {
      e.disabled = true; e.scuttle = 3.2; e.driftV = rnd(-18, 18);
      killLasers(e); convertBullets(b => b.owner === e.id);
      status(e, 'BLIND — CREW SCUTTLING', '#8fb6ff');
    },
    icon(ctx, x, y, r) {
      ctx.beginPath(); ctx.arc(x, y + r * 0.25, r * 0.62, Math.PI, 0); ctx.closePath(); ctx.stroke();
      ctx.fillRect(x - r * 0.6, y + r * 0.25, r * 1.2, r * 0.22);
    }
  });

  // the ship stalls and the armada leaves it behind (full credit when it drops off the screen)
  defineSystem('engine', {
    label: 'ENGINES', color: '#b06aff', krak: 'SKREEE!',
    onDestroyed(e) {
      e.stalled = true; e.vx = 0;
      status(e, 'DEAD IN SPACE — FALLING BEHIND', '#c9a0ff');
    },
    icon(ctx, x, y, r, t) {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + t * 6; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85); }
      ctx.stroke();
    }
  });

  // stops the ship launching fodder (patterns check e.noSpawn)
  defineSystem('hangar', {
    label: 'HANGAR', color: '#5fdc5a', krak: 'KRUNCH!',
    onDestroyed(e) {
      e.noSpawn = true;
      status(e, 'HANGAR GUTTED — NO MORE SWARM', '#7dff6a');
    },
    onBossDestroyed(e) { e.noSpawn = true; },
    onBossResume(e) { e.noSpawn = true; },
    icon(ctx, x, y, r) {
      ctx.beginPath(); ctx.moveTo(x - r * 0.6, y); ctx.lineTo(x + r * 0.5, y - r * 0.45); ctx.lineTo(x + r * 0.25, y); ctx.lineTo(x + r * 0.5, y + r * 0.45); ctx.closePath(); ctx.fill();
    }
  });
})();
