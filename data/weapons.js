/* ============================================================
   data/weapons.js : the main guns, and the tuning of the other power-up systems
   (tether drone, charge shot, absorb burst). Engine side: js/arsenal.js.

   XD.defineWeapon(id, {
     name        shown on the HUD and when it is picked up
     letter      the letter on its pickup and on the HUD badge
     color, core colours of its pickup, HUD badge and shots (outer, inner)
     pickup      id of the pickup that equips it (registered automatically; omit for the starting gun)
     capsule     'always' = the W capsule offers it from the start of a run (default: only once the run has met it,
                 i.e. after it was equipped or its own pickup has dropped)
     teach       [title, subtitle] banner shown the first time it is equipped in a run
     plane: {                    IN THE PLANE (2-D). Everything here obeys armour, shields and boss immunity.
       interval      seconds between volleys
       volley(level) -> [{ oy, ang, d, speed, pierce, hom, ap, life }, ...]   one entry per shot; level = gun level 1..4
       speed         default shot speed (px/s)                       pierce   hulls a shot passes through after its first hit
       homing        turn rate in radians/second                     armorPierce  armour multiplier becomes min(1, armor x this)
       life          seconds before a shot fizzles (homing shots)    look     'bolt' | 'fan' | 'beam' | 'dart' (how it is drawn)
       len, wid      size of the drawn shot                          sfx      sound name;   cap = max live shots (default 90)
       color, core   shot colours, if they should differ from the weapon's own
     },
     above: {                    ABOVE THE PLANE (3-D): detonations inside the locked system.
       interval      seconds between detonations
       damage        per detonation at gun level 1 (each level adds 14%)
       reach         how close (px, from the system's edge) the ship must be to lock a system;  fodderReach = same for small craft
       sticky        keep the current lock while it stays within this many px (0 = always re-lock the nearest)
       jump          true = when the locked system is destroyed the lock jumps to the next one within `sticky` px (an arc is drawn)
       jumpBoost, jumpTime   damage multiplier for jumpTime seconds after each jump (default none / 0.5)
       targets       how many open systems are hit per detonation (the lock, then the nearest others within `radius`)
       share         damage multiplier for those extra systems
       ramp          { from, to, time }: damage multiplier grows from..to over `time` seconds on the same system
       hull          damage to an ordinary hull when over it with nothing to lock
       fxScale       size of the detonation effect
       fx            colour of its detonations, lock line and reticle ring (default: the classic orange blast)
     }
   })
   A run starts with the FIRST weapon defined, unless XD.setStartWeapon(id) names another. P.weapon holds the equipped id.
   The gun level (pickup P) upgrades whichever weapon is equipped.
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { MAX_GUN, defineWeapon, setArsenal } = XD;

  const top = L => (L >= MAX_GUN ? 1.25 : 1);   // the last gun level also hits harder

  /* ---------------- PULSE: the starting gun. Straight bolts; one system at a time. ---------------- */
  defineWeapon('pulse', {
    name: 'PULSE', letter: 'P', color: '#39d5ff', core: '#ffffff',
    plane: {
      interval: 5 / 60, speed: 1150, look: 'bolt',
      volley(L) {
        const d = top(L), v = [{ oy: -6, d }, { oy: 6, d }];
        if (L >= 2) v.push({ oy: 0, d });
        if (L >= 3) v.push({ oy: -10, ang: -0.1, d }, { oy: 10, ang: 0.1, d });
        if (L >= 4) v.push({ oy: -13, ang: -0.22, d }, { oy: 13, ang: 0.22, d });
        return v;
      }
    },
    above: { interval: 4 / 60, damage: 1.15, reach: 48, fodderReach: 40 }
  });

  /* ---------------- SPREAD: a wide fan in the plane; above it, every open system nearby at once, lightly. ---------------- */
  defineWeapon('spread', {
    name: 'SPREAD', letter: 'S', color: '#ffd23e', core: '#fff6d0', pickup: 'WS',
    teach: ['SPREAD', 'A WIDE FAN IN THE PLANE  ·  ABOVE IT: EVERY OPEN SYSTEM NEARBY, LIGHTLY'],
    plane: {
      interval: 7 / 60, speed: 980, look: 'fan', len: 14, wid: 5,
      volley(L) {
        // the centre shot is a slug worth three of the others, so the fan still bites a small target at range
        const n = [5, 7, 9, 9][L - 1], half = [0.30, 0.38, 0.46, 0.46][L - 1], d = 0.8 * top(L), v = [];
        for (let i = 0; i < n; i++) { const u = i / (n - 1) - 0.5; v.push({ oy: u * 16, ang: u * 2 * half, d: i === (n - 1) / 2 ? d * 3 : d }); }
        return v;
      }
    },
    // (radius 320 reaches both systems of the flagship's paired phases; the lock itself still needs to be within reach)
    above: { interval: 4 / 60, damage: 0.95, reach: 64, fodderReach: 70, targets: 4, radius: 320, share: 0.6, fxScale: 0.8, fx: '#fff06a' }
  });

  /* ---------------- LANCE: a thin beam that pierces hulls and bites armour; above, a drill that spins up on ONE system. ---------------- */
  defineWeapon('lance', {
    name: 'LANCE', letter: 'L', color: '#ffffff', core: '#bff6ff', pickup: 'WL',
    teach: ['LANCE', 'PIERCES A WHOLE ROW AND BITES ARMOUR  ·  ABOVE IT: A DRILL THAT SPINS UP ON ONE SYSTEM'],
    plane: {
      interval: 9 / 60, speed: 2100, look: 'beam', len: 110, wid: 6, sfx: 'beamshot', pierce: 4, armorPierce: 3,
      color: '#39d5ff', core: '#ffffff',   // a long white bar with a cyan edge (the weapon's own colour, white, is for the badge)
      volley(L) {
        // the centre beam always does at least 3: one pass kills a whole line of motes (3 hp each)
        const d = [3.0, 3.4, 3.9, 4.6][L - 1];
        return L >= 3 ? [{ oy: -6, d: d * 0.6 }, { oy: 6, d: d * 0.6 }, { oy: 0, d: Math.max(3, d * 0.6) }] : [{ oy: 0, d }];
      }
    },
    above: { interval: 4 / 60, damage: 1.15, reach: 38, fodderReach: 30, ramp: { from: 0.7, to: 2.0, time: 1.4 }, hull: 1.3, fxScale: 1.1, fx: '#bff6ff' }
  });

  /* ---------------- SEEKER: homing darts in the plane; above, a long sticky lock that jumps from system to system. ---------------- */
  defineWeapon('seeker', {
    name: 'SEEKER', letter: 'K', color: '#c58bff', core: '#ffffff', pickup: 'WK',
    teach: ['SEEKER', 'DARTS THAT HUNT IN THE PLANE  ·  ABOVE IT: LOCKS FROM FAR OFF AND JUMPS SYSTEM TO SYSTEM'],
    plane: {
      interval: 8 / 60, speed: 760, look: 'dart', len: 12, wid: 5, sfx: 'dart', homing: 5.5, life: 2.2,
      volley(L) {
        const n = [2, 2, 3, 4][L - 1], d = 0.8 * top(L), v = [];
        for (let i = 0; i < n; i++) { const u = n > 1 ? i / (n - 1) - 0.5 : 0; v.push({ oy: u * 20, ang: u * 1.1, d }); }
        return v;
      }
    },
    // its 3-D identity is the chain: every jump to the next system hits x1.5 for 0.6 s
    above: { interval: 4 / 60, damage: 1.0, reach: 150, fodderReach: 110, sticky: 230, jump: true, jumpBoost: 1.5, jumpTime: 0.6, hull: 0.4, fxScale: 0.85, fx: '#c58bff' }
  });

  /* ============================================================
     The other three systems. XD.setArsenal({ drone, charge, absorb }) merges into XD.ARSENAL.
     ============================================================ */
  setArsenal({
    /* TETHER DRONE — pickup 'D'. levels[n] = the drone at level n (index 0 = no drone); add entries for more levels. */
    drone: {
      levels: [null,
        // hp: shell points (a small bullet costs 1, a medium one 2) before it goes offline;  down: seconds offline
        // regen: seconds per shell point regained;  blockR: body radius;  shots/dmg/interval: its gun
        // recall: hull damage of the snap-back (x armour; kills small craft outright);  wake: radius it sweeps bullets from on the way back
        { hp: 6, down: 5.0, regen: 1.6, blockR: 16, shots: 1, dmg: 1, interval: 10 / 60, recall: 14, wake: 44 },
        { hp: 10, down: 3.5, regen: 1.1, blockR: 20, shots: 2, dmg: 1, interval: 9 / 60, recall: 24, wake: 56 },
        { hp: 14, down: 2.5, regen: 0.8, blockR: 23, shots: 2, dmg: 1.5, interval: 8 / 60, recall: 36, wake: 70 }],
      maxBulletR: 8,        // only bullets this small are blocked (the pink smalls, the yellow darts, the orange mediums — never the big reds)
      heavyR: 6,            // a blocked bullet bigger than this costs 2 shell points instead of 1
      offX: 30, offY: 34,   // where it rides: ahead of the nose and off to the side you are not moving towards (it screens without SHIFT)
      frontX: 46,           // with FOCUS held it swings this far in front of the nose
      follow: 0.16,         // how tightly it follows (0..1 per tick)
      anchorRate: 1.5,      // fire-rate multiplier while it is anchored in the plane
      shotSpeed: 1100, recallSpeed: 1900
    },

    /* CHARGE SHOT — hold the charge key (Z / J with auto-fire on; C / L always). */
    charge: {
      time: 1.1,            // seconds to a full charge
      min: 0.35,            // releasing below this does nothing
      recover: 0.12,        // seconds before normal fire resumes after a release
      // released in the plane: a beam along the ship's row (key kept as "lance"; on screen it is just "the beam")
      lance: {
        damage: 45,         // at full charge and gun level 1 (scales with charge level)
        gunScale: 0.2,      // +20% per gun level above 1
        width: 20, fullWidth: 38,
        armorPierce: 2,     // armour multiplier becomes min(1, armor x 2); absolute armour and bosses still stop it dead
        crack: 1.5,         // seconds a shield stays down at full charge (scales with charge level): a window, not a kill —
        shielded: 0.25,     // share of the damage the cracked ship takes.  The real answer to a shield is still its generator.
        cancel: true, cancelR: 6   // a FULL charge burns bullets this small out of the row
      },
      // released above the plane: a detonation in every open system in range, then along the decks
      blast: {
        damage: 12,         // per system at full charge and gun level 1 (was 18: one release took a third of a boss)
        gunScale: 0.10,
        bossCap: 0.4,       // ...and never more than this share of a BOSS system's full hit points per release
        radius: 120,        // at full charge (60% of this at zero)
        chain: [0.5],       // damage multipliers of the chained detonations, one hop each (never into a boss phase that just opened)
        chainRange: 320, chainDelay: 0.14,
        hull: 14,           // hull damage when released inside an ordinary hull with no system in range
        hitstop: 8          // frozen frames at full charge
      }
    },

    /* ABSORB BURST — nothing to pick up: it is part of the phase drive. */
    absorb: {
      radius: 40,           // a bullet this close to the phased ship is banked
      cap: 40,              // most bullets the bank holds (the rest pass through as before)
      perShot: 2,           // banked bullets per released shot
      damage: 2,            // plane damage per banked bullet (so a full bank is 80, before armour)
      armorPierce: 2.5,     // their own shots coming back bite armour: multiplier becomes min(1, armor x 2.5) (absolute armour and bosses stay immune)
      refund: 0.006,        // drive energy per banked bullet when NOTHING in the plane can be hurt by a burst (a boss duel):
                            // the bank goes back into the drive instead (a full bank = +24%)
      speed: 820, turn: 7, life: 2.2, spread: 2.4
    }
  });
})();
