/* ============================================================
   data/enemies.js : the enemy type table.
   XD.defineEnemy(id, {
     rw, rh      half-width / half-height of the hull in pixels
     poly        hull outline in unit coordinates (-1..1, scaled by rw/rh); ships face LEFT
     hp          hull hit points against the flat gun
     armor       multiplier on flat-gun damage: 1 = unarmoured, 0.1 = heavy plate, 0 = immune
     score       points for the kill (x1.5 when gutted from inside, more for a FULL GUT)
     glow        colour of the eye / engine glow
     spikes      any truthy value puts bone spikes along the hull edges
     fodder      true = small craft: dies to one internal hit, kills on contact, never a capital ship
     shield      true = a forward shield eats flat shots until its 'shield' system is destroyed
     comps       internal systems: [kind, ox, oy, radius, hp] — offsets from the hull centre; kinds are in data/systems.js
     guns        gun mount offsets [[x, y], ...]: drawn as turrets, read by patterns via gunPos(e, i)
     pattern     id of the bullet pattern (data/patterns.js); default = the enemy id; null = never fires
     noInt       true = phase-locked hull: the 3-D weapon cannot hurt it
     field       radius of an ANCHOR field: any type with `field` blocks phasing around itself
     dropCell    true = always drops a phase cell (other capital ships: 30% chance)
     dropBonus   true = also drops a gun upgrade (or a second cell once the gun is maxed)
     art         optional image art, see data/bosses.js (maw) and MODDING.md
   })
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { defineEnemy, starPoly } = XD;

  /* ---------------- fodder ---------------- */
  defineEnemy('mote', {
    rw: 17, rh: 12, hp: 3, armor: 1, score: 100, fodder: true, glow: '#ff5a3c',
    poly: [[-1, 0], [-.2, -.95], [1, -.6], [.45, 0], [1, .6], [-.2, .95]],
    comps: [['core', 0, 0, 5, 1]]
  });
  defineEnemy('lancer', {
    rw: 26, rh: 13, hp: 8, armor: 1, score: 250, fodder: true, glow: '#ffd23e',
    poly: [[-1, 0], [-.3, -.5], [.2, -1], [1, -.45], [.65, 0], [1, .45], [.2, 1], [-.3, .5]],
    comps: [['core', 2, 0, 5, 1]],
    pattern: null   // its only shot is the fan built into the 'dive' movement
  });

  /* ---------------- capital ships ---------------- */
  // spiral turret: lightly armoured, one reactor
  defineEnemy('weaver', {
    rw: 32, rh: 32, hp: 60, armor: .35, score: 700, glow: '#ff3d8b', spikes: 7,
    poly: starPoly(8, .72),
    comps: [['reactor', 0, 0, 10, 6]]
  });
  // shielded picket: break the generator from inside, then shoot it — or go for the reactor
  defineEnemy('bulwark', {
    rw: 40, rh: 46, hp: 60, armor: 1, shield: true, score: 900, glow: '#39d5ff', spikes: 6,
    poly: [[-.6, -1], [.5, -.85], [1, -.3], [1, .3], [.5, .85], [-.6, 1], [-.95, .4], [-.95, -.4]],
    comps: [['shield', -14, -22, 9, 4], ['reactor', 12, 16, 10, 11]]
  });
  // armour absolute: the flat gun does nothing until the magazine blows the hull open
  defineEnemy('ironclad', {
    rw: 92, rh: 52, hp: 70, armor: 0, score: 1500, glow: '#ff8a1f', spikes: 9,
    poly: [[-1, -.15], [-.75, -.7], [-.2, -1], [.7, -.9], [1, -.4], [1, .4], [.7, .9], [-.2, 1], [-.75, .7], [-1, .15]],
    comps: [['reactor', 36, 10, 13, 20], ['magazine', -38, -8, 12, 8]]
  });
  // lance frigate: telegraphed beam
  defineEnemy('scythe', {
    rw: 88, rh: 30, hp: 120, armor: .12, score: 1800, glow: '#ffe14a', spikes: 6, dropCell: true,
    poly: [[-1, 0], [-.5, -.5], [.3, -.7], [.6, -1], [1, -.6], [1, .6], [.6, 1], [.3, .7], [-.5, .5]],
    comps: [['reactor', -22, 0, 10, 18], ['bridge', 34, -8, 8, 6], ['engine', 68, 4, 8, 6]]
  });
  // swarm carrier
  defineEnemy('carrier', {
    rw: 124, rh: 62, hp: 240, armor: .08, score: 3000, glow: '#7dff6a', spikes: 10, dropCell: true, dropBonus: true,
    poly: [[-1, -.2], [-.8, -.7], [-.1, -1], [.8, -.85], [1, -.3], [1, .5], [.8, 1], [-.5, 1], [-.9, .6], [-1, .2]],
    comps: [['hangar', -56, 14, 14, 10], ['reactor', 42, 12, 13, 30], ['bridge', 16, -32, 9, 7], ['engine', 98, 0, 10, 8]]
  });
  // dreadnought
  defineEnemy('bastion', {
    rw: 176, rh: 84, hp: 420, armor: .05, score: 5000, glow: '#ff3636', spikes: 12, dropCell: true, dropBonus: true,
    poly: [[-1, -.1], [-.85, -.6], [-.4, -.75], [-.2, -1], [.6, -1], [.9, -.6], [1, -.2], [1, .3], [.85, .8], [.3, 1], [-.5, .9], [-.9, .5], [-1, .1]],
    comps: [['bridge', 40, -52, 10, 8], ['magazine', -70, 10, 13, 10], ['reactor', 70, 24, 14, 38], ['engine', 140, -4, 11, 8]],
    guns: [[-150, -30], [-90, -66], [-100, 62], [30, 78]]
  });
  // dimensional anchor: no phasing inside its field, immune to the 3-D weapon — kill it in the plane
  defineEnemy('anchor', {
    rw: 27, rh: 27, hp: 95, armor: 1, score: 1500, noInt: true, field: 215, glow: '#e23bff', spikes: 8,
    poly: starPoly(6, .8),
    comps: []
  });
})();
