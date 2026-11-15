/* ============================================================
   data/stages.js : the ORDERED stage list, plus the title / victory screen settings.
   The game plays the stages in the order they are defined here and shows the victory screen
   after the last one. Adding a stage = adding one XD.defineStage({...}) call (see MODDING.md).

   XD.defineStage({
     name          shown under "STAGE n" when the stage starts
     boss          id of the boss (data/bosses.js) that arrives when the timeline ends (null = no boss)
     hue           backdrop hue (0-360)
     backdrop      optional asset name (data/assets.js) painted over the backdrop gradient
     music         { key: MIDI root note, bpm: tempo, busy: true = the busier square-wave lead }
     bulletSpeed   what XD.bs() returns: patterns multiply their bullet speeds by it
     tier          what XD.tier() returns: patterns use it for denser variants (default: the stage number)
     minGun        dying / continuing never leaves the player below this gun level
     armadaCount, armada   how many far-off silhouettes drift on the horizon, and of which enemy ids
     end           length of the timeline in seconds; the boss arrives once it has run out
     script(s)     builds the timeline. Helpers (first argument is always the time in seconds):
                     s.motes(t, count, y, {type, gap, amp, freq, ph, spd, drop, dropAt})   a snake of fodder on a sine wave
                                                                             (drop = pickup id carried by ship number dropAt)
                     s.swoop(t, count, fromTop, {type, amp, spd})            fodder swooping in from the top / bottom edge
                     s.lancers(t, [y, ...], {type})                          divers: fly in, aim, charge
                     s.hold(t, type, y, tx, stay, overrides)                 a ship that parks at x = tx for `stay` seconds
                     s.msg(t, title, subtitle, seconds, warn)                a banner
                     s.spawn(t, type, x, y, overrides)                       one enemy, anywhere
                     s.at(t, fn)                                             anything else
   })
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;
  const { G, defineStage, defineScreens, spawn } = XD;

  /* ---------------- STAGE 1 ---------------- */
  defineStage({
    id: 'picket',
    name: 'THE PICKET LINE',
    boss: 'warden',
    hue: 215,
    music: { key: 38, bpm: 120, busy: false },
    bulletSpeed: 1, tier: 1, minGun: 2,
    end: 91,
    script({ at, motes, swoop, lancers, hold, msg }) {
      // the hook lands inside ten seconds: fodder, then the ship your gun cannot hurt (the timeline waits on it)
      motes(2, 6, 220); motes(3.6, 6, 500); motes(5, 5, 360, { amp: 20 });
      at(6.6, () => {
        if (!G.tutorialDone) {
          // the tutorial ship: an ironclad with only a (weakened) reactor that parks until it is gutted.
          // Any enemy spawned with { tutorial: true } holds the timeline and shows the how-to-phase prompts.
          const tu = spawn('ironclad', 1400, 360, { ai: 'hold', y0: 360, tx: 690, stay: 1e9, spd: 120, tutorial: true, drop: 'P', bob: 8 });
          tu.comps = tu.comps.filter(c => c.kind === 'reactor');
          const rc = tu.comps[0]; rc.ox = 10; rc.oy = 0; rc.hp = rc.maxHp = 10;
        }
        // (after a continue: parked BETWEEN the rows, so the charge lesson's centre row at 15s is not hidden behind absolute armour)
        else spawn('ironclad', 1400, 255, { ai: 'hold', y0: 255, tx: 900, stay: 9, spd: 90, drop: 'P' });
      });
      swoop(8, 5, true); swoop(9.5, 5, false); motes(11, 6, 200, { amp: 60 }); motes(12, 6, 520, { amp: 60 });
      // POWER-UP PACING (stage 1): charge shot taught at 12.5s on tight rows · drone at ~33s · first weapon (SPREAD) at ~47s,
      // just before the big swarms. Absorb is taught by the game itself the first time shots are banked.
      // (the subtitle is a function, so it names the right key if auto-fire is off; that a full charge also cracks a
      //  shield for a moment is left for the player to find — the shield lesson at 21s is about the generator)
      msg(12.5, 'CHARGE SHOT', () => 'HOLD  [ ' + XD.chargeKeyName() + ' ]  THEN LET GO: A BEAM THROUGH THE WHOLE ROW  ·  YOUR GUN KEEPS FIRING WHILE IT BUILDS', 4.6);
      motes(13.4, 7, 150, { amp: 8, gap: 40 }); motes(15, 8, 360, { amp: 8, gap: 40 }); motes(16.6, 7, 570, { amp: 8, gap: 40 }); lancers(18.5, [200, 520]);
      msg(21, 'SHIELDED PICKET', 'ITS SHIELD EATS YOUR SHOTS — PHASE IN AND BREAK THE GENERATOR', 3.6);
      hold(21.5, 'bulwark', 260, 1000, 10); motes(23.5, 6, 520, { amp: 40 }); hold(25.5, 'weaver', 560, 1080, 7);
      swoop(27, 6, true); hold(29, 'bulwark', 180, 1040, 9); hold(29.5, 'bulwark', 540, 980, 9); motes(32, 8, 360, { amp: 90, drop: 'D', dropAt: 2 });
      hold(36, 'weaver', 360, 1010, 9); swoop(38, 5, false); swoop(40, 5, true);
      hold(44, 'ironclad', 200, 930, 9); hold(45, 'ironclad', 530, 990, 9); motes(46, 10, 360, { amp: 50, spd: 210, drop: 'WS', dropAt: 3 });
      lancers(52, [150, 360, 570]); motes(55, 10, 300, { amp: 150 }); motes(57, 10, 440, { amp: 150 });
      hold(60, 'weaver', 200, 1040, 9); hold(60.5, 'weaver', 520, 1040, 9); hold(62, 'bulwark', 360, 960, 9);
      msg(68.5, 'THEY JUST KEEP COMING', '', 2.2);
      motes(69, 9, 140, { amp: 30 }); motes(69.5, 9, 290, { amp: 30 }); motes(70, 9, 440, { amp: 30 }); motes(70.5, 9, 590, { amp: 30 });
      lancers(71.5, [220, 500]); hold(72, 'ironclad', 360, 960, 10);
      lancers(78, [120, 280, 440, 600]);
      hold(82, 'ironclad', 180, 900, 9); hold(82.5, 'ironclad', 540, 900, 9); hold(83, 'bulwark', 360, 1040, 9); swoop(85, 6, true); swoop(86.5, 6, false);
    }
  });

  /* ---------------- STAGE 2 ---------------- */
  defineStage({
    id: 'foundry',
    name: 'THE FOUNDRY FLEET',
    boss: 'leviathan',
    hue: 12,
    music: { key: 41, bpm: 128, busy: true },
    bulletSpeed: 1.09, tier: 2, minGun: 3,
    end: 105,
    script({ motes, swoop, lancers, hold, msg }) {
      // power-ups: LANCE at the door (armoured frigates follow), a drone (or its upgrade) at ~47s
      motes(2, 8, 200, { amp: 80, drop: 'WL', dropAt: 2 }); motes(3, 8, 520, { amp: 80 }); lancers(6, [160, 360, 560]);
      msg(9, 'LANCE FRIGATE', 'ITS BEAM IS TELEGRAPHED — SIDESTEP IT, OR PHASE THROUGH IT', 3.4);
      hold(9.5, 'scythe', 360, 1040, 11); swoop(12, 6, true);
      hold(16, 'ironclad', 200, 950, 9); hold(16, 'bulwark', 520, 1010, 9); motes(18, 10, 360, { amp: 140 });
      hold(23, 'scythe', 160, 1060, 10); hold(23.5, 'scythe', 560, 1060, 10); lancers(26, [260, 460]);
      msg(30, 'SWARM CARRIER', 'GUT THE HANGAR TO STOP THE SWARM — OR THE REACTOR TO END IT', 3.4);
      hold(30.5, 'carrier', 360, 1020, 16); swoop(34, 5, true); swoop(36, 5, false);
      hold(42, 'weaver', 180, 980, 10); hold(42, 'weaver', 540, 980, 10); hold(44, 'ironclad', 360, 1040, 10); motes(46, 12, 360, { amp: 200, spd: 200, drop: 'D', dropAt: 4 });
      lancers(51, [100, 230, 360, 490, 620]);
      hold(55, 'bulwark', 150, 1000, 10); hold(55.3, 'bulwark', 360, 940, 10); hold(55.6, 'bulwark', 570, 1000, 10); hold(57, 'scythe', 260, 1100, 9);
      msg(64, 'DIMENSIONAL ANCHOR', 'YOU CANNOT PHASE INSIDE ITS FIELD — KILL IT IN THE PLANE', 4.4, true);
      hold(64.5, 'anchor', 360, 760, 22, { bob: 60 }); hold(66.5, 'ironclad', 300, 1010, 14); motes(68, 8, 580, { amp: 40, drop: 'W' }); motes(70, 8, 110, { amp: 40 });
      hold(78, 'carrier', 220, 1040, 15); hold(79, 'scythe', 560, 1060, 10); lancers(82, [400, 600]);
      hold(88, 'anchor', 300, 700, 18, { bob: 50 }); hold(89, 'weaver', 160, 1000, 10); hold(89, 'weaver', 560, 1000, 10); hold(90, 'ironclad', 420, 960, 10);
      motes(96, 10, 200, { amp: 60 }); motes(97, 10, 520, { amp: 60 }); lancers(100, [160, 360, 560]);
    }
  });

  /* ---------------- STAGE 3 ---------------- */
  defineStage({
    id: 'armada',
    name: 'THE ARMADA ENTIRE',
    boss: 'maw',
    // if this is the last stage, the victory screen shows the flagship painting (else: the last stage's own boss)
    victory: { backdrop: 'flagship', sprite: 'maw' },
    hue: 275,
    music: { key: 36, bpm: 136, busy: true },
    bulletSpeed: 1.18, tier: 3, minGun: 3,
    end: 112,
    script({ motes, swoop, lancers, hold, msg }) {
      // power-ups: SEEKER at the door, a drone at ~25s, a weapon capsule at ~64s (bastions and carriers also drop bonuses)
      motes(2, 10, 150, { amp: 40, spd: 210 }); motes(2.5, 10, 360, { amp: 40, spd: 210, drop: 'WK', dropAt: 3 }); motes(3, 10, 570, { amp: 40, spd: 210 }); lancers(6, [200, 360, 520]);
      hold(9, 'ironclad', 180, 960, 9); hold(9, 'ironclad', 540, 960, 9); hold(10, 'scythe', 360, 1080, 10); swoop(12, 7, true); swoop(13, 7, false);
      msg(18, 'BASTION DREADNOUGHT', 'BRIDGE BLINDS IT · MAGAZINE BREAKS ITS GUNS · REACTOR ENDS IT', 4.2);
      hold(18.5, 'bastion', 360, 1000, 20); motes(24, 8, 110, { amp: 30, drop: 'D' }); motes(26, 8, 610, { amp: 30 });
      hold(36, 'anchor', 260, 740, 16, { bob: 70 }); hold(37, 'bulwark', 200, 1000, 10); hold(37, 'bulwark', 520, 1000, 10); hold(38, 'weaver', 360, 1060, 10); lancers(42, [120, 600]);
      hold(47, 'carrier', 200, 1040, 15); hold(48, 'carrier', 540, 1060, 15); lancers(52, [360]); swoop(55, 6, true);
      hold(62, 'scythe', 120, 1080, 10); hold(62.4, 'scythe', 360, 1040, 10); hold(62.8, 'scythe', 600, 1080, 10); motes(64, 12, 360, { amp: 220, spd: 220, drop: 'W', dropAt: 4 });
      hold(71, 'anchor', 360, 640, 18, { bob: 120 }); hold(72, 'ironclad', 160, 930, 11); hold(72, 'ironclad', 560, 930, 11); hold(73, 'weaver', 360, 1080, 10);
      lancers(79, [100, 230, 360, 490, 620]);
      hold(84, 'bastion', 240, 1040, 20); hold(86, 'carrier', 570, 1060, 15);
      msg(91.5, 'THE SKY IS FULL OF THEM', '', 2.2);
      motes(92, 10, 130, { amp: 30, spd: 200 }); motes(92.5, 10, 280, { amp: 30, spd: 200 }); motes(93, 10, 430, { amp: 30, spd: 200 }); motes(93.5, 10, 580, { amp: 30, spd: 200 });
      hold(96, 'anchor', 460, 720, 14, { bob: 90 });
      lancers(101, [200, 520]); hold(104, 'ironclad', 360, 960, 9); hold(104, 'bulwark', 160, 1040, 9); hold(104, 'bulwark', 560, 1040, 9);
    }
  });

  /* ---------------- title / victory screens, default horizon ---------------- */
  defineScreens({
    // enemy ids whose silhouettes drift on the horizon (stages may override with their own `armada`)
    armada: ['ironclad', 'bastion', 'carrier', 'scythe', 'warden', 'bastion'],
    // backdrop = image asset (data/assets.js); sprite = enemy/boss id drawn instead while the image is unavailable
    title: { hue: 215, armadaCount: 16, backdrop: 'flagship', sprite: 'maw' },
    // the wreck art is NOT set here: it is the last stage's boss (or that stage's own victory: {...} block, see stage 3)
    victory: {
      title: 'THE ARMADA IS A HOLE IN THE PLANE',
      line: 'One ship. Three dimensions. No survivors with armour.'
    }
  });
})();
