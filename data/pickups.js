/* ============================================================
   data/pickups.js : pickups and the drop rules.
   XD.definePickup(id, {
     color,        // outline + label colour (a string, or a function (p) -> string for pickups that change)
     label,        // text drawn on the pickup (default: the id); may also be a function (p) -> string
     labelSize,    // label font size in px (default 13)
     shape,        // 'diamond' (default), 'hex', 'square' (weapons) or 'pod' (the drone)
     spin,         // rotation speed in radians/second (default 0)
     useful(),     // optional: false when collecting it would be wasted (the drop rules then give a cell instead)
     optional,     // true = a choice, not a gift: never magnetised, and left alone while FOCUS (Shift) is held (the weapon squares)
     cycle,        // seconds per step for a pickup that cycles (draws a countdown ring; the label/color functions do the cycling)
     collect(p)    // what it does when the ship touches it (every pickup also scores 200)
   })
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { G, P, MAX_GUN, WEAPONS, WEAPON_ORDER, ARSENAL, DRONE, definePickup, setDropRules, popup, addScore, teach } = XD;

  // phase cell: refills a third of the drive
  definePickup('E', {
    color: '#7df4ff', shape: 'hex', spin: 1.5,
    collect() { G.energy = Math.min(1, G.energy + 0.34); popup(P.x, P.y + 52, 'PHASE CELL', '#7df4ff', true); }
  });

  // gun upgrade (score bonus once the gun is maxed).  Each pickup's popup has its own slot so labels never stack.
  definePickup('P', {
    color: '#7dff6a',
    useful: () => P.gun < MAX_GUN,
    collect() {
      if (P.gun < MAX_GUN) { P.gun++; popup(P.x, P.y + 78, 'GUN LEVEL ' + P.gun, '#7dff6a', true); }
      else { addScore(2000, P.x, P.y + 78, true, 'MAX'); }
    }
  });

  // extra ship
  definePickup('L', {
    color: '#7dff6a', label: '1UP', labelSize: 9,
    collect() { G.lives++; popup(P.x, P.y - 56, 'EXTRA SHIP', '#7dff6a', true); }
  });

  // tether drone: the first one gives you the pod, the second upgrades it (see data/weapons.js for what a level means)
  definePickup('D', {
    color: '#7df4ff', label: 'D', labelSize: 15, shape: 'pod', spin: 0,
    useful: () => DRONE.level < ARSENAL.drone.levels.length - 1,
    collect() {
      if (XD.giveDrone()) {
        popup(P.x, P.y + 78, DRONE.level > 1 ? 'DRONE MK ' + DRONE.level : 'TETHER DRONE', '#7df4ff', true);
        if (DRONE.level === 1) teach('drone', 'TETHER DRONE', 'IT STOPS SMALL SHOTS (SHIFT: HOLD IT IN FRONT)  ·  PHASE AND IT STAYS BEHIND AS YOUR DECOY', 5);
        else teach('drone2', 'DRONE UPGRADED', 'TWIN GUNS, A TOUGHER SHELL, A HARDER SNAP-BACK', 3.4);
      }
      else addScore(2000, P.x, P.y + 78, true, 'DRONE REPAIRED');
    }
  });

  // weapon capsule: cycles through the weapons you are NOT carrying that this run has already met (equipped once, or
  // their own pickup has dropped) — so it never hands out stage 3's gun in stage 1. You get the one showing when you touch it.
  // (Each weapon also has its own fixed pickup, registered by XD.defineWeapon from its `pickup` field: WS, WL, WK.)
  const CYCLE = 1.3;   // seconds each letter shows
  const offered = () => WEAPON_ORDER.filter(id => id !== P.weapon && (G.seenWeapons[id] || WEAPONS[id].capsule === 'always'));
  const capsule = p => {
    const ids = offered();
    return ids.length ? WEAPONS[ids[Math.floor(p.t / CYCLE) % ids.length]] : null;
  };
  definePickup('W', {
    optional: true, useful: () => offered().length > 0,
    shape: 'square', labelSize: 16, cycle: CYCLE,   // cycle: the renderer draws a countdown ring around it
    color: p => { const w = capsule(p); return w ? w.color : '#9aa0ad'; },
    label: p => { const w = capsule(p); return w ? w.letter : '?'; },
    collect(p) { const w = capsule(p); if (w) XD.equipWeapon(w.id); }
  });

  /* The engine's own drop rules, expressed in pickup ids:
       cell     - dropped by capital ships (always if the type has dropCell, else by chance), by every destroyed
                  boss system, by stalled ships left behind, and by every `fodderEvery`-th fodder kill
       upgrade  - dropped instead of a cell on fodder kill number fodderUpgradeAt (mod fodderUpgradeEvery), and as
                  the bonus drop of types with dropBonus — in both cases only while it is still useful()
       stageClear - [id, x, y] pickups handed out when a stage (other than the last) is cleared
       bonus    - what a type with dropBonus drops: the first USEFUL id of this list (else a second cell)
       fodderSpecials - [{ id, every, at }]: fodder kill number `at` (mod `every`) drops `id` instead, while it is useful */
  setDropRules({
    cell: 'E', upgrade: 'P',
    capitalCellChance: 0.3,
    // pacing target: gun 2-3 at the first boss, 3-4 at the second, 4 during stage 3; the drone's three levels come one
    // per stage from the stage scripts (boss rewards and dropBonus ships replace what a death cost)
    fodderEvery: 16, fodderUpgradeEvery: 110, fodderUpgradeAt: 90,
    stageClear: [['L', 700, 300], ['P', 700, 420]],
    bonus: ['P', 'D', 'W'],
    fodderSpecials: [{ id: 'W', every: 160, at: 150 }]
  });
})();
