/* ============================================================
   EXTRADIMENSIONAL — a flat universe, one ship that can leave it
   js/core.js : the shared namespace, constants, game state, input,
                and the REGISTRIES every data file writes into.

   Everything in the game lives on one global object, window.XD.
   Engine files (js/*.js) add functions to it; data files (data/*.js)
   call XD.defineEnemy / definePattern / defineBoss / defineStage /
   definePickup / defineSystem / defineAssets to describe content.
   See MODDING.md for the full file map and field reference.
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD = window.XD || {};

  /* ---------------- constants & small maths ---------------- */
  const TAU = Math.PI * 2;
  const W = 1280, H = 720;          // logical canvas size (the canvas is CSS-scaled to fit the window)
  const DT = 1 / 60;                // fixed simulation step
  const MAX_GUN = 4;                // highest gun level
  // the play field: keeps the ship clear of the HUD strips
  const XMIN = 30, XMAX = W - 22, YMIN = 50, YMAX = H - 56;

  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  // rnd() -> 0..1, rnd(a) -> 0..a, rnd(a,b) -> a..b
  const rnd = (a, b) => b === undefined ? Math.random() * (a === undefined ? 1 : a) : a + Math.random() * (b - a);
  // deterministic pseudo-random 0..1 from a number (used for procedural art, so sprites are stable)
  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  // unit polygon of an n-pointed star (inner radius r2), handy for hull outlines
  function starPoly(n, r2) {
    const p = [];
    for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU, r = i % 2 ? r2 : 1; p.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return p;
  }

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');

  /* ---------------- palette & fonts (manga ink) ---------------- */
  const INK = '#07080b', PAPER = '#ebe7da', BONE = '#ece8dc';
  const F_HEAD = 'Impact, "Arial Black", "Helvetica Neue", sans-serif';
  const F_MONO = 'Consolas, "Courier New", monospace';

  /* ---------------- global game state ---------------- */
  const G = {
    scene: 'title',           // 'title' | 'play' | 'pause' | 'gameover' | 'victory'
    time: 0,                  // seconds of simulated time since load
    stage: 1,                 // 1-based index into XD.STAGES
    stageTime: 0,             // position on the stage timeline (stops while the tutorial holds it)
    score: 0, hi: 0, lives: 3, continues: 3,
    mult: 1, multT: 0, chain: 0, kills: 0,      // gut chain (score multiplier) and its decay timer
    energy: 1,                // phase drive charge 0..1
    phased: false,            // true while the ship is above the plane
    ph: 0,                    // smoothed 0..1 "how far out of the plane" used by the renderer
    needRelease: false,       // phase key must be released before the drive can re-engage
    shake: 0, flash: 0, flashCol: '#fff',
    script: [], si: 0,        // current stage timeline and the index of the next event
    hold: false,              // the timeline is waiting on a tutorial ship
    bossSpawned: false, bossWarn: 0, atBoss: false, boss: null,
    clearT: 0, overT: 0, victoryT: 0,
    tutorialDone: false, fodderKills: 0,
    invincible: false, infiniteEnergy: false, timeScale: 1,   // debug cheats (window.__game)
    autofire: true, fps: 60,
    banner: null, prompt: null,
    phFx: 9,                  // time since the last phase-in (drives the shock-front effect)
    holdT: 0, cpGun: 0, anchored: false, deniedT: 0, seenAnchor: false, seenShield: false,
    startTime: 0, endTime: 0, deaths: 0,
    bank: 0,                  // enemy bullets absorbed while phased, waiting to be released as a burst
    bankPending: false,       // the burst is held back until the ship has been thrown clear of a hull
    taught: {},               // one-line lessons already shown this run (XD.teach)
    teachQ: [],               // lessons waiting for a quiet moment (no other banner, ship back in the plane)
    seenWeapons: {},          // weapon ids met this run (equipped, or their pickup dropped): the W capsule only offers these
    bossDeaths0: 0,           // G.deaths when the current boss arrived (for the flawless bonus)
    cpBoss: null,             // boss progress remembered for continues: { type, stage, dead: [system names] }
    tm: {}, cn: {}            // timers/counters for XD.every(G, ...)
  };
  try { G.hi = parseInt(localStorage.getItem('extradimensional_hi') || '0', 10) || 0; } catch (e) { G.hi = 0; }
  function saveHi() {
    if (G.score > G.hi) {
      G.hi = Math.floor(G.score);
      try { localStorage.setItem('extradimensional_hi', String(G.hi)); } catch (e) { /* storage may be blocked on file:// */ }
    }
  }

  /* ---------------- the player ship ---------------- */
  const P = {
    x: 200, y: 360, alive: true,
    inv: 0,            // post-respawn invulnerability (s)
    respawn: 0,        // time until respawn (s)
    gun: 1,            // gun level 1..MAX_GUN
    fireT: 0, fireT3: 0,   // cooldowns: flat gun / 3-D weapon
    phaseLock: 0,      // drive lock-out after dropping back into the plane
    grace: 0,          // short invulnerability after re-entry
    eject: 0,          // time left being thrown clear of a hull
    lockE: null, lockC: null,     // 3-D weapon lock: enemy and component
    retX: 200, retY: 360,         // reticle position
    tilt: 0, overHull: null, sinceEj: 9, ejShock: false,
    trail: [],
    weapon: 'pulse',   // id of the equipped main gun (XD.WEAPONS)
    charge: 0,         // charge shot 0..1
    chargeFx: 0,       // time since the last charged release (muzzle flash)
    drill: 0,          // seconds the 3-D weapon has stayed on the same system (weapons with `above.ramp`)
    tm: {}, cn: {}     // timers/counters for XD.every(P, ...)
  };

  /* ---------------- the tether drone (companion pod) ----------------
     level 0 = none.  mode: 'follow' (with the ship in the plane), 'anchor' (left behind in the plane
     while the ship is phased: decoy + gun), 'recall' (snapping back to the ship). */
  const DRONE = { level: 0, mode: 'follow', x: 0, y: 0, hp: 0, down: 0, regen: 0, fireT: 0, side: 1, hitIds: {}, flash: 0, t: 0 };

  /* ---------------- entity lists ---------------- */
  const enemies = [], bullets = [], bpool = [], shots = [], lasers = [], pickups = [];
  const shards = [], parts = [], booms = [], popups = [], walls = [];
  const zaps = [];     // short-lived beam / arc effects: { x0, y0, x1, y1, w, col, t, max }
  const laters = [];   // delayed callbacks: { t, f } (XD.later)

  /* ---------------- input ---------------- */
  const keys = {}, pressed = {};
  const GAMEKEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyZ', 'KeyX', 'KeyJ', 'KeyK',
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Enter', 'Escape', 'KeyP', 'KeyM', 'KeyF', 'KeyC', 'KeyL']);
  addEventListener('keydown', e => {
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
    if (GAMEKEYS.has(e.code)) e.preventDefault();
    XD.audioInit();
  });
  addEventListener('keyup', e => { keys[e.code] = false; if (GAMEKEYS.has(e.code)) e.preventDefault(); });
  // losing focus releases every key and pauses the game (a held charge is dropped, not fired, when play resumes)
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; P.charge = 0; if (G.scene === 'play') G.scene = 'pause'; });
  addEventListener('mousedown', () => XD.audioInit());
  const inp = {
    get l() { return keys.ArrowLeft || keys.KeyA; },
    get r() { return keys.ArrowRight || keys.KeyD; },
    get u() { return keys.ArrowUp || keys.KeyW; },
    get d() { return keys.ArrowDown || keys.KeyS; },
    get fire() { return G.autofire || keys.KeyZ || keys.KeyJ; },
    // charge shot: with auto-fire on (the default) holding the fire key charges; with manual fire
    // (F) the fire key shoots, so the charge lives on C / L — which work in both modes
    get charge() { return !!(keys.KeyC || keys.KeyL || (G.autofire && (keys.KeyZ || keys.KeyJ))); },
    get phase() { return keys.Space || keys.KeyX || keys.KeyK; },
    get focus() { return keys.ShiftLeft || keys.ShiftRight; }
  };
  // the name of the key that charges right now, for on-screen text
  const chargeKeyName = () => (G.autofire ? 'Z' : 'C');

  // content mistakes (unknown ids, missing fields) are reported once each on the console — and counted,
  // so the title screen can say "see the console" to someone who just double-clicked index.html
  const WARNED = {};
  function warn(msg) {
    if (WARNED[msg]) return;
    WARNED[msg] = true; XD.warnings = (XD.warnings || 0) + 1;
    if (window.console) console.warn('XD: ' + msg);
  }
  // A script file that does not load at all (wrong path, a syntax error, an exception while it registers) takes
  // everything it defines with it, silently. Count it as a content warning so the title screen points at the console.
  // (Only while the page is loading; from file:// the browser may hide the message itself — F12 shows it.)
  addEventListener('error', ev => {
    if (document.readyState === 'complete') return;
    const el = ev.target;
    if (el && el.tagName === 'SCRIPT') warn('script file "' + el.getAttribute('src') + '" could not be loaded (check the path in index.html)');
    else if (el === window || !el || !el.tagName) warn('a script file stopped with an error while loading' + (ev.message && ev.message !== 'Script error.' ? ': ' + ev.message : '') + (ev.filename ? '  (' + String(ev.filename).split('/').pop() + (ev.lineno ? ':' + ev.lineno : '') + ')' : '') + ' — nothing it defines exists');
  }, true);

  /* ---------------- per-object timers ----------------
     every(obj, key, period) -> true once per `period` seconds of calls (call it every tick).
     It also counts how many times it has fired in obj.cn[key], which patterns use to alternate. */
  function every(o, k, p) {
    o.tm[k] = (o.tm[k] || 0) + DT;
    if (o.tm[k] >= p) { o.tm[k] -= p; o.cn[k] = (o.cn[k] || 0) + 1; return true; }
    return false;
  }

  /* ============================================================
     REGISTRIES
     ============================================================ */

  /* ---- enemies (and bosses): XD.TYPES[id] ---- */
  const TYPES = {};
  function defineEnemy(id, def) {
    const T = Object.assign({}, def);
    T.key = id;
    T.comps = T.comps || [];
    if (T.pattern === undefined) T.pattern = id;   // by default an enemy fires the pattern that shares its id
    TYPES[id] = T;
    return T;
  }

  /* ---- bosses: an enemy definition plus `phases` ----
     Each phase lists the systems that are open during it; they are flattened into the ordinary
     component table with the phase index attached, so the rest of the engine treats a boss hull
     like any other ship whose components unlock in sequence. */
  function defineBoss(id, def) {
    const T = Object.assign({ hp: 1e9, armor: 0, tx: 900, bob: 60 }, def);
    T.boss = true;
    T.phases = T.phases || [];
    T.comps = [];
    T.phases.forEach((ph, i) => {
      for (const s of (ph.systems || [])) T.comps.push([s[0], s[1], s[2], s[3], s[4], i]);
    });
    T.key = id;
    T.pattern = null;   // bosses are driven by XD.bossFire (js/bosses.js), not by a named pattern
    TYPES[id] = T;
    return T;
  }

  /* ---- bullet patterns: XD.PATTERNS[id] = function (e) called every tick for a live enemy ---- */
  const PATTERNS = {};
  function definePattern(id, fn) { PATTERNS[id] = fn; return fn; }

  /* ---- movement behaviours: XD.AIS[id] = function (e) called every tick; selected by e.ai ---- */
  const AIS = {};
  function defineAI(id, fn) { AIS[id] = fn; return fn; }

  /* ---- internal systems (component kinds): label, colour, icon and what destroying one does ---- */
  const SYSTEMS = {};
  function defineSystem(kind, def) { SYSTEMS[kind] = Object.assign({ label: kind.toUpperCase(), color: '#ffb030', krak: 'KRAK!' }, def); return SYSTEMS[kind]; }
  const systemOf = kind => SYSTEMS[kind] || SYSTEMS.core || { label: String(kind).toUpperCase(), color: '#ffb030', krak: 'KRAK!' };

  /* ---- pickups: XD.PICKUPS[id] ---- */
  const PICKUPS = {};
  function definePickup(id, def) {
    PICKUPS[id] = Object.assign({ color: '#7dff6a', label: id, labelSize: 13, shape: 'diamond', spin: 0 }, def);
    return PICKUPS[id];
  }
  // which pickups the engine's own drop rules hand out (see data/pickups.js)
  const DROPS = { cell: 'E', upgrade: 'P', capitalCellChance: 0.3, fodderEvery: 16, fodderUpgradeEvery: 110, fodderUpgradeAt: 90, stageClear: [],
    bonus: null, fodderSpecials: [] };
  function setDropRules(rules) { Object.assign(DROPS, rules); }
  // the first pickup id in `ids` (an id or a list of ids) that would be useful right now, or null
  function firstUseful(ids) {
    if (!ids) return null;
    for (const id of (Array.isArray(ids) ? ids : [ids])) if (pickupUseful(id)) return id;
    return null;
  }

  /* ---- weapons (main guns): XD.WEAPONS[id]; P.weapon is the equipped id ----
     See data/weapons.js for the fields. A run starts with XD.setStartWeapon(id), or else the first weapon defined. */
  const WEAPONS = {}, WEAPON_ORDER = [];
  const START = { weapon: null };
  function setStartWeapon(id) { START.weapon = id; }
  const startWeapon = () => (START.weapon && WEAPONS[START.weapon] ? START.weapon : WEAPON_ORDER[0]) || 'pulse';
  function defineWeapon(id, def) {
    const Wd = Object.assign({ name: id.toUpperCase(), letter: id[0].toUpperCase(), color: '#39d5ff', core: '#ffffff' }, def);
    Wd.id = id;
    Wd.plane = Object.assign({ interval: 5 / 60, volley: () => [] }, def.plane || {});
    Wd.above = Object.assign({ interval: 4 / 60, damage: 1.15, reach: 48, fodderReach: 40, targets: 1, share: 1, ramp: null, sticky: 0, hull: 0.55 }, def.above || {});
    if (!WEAPONS[id]) WEAPON_ORDER.push(id);
    WEAPONS[id] = Wd;
    // its pickup: a lettered square in the weapon's colour that equips it
    if (Wd.pickup) definePickup(Wd.pickup, { color: Wd.color, label: Wd.letter, labelSize: 16, shape: 'square', weapon: id, optional: true,
      useful: () => P.weapon !== id, collect() { XD.equipWeapon(id); } });
    return Wd;
  }
  const weaponDef = id => WEAPONS[id === undefined ? P.weapon : id] || WEAPONS[WEAPON_ORDER[0]];

  /* ---- arsenal tuning: the drone, the charge shot, the absorb burst (data/weapons.js sets these) ---- */
  const ARSENAL = { drone: { levels: [null] }, charge: { lance: {}, blast: {} }, absorb: {} };
  function setArsenal(t) { for (const k in t) ARSENAL[k] = Object.assign(ARSENAL[k] || {}, t[k]); }

  /* ---- gut chain (score multiplier) rules, see XD.chainAdd in js/fx.js ---- */
  const CHAIN = {
    max: 99,            // hard cap
    hold: 5,            // seconds a gut keeps the chain alive
    warm: 1.2,          // seconds a mere kill in the plane keeps it alive (never more than `hold`)
    bleed: 0.004,       // constant leak per second, as a fraction of the chain (so high chains are harder to keep)
    lapse: 0.3, lapseFrac: 0.07,   // once the timer runs out: lose `lapse` + `lapseFrac` x chain per second
    deathKeep: 0.5,     // fraction of the chain that survives losing a ship
    system: 0.25, bossSystem: 0.5, // an internal system destroyed (ordinary ship / boss)
    bossKillCap: 8,                // a boss kill pays its score x min(chain, this), once
    gut: 0.5, gutFodder: 0.03,     // a ship killed from inside (capital / fodder)
    side: 0.25, fullGut: 0.5,      // per wrecked side system on a gutted ship; extra for wrecking all of them
    kill: 0.1, killFodder: 0.01,   // a ship shot down in the plane (capital / fodder)
    leftBehind: 0.5                // an engine-killed ship dropped off the screen
  };
  function setChainRules(r) { Object.assign(CHAIN, r); }
  // true when picking this up would actually do something for the player (e.g. a gun upgrade below max level)
  function pickupUseful(id) { const d = PICKUPS[id]; return !!d && (!d.useful || d.useful()); }

  /* ---- stages: XD.STAGES is the ORDERED list; G.stage is a 1-based index into it ----
     defineStage(def)                      appends (or, if def.id names an existing stage, replaces it in place)
     defineStage(def, { before: id })      inserts before the stage with that id   ({ after: id } / { replace: id } likewise)
     Fields a definition leaves out (bulletSpeed, tier, minGun, music, armadaCount) default from the stage's CURRENT
     position in the list, so inserting a stage re-derives them for every stage after it. */
  const STAGES = [];
  function stageDefaults(n) {
    return {
      id: null,                          // optional name other files can refer to (before / after / replace)
      name: 'STAGE ' + n,
      boss: null,                        // boss id (XD.defineBoss) that ends the stage
      hue: 215,                          // backdrop hue
      backdrop: null,                    // optional asset name painted over the backdrop gradient
      bulletSpeed: 1 + 0.09 * (n - 1),   // XD.bs(): multiplier patterns apply to bullet speeds
      tier: n,                           // XD.tier(): difficulty tier patterns may branch on
      minGun: n >= 2 ? 3 : 2,            // dying / continuing never leaves you below this gun level
      armadaCount: 10 + n * 6,           // far-off silhouettes on the horizon
      armada: null,                      // enemy ids used for those silhouettes (null = XD.SCREENS.armada)
      end: 90,                           // timeline length in seconds; the boss arrives after it
      victory: null,                     // { backdrop, sprite, title, line } for the victory screen if this is the LAST stage
      script: function () {}
    };
  }
  function renumberStages() {
    STAGES.forEach((S, i) => {
      const n = i + 1, def = S.def;
      Object.assign(S, stageDefaults(n), def);
      S.music = Object.assign({ key: 38, bpm: 112 + n * 8, busy: n >= 2 }, def.music || {});
      S.index = n;
    });
  }
  function defineStage(def, where) {
    const S = { def };
    const find = id => STAGES.findIndex(s => s.id === id);
    let i = STAGES.length, ref;
    where = where || (def.id && find(def.id) >= 0 ? { replace: def.id } : null);
    if (where) {
      ref = where.replace !== undefined ? where.replace : (where.before !== undefined ? where.before : where.after);
      const j = find(ref);
      if (j < 0) warn('defineStage: no stage with id "' + ref + '" (' + (def.id || def.name || 'stage') + ' was added at the end)');
      else if (where.replace !== undefined) { STAGES.splice(j, 1); i = j; }
      else i = where.before !== undefined ? j : j + 1;
    }
    STAGES.splice(i, 0, S);
    renumberStages();
    return S;
  }
  const stageDef = n => STAGES[clamp((n === undefined ? G.stage : n) | 0, 1, STAGES.length) - 1];
  const bs = () => stageDef().bulletSpeed;   // bullet speed scale of the current stage
  const tier = () => stageDef().tier;        // difficulty tier of the current stage

  /* ---- title / victory screens, shared backdrop settings, and the engine's own banner text ---- */
  const SCREENS = {
    armada: [],                                                    // default horizon silhouettes
    title: { hue: 215, armadaCount: 16, backdrop: null, sprite: null },
    // the wreck on the victory screen is the LAST stage's boss unless backdrop / sprite say otherwise
    // (a stage's own victory: {...} block, used when it is the last stage, overrides these)
    victory: { backdrop: null, sprite: null, title: 'VICTORY', line: '' },
    // banner text the engine shows by itself; each entry is [title, subtitle] (or a function returning that)
    text: {
      stageBanner: n => ['STAGE ' + n, XD.stageDef(n).name],
      warning: ['WARNING', 'CAPITAL SHIP ON APPROACH'],
      tutorialDone: ['THAT IS YOUR ONE EDGE', 'THE DRIVE RECHARGES IN THE PLANE — GRAZE BULLETS TO CHARGE IT FASTER'],
      bossIntro: labels => ['ARMOUR ABSOLUTE', 'FLY IN CLOSE, THEN PHASE INSIDE — DESTROY: ' + labels],
      breached: labels => ['BULKHEADS BREACHED', 'NEXT: ' + labels],
      resumed: labels => ['BULKHEADS ALREADY BREACHED', 'WHAT YOU WRECKED STAYS WRECKED — OPEN: ' + labels],
      stageClear: n => ['STAGE ' + n + ' CLEAR', 'THE HOLE YOU MADE IS ALREADY CLOSING']
    }
  };
  function defineScreens(def) {
    if (def.armada) SCREENS.armada = def.armada;
    if (def.title) Object.assign(SCREENS.title, def.title);
    if (def.victory) Object.assign(SCREENS.victory, def.victory);
    if (def.text) Object.assign(SCREENS.text, def.text);
  }
  // SCREENS.text[key] resolved to [title, subtitle]
  function screenText(key, arg) { const v = SCREENS.text[key], r = typeof v === 'function' ? v(arg) : v; return Array.isArray(r) ? r : [String(r || ''), '']; }

  /* ---- run rules: lives, continues, ranks ---- */
  const RULES = {
    lives: 3, continues: 3,
    bossContinueMinGun: 3,       // a continue AT a boss never brings you back below this gun level
    // victory rank by ships lost PER STAGE (so it scales with the number of stages): first entry whose limit is not exceeded
    ranks: [['S', 0], ['A', 1], ['B', 8 / 3]], lastRank: 'C'
  };
  function setRunRules(r) { Object.assign(RULES, r); }

  /* ---- image assets: XD.ASSETS[name] = { src, img, ready, failed } ----
     Nothing in the game REQUIRES an image: every consumer asks assetImage(name) and falls back to
     procedural art while it is null (still loading, missing file, blocked, decode error...). */
  const ASSETS = {};
  function defineAsset(name, src) { ASSETS[name] = { name, src, img: null, ready: false, failed: false, waiters: [] }; return ASSETS[name]; }
  function defineAssets(map) { for (const k in map) defineAsset(k, map[k]); }
  function loadAssets() {
    for (const k in ASSETS) {
      const a = ASSETS[k];
      if (a.img) continue;
      a.img = new Image();
      a.img.onload = () => {
        a.ready = true;
        for (const fn of a.waiters.splice(0)) { try { fn(a); } catch (e) { /* a failed sprite build just leaves the procedural art in place */ } }
      };
      // (console.info, not warn: a missing image is allowed — but a modder should be able to see WHICH one)
      a.img.onerror = () => { a.failed = true; if (window.console) console.info('XD: image "' + a.name + '" (' + a.src + ') did not load — using procedural art'); };
      try { a.img.src = a.src; } catch (e) { a.failed = true; }
    }
  }
  // run fn(asset) once the named asset has loaded (never runs if it fails or is not in the manifest)
  function whenAsset(name, fn) {
    const a = ASSETS[name];
    if (!a) return;
    if (a.ready) fn(a); else a.waiters.push(fn);
  }
  const assetImage = name => { const a = name && ASSETS[name]; return a && a.ready ? a.img : null; };
  // true once every asset has settled (loaded or failed) and at least one of them loaded
  const assetsLoaded = () => { let n = 0; for (const k in ASSETS) { const a = ASSETS[k]; if (!a.ready && !a.failed) return false; if (a.ready) n++; } return n > 0; };
  // { name: 'ready' | 'failed' | 'loading' }
  const assetStatus = () => { const o = {}; for (const k in ASSETS) o[k] = ASSETS[k].ready ? 'ready' : (ASSETS[k].failed ? 'failed' : 'loading'); return o; };

  /* ---- validation: called once at boot (js/main.js). Reports content mistakes by id; never throws. ---- */
  function validate() {
    const need = (o, what, fields) => { for (const f of fields) if (o[f] === undefined) warn(what + ' is missing "' + f + '"'); };
    for (const id in TYPES) {
      const T = TYPES[id], what = (T.boss ? 'boss "' : 'enemy "') + id + '"';
      need(T, what, T.boss ? ['rw', 'rh', 'poly', 'score', 'glow', 'name'] : ['rw', 'rh', 'poly', 'hp', 'armor', 'score', 'glow']);
      for (const c of T.comps) if (!SYSTEMS[c[0]]) warn(what + ' has a system of unknown kind "' + c[0] + '" (XD.defineSystem; it will behave like a plain core)');
      if (!T.boss && T.pattern && !PATTERNS[T.pattern] && (T.pattern !== id || T.guns)) warn(what + ' names pattern "' + T.pattern + '", which is not defined (XD.definePattern): it will never fire');
      if (T.art) for (const k of ['image', 'exterior', 'cutaway']) if (T.art[k] && !ASSETS[T.art[k]]) warn(what + ' art.' + k + ' names asset "' + T.art[k] + '", which is not in the manifest (XD.defineAssets)');
      if (T.boss) T.phases.forEach((ph, i) => {
        if ((!ph.systems || !ph.systems.length) && !ph.clearWhen) warn(what + ' phase ' + i + ' has no systems and no clearWhen: it can never end');
        for (const r of [].concat(ph.reward || [])) if (!PICKUPS[r]) warn(what + ' phase ' + i + ' reward "' + r + '" is not a pickup (XD.definePickup)');
        for (const a of ph.anchors || []) if (a.type && !TYPES[a.type]) warn(what + ' phase ' + i + ' anchor type "' + a.type + '" is not defined');
      });
    }
    STAGES.forEach((S, i) => {
      const what = 'stage ' + (i + 1) + ' ("' + S.name + '")';
      if (S.boss && !TYPES[S.boss]) warn(what + ' names boss "' + S.boss + '", which is not defined: the stage will end without one');
      else if (S.boss && !TYPES[S.boss].boss) warn(what + ' boss "' + S.boss + '" was made with defineEnemy, not defineBoss');
      if (S.backdrop && !ASSETS[S.backdrop]) warn(what + ' backdrop "' + S.backdrop + '" is not in the asset manifest');
      if (typeof S.script !== 'function') warn(what + ' script is not a function');
    });
    for (const id of WEAPON_ORDER) if (typeof WEAPONS[id].plane.volley !== 'function') warn('weapon "' + id + '" plane.volley is not a function');
    if (START.weapon && !WEAPONS[START.weapon]) warn('setStartWeapon: no weapon "' + START.weapon + '"');
    for (const k of ['cell', 'upgrade']) if (!PICKUPS[DROPS[k]]) warn('drop rule ' + k + ' names pickup "' + DROPS[k] + '", which is not defined');
    for (const r of [].concat(DROPS.bonus || [], DROPS.stageClear.map(d => d[0]), DROPS.fodderSpecials.map(d => d.id))) if (!PICKUPS[r]) warn('drop rules name pickup "' + r + '", which is not defined');
    for (const scr of ['title', 'victory']) if (SCREENS[scr].backdrop && !ASSETS[SCREENS[scr].backdrop]) warn(scr + ' screen backdrop "' + SCREENS[scr].backdrop + '" is not in the asset manifest');
    return XD.warnings || 0;
  }

  Object.assign(XD, {
    TAU, W, H, DT, MAX_GUN, XMIN, XMAX, YMIN, YMAX, clamp, lerp, rnd, hash, starPoly, canvas, ctx,
    INK, PAPER, BONE, F_HEAD, F_MONO,
    G, P, DRONE, saveHi, enemies, bullets, bpool, shots, lasers, pickups, shards, parts, booms, popups, walls, zaps, laters,
    keys, pressed, inp, every, chargeKeyName, warn, validate,
    WEAPONS, WEAPON_ORDER, defineWeapon, weaponDef, setStartWeapon, startWeapon, RULES, setRunRules, screenText, ARSENAL, setArsenal, CHAIN, setChainRules, firstUseful,
    TYPES, defineEnemy, defineBoss, PATTERNS, definePattern, AIS, defineAI, SYSTEMS, defineSystem, systemOf,
    PICKUPS, definePickup, DROPS, setDropRules, pickupUseful,
    STAGES, defineStage, stageDef, bs, tier, SCREENS, defineScreens,
    ASSETS, defineAsset, defineAssets, loadAssets, whenAsset, assetImage, assetsLoaded, assetStatus
  });
})();
