/* PokéBonk 离线版 · 手机端本地 API 层
 *
 * APK 里没有 Node，所以把电脑版 server.mjs + lib/api-*.mjs 的接口实现搬到浏览器里：
 * 在游戏代码之前执行，接管 window.fetch 对 /api/* 的请求，用 localStorage 存账号和存档。
 *
 * 官网排行榜需要登录态且不给跨域，浏览器拿不到，所以走原生桥：
 *   window.PBAndroid.officialGet(path)  —— APK 里由 Java 同步返回响应体字符串
 *   /__official + path                  —— 电脑上测试时的替代通道
 * 两个都没有（离线）时自动回退到本地榜单。
 */
(function () {
  'use strict';

  /* PB_PRICES:BEGIN (自动生成，勿手改) */
// 由 android/dev/extract-prices.mjs 从游戏包自动生成，请勿手改。
// 来源: main-CPuTGAQ--mvlr7rzv.js + news-CbTCXK8Y-mvlr7rzv.js
// 价格规则: we(x) = round(x * 0.85 / 5) * 5（游戏内 85 折 + 取整到 5）
const we = (x) => Math.round((x * 0.85) / 5) * 5;
const TABLE = { get: (a, i) => a[Math.min(i, a.length - 1)] };
const LAB_ITEMS = {
  'slot-move': { max: 1, cost: () => we(1500) },
  'slot-vit': { max: 2, cost: (lv) => we(TABLE.get([1200,3000], lv)) },
  'reroll': { max: 6, cost: (lv) => we(120 * 1.4 ** lv) },
  'skip': { max: 6, cost: (lv) => we(80 * 1.4 ** lv) },
  'banish': { max: 6, cost: (lv) => we(150 * 1.4 ** lv) },
  'choice4': { max: 1, cost: () => we(3000) },
  'dmg': { max: 8, cost: (lv) => we(100 * 1.4 ** lv) },
  'hp': { max: 8, cost: (lv) => we(100 * 1.4 ** lv) },
  'spd': { max: 6, cost: (lv) => we(120 * 1.45 ** lv) },
  'xp': { max: 6, cost: (lv) => we(120 * 1.45 ** lv) },
  'gold': { max: 6, cost: (lv) => we(100 * 1.45 ** lv) },
  'luck': { max: 6, cost: (lv) => we(140 * 1.45 ** lv) },
  'magnet': { max: 5, cost: (lv) => we(80 * 1.45 ** lv) },
  'regen': { max: 5, cost: (lv) => we(120 * 1.45 ** lv) },
  'armor': { max: 6, cost: (lv) => we(120 * 1.45 ** lv) },
  'revive': { max: 1, cost: () => we(5000) },
  'research': { max: 4, cost: (lv) => we(250 * 1.6 ** lv) },
  'party': { max: 1, cost: () => we(3500) },
  'archive': { max: 4, cost: (lv) => we(TABLE.get([600,1200,2000,3000], lv)) },
  'crit': { max: 5, cost: (lv) => we(200 * 1.5 ** lv) },
  'atkspd': { max: 5, cost: (lv) => we(220 * 1.5 ** lv) },
  'area': { max: 5, cost: (lv) => we(200 * 1.5 ** lv) },
  'ult': { max: 5, cost: (lv) => we(250 * 1.5 ** lv) },
  'bag': { max: 1, cost: () => we(4000) },
};
const ITEM_PRICES = {
  'soda-pop': 150, 'repel': 150, 'white-flute': 150, 'binding-band': 200, 'metronome': 200, 'smooth-rock': 250,
  'adrenaline-orb': 250, 'awakening': 250, 'old-rod': 300, 'burn-heal': 300, 'ice-heal': 300, 'metal-powder': 300,
  'lemonade': 250, 'secret-key': 300, 'gold-teeth': 300, 'macho-brace': 350, 'focus-band': 350, 'kings-rock': 400,
  'eviolite': 400, 'black-sludge': 400, 'lum-berry': 450, 'stick': 500, 'shed-shell': 500, 'razor-fang': 550,
  'cell-battery': 600, 'bicycle': 500, 'iron-ball': 500, 'fresh-water': 550, 'full-heal': 550, 'guard-spec': 600,
  'coin-case': 600, 'poke-doll': 550, 'dowsing-machine': 600, 'focus-sash': 900, 'comet-shard': 900, 'fire-stone': 1000,
  'thunder-stone': 1000, 'ice-stone': 1000, 'leaf-stone': 1000, 'protector': 1100, 'electirizer': 1100, 'revive': 1200,
  'griseous-orb': 1200, 'reaper-cloth': 1400, 'thick-club': 1100, 'rage-candy-bar': 1100, 'silph-scope': 1200, 'ss-ticket': 1200,
  'max-ether': 1200, 'moon-stone': 2200, 'silver-wing': 2500, 'sun-stone': 2500, 'adamant-orb': 2800, 'lustrous-orb': 2800,
  'soul-dew': 3000, 'dawn-stone': 3200, 'rainbow-wing': 3500, 'poke-flute': 3000, 'tm-case': 3200,
};
/* PB_PRICES:END */

  const API_PREFIX = '/api';
  const STORE_KEY = 'pb.local.store.v1';
  const SESSION_KEY = 'pb.local.session.v1';
  const BOARD_KEY = 'pb.local.boards.v1';
  const STATUS_KEY = 'pb.local.status.v1';
  const BOARD_TTL = 5 * 60 * 1000;
  const STATUS_TTL = 10 * 60 * 1000;
  const MAX_BOARD_AGE = 30 * 24 * 3600 * 1000;

  const origFetch = window.fetch.bind(window);

  // ------------------------------------------------------------ 小工具 ----

  const now = () => Date.now();
  const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const token = () => {
    if (window.crypto?.getRandomValues) return b64(crypto.getRandomValues(new Uint8Array(24)));
    return Math.random().toString(36).slice(2) + now().toString(36);
  };
  const uid = () => {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  };

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('[pb-api] 存档写入失败', e);
    }
  }

  // -------------------------------------------------------------- 存档 ----

  let store = readJson(STORE_KEY, null) || { accounts: {}, runs: {}, nextRun: 1 };
  store.accounts ||= {};
  store.runs ||= {};
  store.nextRun ||= 1;
  let saveTimer = 0;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => writeJson(STORE_KEY, store), 120);
  }

  const accountByToken = (tok) => (tok ? Object.values(store.accounts).find((a) => a.token === tok) || null : null);
  const accountByName = (name) => {
    const k = String(name || '').toLowerCase();
    return Object.values(store.accounts).find((a) => a.name.toLowerCase() === k) || null;
  };

  // -------------------------------------------------------- 账号 / 档案 ----

  const DEFAULT_SETTINGS = {
    master: 0.8, music: 0.5, sfx: 0.7, cries: 0.6, quality: 'high', aimMode: 'auto',
    sensitivity: 1, invertY: false, damageNumbers: true, floatText: true, shakeOn: true,
    screenShake: 1, fov: 70, showFps: false, reduceFlashes: false, pixel: 0,
    muteHidden: true, hudScale: 1, hudOpacity: 1, bossBarOpacity: 1, showBanners: true,
    showMinimap: true, showLadder: true, showToasts: true, showStreak: true,
    showItems: true, mapScale: 1, mapIcons: 1, mapNorthUp: false, fxOpacity: 1,
    ownFxOpacity: 1, camDist: 9, calmCandies: false, pickupFx: 'full',
    skipEmptyLevelUp: false, hideOwnFx: false, fixedStick: false, padRumble: true,
    padDead: 0.15, autoUlt: false, ultPose: true, tours: '', hintsSeen: '', tips: true,
  };

  function newProfile(name) {
    return {
      v: 1, name, created: now(), stardust: 0, totalStardust: 0,
      unlocked: [], league: [], starter: 0, forms: [], research: {}, captured: {},
      seen: [], played: [], shinies: [], skins: [], lab: {}, biomes: { forest: 0 },
      quests: {}, counters: {}, runs: [], best: {}, times: {}, kills: {}, medals: {},
      endless: {}, settings: { ...DEFAULT_SETTINGS }, lastSpecies: 4,
      lastBiome: 'forest', banished: [], itemsOwned: [], itemsOff: [],
      daily: { idx: 0, ids: [], prog: [0, 0, 0], claimed: [0, 0, 0, 0], rerolls: 0 },
      weekly: { idx: 0, ids: [], prog: [0, 0, 0], claimed: [0, 0, 0, 0], rerolls: 0 },
      dailyStreak: { last: 0, n: 0 }, bag: {}, avatar: '', frame: '', title: '',
      cosmetics: [], events: {},
    };
  }
  function newAccount(name, guest) {
    return {
      id: uid(), name, guest: !!guest, token: token(),
      password: null, created: now(), lastSeen: now(), profile: newProfile(name),
    };
  }

  // WebCrypto 不可用时退化为简单哈希（仅本地存档用，不上传）
  async function hashPassword(pw, salt) {
    salt = salt || b64(crypto.getRandomValues(new Uint8Array(16)));
    if (window.crypto?.subtle && window.TextEncoder) {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256,
      );
      return salt + ':' + b64(new Uint8Array(bits));
    }
    let h = 2166136261;
    const s = salt + '|' + pw;
    for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619 >>> 0;
    return salt + ':fnv:' + h.toString(16);
  }
  async function checkPassword(pw, stored) {
    if (!stored) return false;
    const [salt, hash] = stored.split(':');
    if (hash === undefined) return false;
    if (hash.startsWith('fnv')) {
      const again = await hashPassword(pw, salt);
      return again === stored;
    }
    return (await hashPassword(pw, salt)) === stored;
  }

  // ------------------------------------------------------- 赛季 / 活动 ----

  const FALLBACK_SEASON = () => ({
    n: 2, name: '', start: now() - 86400000, end: now() + 15 * 86400000,
    live: true, dust: 1, message: '', next: null,
  });
  const FALLBACK_EVENTS = [{
    id: 'halloween26',
    name: 'La Noche de la Torre Lavanda',
    desc: 'Halloween en Kanto: sube la Torre Pokémon de Pueblo Lavanda piso a piso.',
    color: '#9a6aff', mode: 'tower', biome: 'graveyard',
    start: now() - 86400000, end: now() + 15 * 86400000,
    live: true, claimable: true, state: 'auto',
    points: { name: 'Velas', icon: 'vela' },
    art: {
      tile: 'ui/events/tower-card.jpg', header: 'ui/events/tower.jpg',
      banner: 'ui/events/tower-banner.jpg', icon: 'torre',
    },
  }];

  let season = FALLBACK_SEASON();
  let events = FALLBACK_EVENTS.slice();
  let statusFetchedAt = 0;

  function refreshStatusFromOfficial() {
    if (now() - statusFetchedAt < STATUS_TTL) return;
    statusFetchedAt = now();
    const cached = readJson(STATUS_KEY, null);
    if (cached && now() - cached.at < STATUS_TTL) {
      if (cached.season) season = cached.season;
      if (Array.isArray(cached.events) && cached.events.length) events = cached.events;
      return;
    }
    const status = officialGetSync('/status');
    if (status && typeof status === 'object') {
      if (status.season) season = status.season;
      if (Array.isArray(status.events) && status.events.length) events = status.events;
      writeJson(STATUS_KEY, { at: now(), season, events });
    }
  }

  // -------------------------------------------------------- 官网桥接 ----

  /** APK 里由 Java 同步返回；没有桥就返回 undefined。 */
  function officialGetSync(path) {
    try {
      const bridge = window.PBAndroid;
      if (bridge && typeof bridge.officialGet === 'function') {
        const raw = bridge.officialGet(path);
        if (raw && raw.length > 1) return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[pb-api] 官网桥接失败', e);
    }
    return undefined;
  }

  /** 优先桥接，其次测试用代理，都没有就 null。 */
  async function officialGet(path) {
    const sync = officialGetSync(path);
    if (sync !== undefined) return sync;
    try {
      const res = await origFetch('/__official' + path);
      if (res.ok) return await res.json();
    } catch { /* 离线 */ }
    return null;
  }

  const boardCache = readJson(BOARD_KEY, { boards: {} });
  boardCache.boards ||= {};

  async function officialBoard(pathWithQuery) {
    const hit = boardCache.boards[pathWithQuery];
    const age = hit ? now() - hit.at : Infinity;
    if (hit && age < BOARD_TTL) return hit.body;

    const body = await officialGet(pathWithQuery);
    if (body) {
      boardCache.boards[pathWithQuery] = { at: now(), body };
      writeJson(BOARD_KEY, boardCache);
      return body;
    }
    return hit && age < MAX_BOARD_AGE ? hit.body : null;
  }

  // ---------------------------------------------------------- 榜单排序 ----

  function boardFor(accounts, mode, seasonKey, limit, params, viewer) {
    const current = seasonKey === 'week' || seasonKey == null || Number(seasonKey) === season.n;
    const allTime = seasonKey === 'all';
    const biome = params.get('biome');
    const tier = params.get('tier');
    const species = params.get('species');
    const sortByTime = mode === 'time';

    const rows = [];
    for (const a of accounts) {
      const bestByBiome = new Map();
      for (const r of a.profile.runs || []) {
        if (!allTime && !(current && r.season === season.n)) continue;
        if (biome && r.biome !== biome) continue;
        if (tier != null && Number(tier) !== r.tier) continue;
        if (species && String(r.species) !== species) continue;
        if (sortByTime && !r.victory) continue;
        const prev = bestByBiome.get(r.biome);
        const better = !prev || (sortByTime ? r.time < prev.time : (r.kills || 0) > (prev.kills || 0));
        if (better) bestByBiome.set(r.biome, r);
      }
      if (!bestByBiome.size) continue;
      let kills = 0;
      let time = 0;
      let last = null;
      for (const r of bestByBiome.values()) {
        kills += r.kills || 0;
        time += r.time || 0;
        if (!last || r.date > last.date) last = r;
      }
      rows.push({
        id: a.id, name: a.name, species: last.finalSpecies ?? last.species,
        kills, time, biome: last.biome, tier: last.tier, date: last.date,
        me: viewer ? a.id === viewer.id : false,
        avatar: a.profile.avatar, frame: a.profile.frame,
        skins: a.profile.skins, title: a.profile.title, tag: '',
        medal: 0, splits: [],
        regions: Object.fromEntries([...bestByBiome].map(([b, r]) => [b, sortByTime ? r.time : r.kills || 0])),
      });
    }
    if (sortByTime) rows.sort((x, y) => x.time - y.time);
    else rows.sort((x, y) => y.kills - x.kills);
    const ranked = rows.slice(0, limit).map((e, i) => ({ ...e, rank: i + 1 }));
    return {
      board: `${mode}:${biome ?? 'global'}`, entries: ranked,
      me: ranked.find((e) => e.me) ?? null,
      players: rows.length, season: season.n, ends: season.end, info: { ...season },
    };
  }

  const rankedAccounts = () => Object.values(store.accounts).filter((a) => !a.guest);

  function mergeBoards(body, local, limit, viewer, mode) {
    const sortTime = mode === 'time';
    const rows = (body.entries || []).map((e) => ({ ...e }));
    const seen = new Set(rows.map((r) => r.id));
    const extra = (local.entries || [])
      .filter((r) => !seen.has(r.id))
      .map((r) => ({ ...r, local: true, me: false, medal: r.medal || 0, splits: r.splits || [] }));
    rows.push(...extra);
    rows.sort((a, b) => (sortTime ? (a.time || 0) - (b.time || 0) : (b.kills || 0) - (a.kills || 0)));
    rows.forEach((r, i) => { r.rank = i + 1; });
    const mine = viewer ? rows.find((r) => r.id === viewer.id) || null : null;
    if (mine) mine.me = true;
    return { ...body, entries: rows.slice(0, limit), me: mine, players: (body.players || 0) + extra.length };
  }

  function mergePokemon(body, accounts, seasonKey, mode) {
    if (!Array.isArray(body)) return body;
    const bySpecies = new Map(body.map((e) => [Number(e.species), { ...e }]));
    const sortTime = mode === 'time';
    for (const acc of accounts) {
      for (const r of acc.profile.runs || []) {
        if (seasonKey !== 'all' && r.season !== season.n) continue;
        const sp = Number(r.species);
        if (!sp) continue;
        const row = bySpecies.get(sp);
        const top = { name: acc.name, kills: r.kills || 0, time: r.time || 0 };
        if (!row) { bySpecies.set(sp, { species: sp, players: 1, top, me: true }); continue; }
        const better = sortTime
          ? Boolean(r.victory) && (r.time || Infinity) < (row.top?.time ?? Infinity)
          : (r.kills || 0) > (row.top?.kills ?? 0);
        if (better) { row.top = top; row.me = true; }
      }
    }
    return [...bySpecies.values()].sort((a, b) => a.species - b.species);
  }

  // -------------------------------------------------------------- 路由 ----

  const routes = [];
  const route = (method, pattern, handler) => routes.push({ method, pattern, handler });
  const requireAccount = (acc) => acc;

  route('GET', '/status', () => {
    refreshStatusFromOfficial();
    return [200, {
      maintenance: { on: false, title: '', message: '', eta: 0 },
      bypass: false, season: { ...season }, events, registration: { inviteOnly: false },
    }];
  });
  route('GET', '/news', () => [200, []]);
  route('GET', '/version.json', () => [200, { build: 'android', version: '0.0.0' }]);

  route('POST', '/auth/guest', () => {
    const acc = newAccount(`Guest ${Math.random().toString(16).slice(2, 6).toUpperCase()}`, true);
    store.accounts[acc.id] = acc;
    persist();
    return [200, { id: acc.id, name: acc.name, token: acc.token, guest: true }];
  });
  route('GET', '/auth/me', (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    ctx.account.lastSeen = now();
    persist();
    return [200, { id: ctx.account.id, name: ctx.account.name, guest: ctx.account.guest, created: ctx.account.created }];
  });
  route('GET', '/auth/name', (ctx) => {
    const name = ctx.params.get('name') || '';
    return [200, { ok: name.length >= 3 && name.length <= 16 && !accountByName(name), name }];
  });
  route('POST', '/auth/register', async (ctx) => {
    const b = ctx.body || {};
    if (!b.name || !b.password) return [400, { error: 'Missing data.' }];
    if (accountByName(b.name)) return [409, { error: 'That name is already in use.' }];
    const acc = newAccount(b.name, false);
    acc.password = await hashPassword(b.password);
    store.accounts[acc.id] = acc;
    persist();
    return [200, { id: acc.id, name: acc.name, token: acc.token, guest: false }];
  });
  route('POST', '/auth/login', async (ctx) => {
    const b = ctx.body || {};
    const acc = accountByName(b.name);
    if (!acc || !(await checkPassword(b.password, acc.password))) {
      return [401, { error: 'Incorrect username or password.' }];
    }
    acc.token = token();
    acc.lastSeen = now();
    persist();
    return [200, { id: acc.id, name: acc.name, token: acc.token, guest: false }];
  });
  route('POST', '/auth/logout', () => [204, undefined]);
  route('POST', '/auth/upgrade', async (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    const b = ctx.body || {};
    if (accountByName(b.name) && accountByName(b.name).id !== ctx.account.id) {
      return [409, { error: 'That name is already in use.' }];
    }
    ctx.account.name = b.name;
    ctx.account.guest = false;
    ctx.account.password = await hashPassword(b.password);
    ctx.account.profile.name = b.name;
    persist();
    return [200, { id: ctx.account.id, name: ctx.account.name, token: ctx.account.token, guest: false }];
  });

  route('GET', '/profile', (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    return [200, { profile: ctx.account.profile, now: now() }];
  });
  route('PUT', '/profile/prefs', (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    const b = ctx.body || {};
    const p = ctx.account.profile;
    if (b.settings && typeof b.settings === 'object') p.settings = { ...p.settings, ...b.settings };
    for (const k of ['lastSpecies', 'lastBiome', 'avatar', 'frame', 'title', 'skins']) {
      if (b[k] !== undefined) p[k] = b[k];
    }
    persist();
    return [204, undefined];
  });
  route('POST', '/profile/starter', (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    const b = ctx.body || {};
    const p = ctx.account.profile;
    const id = Number(b.id);
    if (![1, 4, 7].includes(id)) return [400, { error: 'Invalid starter.' }];
    p.starter = id;
    p.lastSpecies = id;
    if (!p.league.includes(id)) p.league.push(id);
    if (!p.unlocked.includes(id)) p.unlocked.push(id);
    persist();
    return [200, { profile: p }];
  });
  // 客户端把买升级/买道具等操作批量发到这里；它自己已经先扣钱升级了，
  // 服务端必须做同样的事并把结果返回，否则界面会被 adopt() 回滚。
  // 价格表（LAB_ITEMS / ITEM_PRICES）由 android/dev/extract-prices.mjs 自动生成。
  function applyActions(p, actions) {
    let spent = 0;
    for (const a of Array.isArray(actions) ? actions : []) {
      if (!a || typeof a !== 'object') continue;
      switch (a.k) {
        case 'lab': {
          const def = LAB_ITEMS[a.id];
          const cur = Number(p.lab?.[a.id]) || 0;
          const want = Math.max(cur, Number(a.lv) || cur + 1);
          const next = Math.min(want, def ? def.max : want);
          if (def) for (let l = cur; l < next; l++) spent += def.cost(l);
          p.lab ||= {};
          p.lab[a.id] = next;
          break;
        }
        case 'item': {
          p.itemsOwned ||= [];
          if (a.key && !p.itemsOwned.includes(a.key)) {
            if (ITEM_PRICES[a.key] !== undefined) spent += ITEM_PRICES[a.key];
            p.itemsOwned.push(a.key);
          }
          break;
        }
        case 'archive': {
          p.itemsOff ||= [];
          if (a.key) {
            p.itemsOff = a.off
              ? [...new Set([...p.itemsOff, a.key])]
              : p.itemsOff.filter((k) => k !== a.key);
          }
          break;
        }
        case 'quest': {
          if (a.id) { p.quests ||= {}; p.quests[a.id] = 1; }
          break;
        }
        case 'task': {
          const t = p[a.period];
          if (t && Number.isInteger(a.slot) && a.slot >= 0 && a.slot < 4) t.claimed[a.slot] = 1;
          break;
        }
        default:
          break;
      }
    }
    if (spent > 0) p.stardust = Math.max(0, (Number(p.stardust) || 0) - spent);
    return spent;
  }

  route('POST', '/profile/actions', (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    applyActions(ctx.account.profile, (ctx.body || {}).actions);
    persist();
    return [200, { profile: ctx.account.profile }];
  });

  const profileMutation = (fn) => (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    const p = ctx.account.profile;
    fn(p, ctx.body || {});
    persist();
    return [200, { profile: p }];
  };
  route('POST', '/lab/buy', (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    applyActions(ctx.account.profile, [{ k: 'lab', id: (ctx.body || {}).id }]);
    persist();
    return [200, { profile: ctx.account.profile }];
  });
  route('POST', '/items/buy', (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    applyActions(ctx.account.profile, [{ k: 'item', key: (ctx.body || {}).key }]);
    persist();
    return [200, { profile: ctx.account.profile }];
  });
  route('POST', '/items/archive', (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    const b = ctx.body || {};
    applyActions(ctx.account.profile, [{ k: 'archive', key: b.key, off: b.off }]);
    persist();
    return [200, { profile: ctx.account.profile }];
  });
  route('POST', '/quests/claim', (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    applyActions(ctx.account.profile, [{ k: 'quest', id: (ctx.body || {}).id }]);
    persist();
    return [200, { profile: ctx.account.profile }];
  });
  route('POST', '/tasks/claim', (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    const b = ctx.body || {};
    applyActions(ctx.account.profile, [{ k: 'task', period: b.period, slot: b.slot }]);
    persist();
    return [200, { profile: ctx.account.profile }];
  });
  route('POST', '/tasks/reroll', (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    return [200, { profile: ctx.account.profile }];
  });

  route('GET', '/records', (ctx) => (ctx.account ? [200, []] : [401, { error: 'Invalid session.' }]));
  route('GET', '/records/endless', (ctx) => (ctx.account ? [200, []] : [401, { error: 'Invalid session.' }]));

  route('GET', '/leaderboard', async (ctx) => {
    const mode = ctx.params.get('mode') || 'kills';
    const seasonKey = ctx.params.get('season') || 'week';
    const limit = Math.min(Math.max(Number(ctx.params.get('limit') || 50) || 50, 1), 100);
    const local = boardFor(rankedAccounts(), mode, seasonKey, 500, ctx.params, ctx.account);

    const officialParams = new URLSearchParams(ctx.params);
    officialParams.set('limit', '100');
    const remote = await officialBoard('/leaderboard?' + officialParams.toString());
    if (!remote) return [200, local];
    const merged = mergeBoards(remote, local, 100, ctx.account, mode);
    merged.entries = merged.entries.slice(0, limit);
    return [200, merged];
  });
  route('GET', '/leaderboard/pokemon', async (ctx) => {
    const seasonKey = ctx.params.get('season') || 'week';
    const mode = ctx.params.get('mode') || 'kills';
    const remote = await officialBoard('/leaderboard/pokemon?' + ctx.params.toString());
    if (!remote) return [200, []];
    return [200, mergePokemon(remote, rankedAccounts(), seasonKey, mode)];
  });

  route('GET', '/seasons/awards', () => [200, []]);
  route('POST', '/seasons/claim', (ctx) => (ctx.account ? [200, { profile: ctx.account.profile }] : [401, { error: 'Invalid session.' }]));

  route('GET', '/events/:id', (ctx) => {
    const ev = events.find((e) => e.id === ctx.slug);
    if (!ev) return [404, { error: 'Event not found.' }];
    return [200, { event: ev, track: [], quests: [], points: 0, claimed: [] }];
  });
  route('POST', '/events/:id/track', (ctx) => (ctx.account ? [200, { profile: ctx.account.profile }] : [401, { error: 'Invalid session.' }]));
  route('POST', '/events/:id/quest', (ctx) => (ctx.account ? [200, { profile: ctx.account.profile }] : [401, { error: 'Invalid session.' }]));

  route('GET', '/players', (ctx) => {
    const id = ctx.params.get('id');
    const name = ctx.params.get('name');
    const acc = id ? store.accounts[id] : accountByName(name);
    if (!acc) return [404, { error: 'Player not found.' }];
    return [200, {
      id: acc.id, name: acc.name, created: acc.created,
      species: acc.profile.lastSpecies, avatar: acc.profile.avatar,
      frame: acc.profile.frame, title: acc.profile.title, skins: acc.profile.skins,
      league: acc.profile.league, kills: {}, records: [], runs: [],
    }];
  });
  route('POST', '/players/:id/report', () => [204, undefined]);

  route('POST', '/runs', (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    const b = ctx.body || {};
    const id = `run-${store.nextRun++}`;
    store.runs[id] = {
      id, account: ctx.account.id, cfg: b,
      seed: b.seed ?? Math.floor(Math.random() * 2 ** 31), started: now(),
    };
    persist();
    return [200, { id, seed: store.runs[id].seed, ranked: true, boosts: [] }];
  });
  route('GET', '/runs/:id/build', (ctx) => {
    const run = store.runs[ctx.slug];
    if (!run) return [404, { error: 'Run not found.' }];
    return [200, { run: run.cfg, seed: run.seed }];
  });
  route('POST', '/runs/:id/checkpoint', (ctx) => {
    const run = store.runs[ctx.slug];
    if (!run) return [404, { error: 'Run not found.' }];
    run.cps = (run.cps || []).concat((ctx.body || {}).cps || []).slice(-600);
    persist();
    return [204, undefined];
  });
  route('POST', '/runs/:id/finish', (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    const b = ctx.body || {};
    const result = b.result || {};
    const p = ctx.account.profile;
    const run = store.runs[ctx.slug];
    if (run) run.finished = now();

    const entry = { ...result, id: ctx.slug, date: now(), season: season.n, score: result.kills || 0, ranked: true };
    p.runs = [entry, ...(p.runs || [])].slice(0, 50);
    p.counters ||= {};
    p.counters.runs = (p.counters.runs || 0) + 1;
    p.counters.kills = (p.counters.kills || 0) + (result.kills || 0);
    for (const sp of result.progress?.seen || []) if (!p.seen.includes(sp)) p.seen.push(sp);
    for (const sp of result.progress?.league || []) if (!p.league.includes(sp)) p.league.push(sp);
    for (const sp of result.progress?.shinies || []) if (!p.shinies.includes(sp)) p.shinies.push(sp);
    const stardust = Math.max(1, Math.round((result.kills || 0) / 100));
    p.stardust += stardust;
    p.totalStardust += stardust;
    persist();

    return [200, {
      profile: p, record: entry, ranked: true, guest: !!ctx.account.guest, review: false,
      stardust, ends: season.end, rewards: { stardust },
      kills: {
        season: season.n, week: 1, all: 1, playersWeek: 1, playersAll: 1,
        ranked: true, live: true, dust: 1, cutoff: 0, ends: season.end,
      },
      pb: false, prevBest: null, prevKills: null, weekPb: false, killsPb: false, medal: 0, mon: null,
    }];
  });

  // 单人版：邮件 / 战队 / 社交一律空实现（和电脑版一致）
  route('GET', '/mail', () => [200, []]);
  route('POST', '/mail/read', () => [204, undefined]);
  route('POST', '/mail/:id/answer', () => [204, undefined]);
  route('POST', '/mail/:id/claim', () => [204, undefined]);
  route('GET', '/clans/status', () => [200, { clan: null, mail: 0, requests: 0, friends: 0, rewards: 0, board: 0 }]);
  route('GET', '/clans/board', () => [200, { entries: [], info: { ...season } }]);
  route('GET', '/clans/search', () => [200, { clans: [] }]);
  route('GET', '/clans/:id', () => [404, { error: 'Clan not found.' }]);
  route('GET', '/clans/:id/activity', () => [200, []]);
  route('GET', '/clans/:id/chat', () => [200, []]);
  route('POST', '/clans', () => [400, { error: '本地模式不提供战队。' }]);
  route('POST', '/clans/chat', () => [400, { error: '本地模式不提供战队。' }]);
  route('POST', '/clans/react', () => [204, undefined]);
  route('POST', '/clans/claim', () => [400, { error: '本地模式不提供战队。' }]);
  route('POST', '/clans/expand', () => [400, { error: '本地模式不提供战队。' }]);
  route('GET', '/coop/access', () => [200, { ok: false, allowed: false }]);
  route('GET', '/coop/board', () => [200, { entries: [], board: 'coop' }]);

  route('POST', '/feedback', () => [204, undefined]);
  route('POST', '/account/rename', (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    const b = ctx.body || {};
    const other = accountByName(b.name);
    if (other && other.id !== ctx.account.id) return [409, { error: 'That name is already in use.' }];
    ctx.account.name = b.name;
    ctx.account.profile.name = b.name;
    persist();
    return [200, { name: ctx.account.name }];
  });
  route('GET', '/account/rename', () => [200, { wait: 0 }]);
  route('POST', '/account/reset', (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    ctx.account.profile = newProfile(ctx.account.name);
    persist();
    return [200, { ok: true }];
  });
  route('POST', '/account/delete', (ctx) => {
    if (!ctx.account) return [401, { error: 'Invalid session.' }];
    delete store.accounts[ctx.account.id];
    persist();
    return [200, { ok: true }];
  });

  function matchRoute(method, pathname) {
    for (const r of routes) {
      if (r.method !== method) continue;
      if (r.pattern === pathname) return { handler: r.handler, slug: null };
      if (!r.pattern.includes(':')) continue;
      const a = r.pattern.split('/');
      const b = pathname.split('/');
      if (a.length !== b.length) continue;
      let slug = null;
      let ok = true;
      for (let i = 0; i < a.length; i++) {
        if (a[i].startsWith(':')) slug = decodeURIComponent(b[i]);
        else if (a[i] !== b[i]) { ok = false; break; }
      }
      if (ok) return { handler: r.handler, slug };
    }
    return null;
  }

  // ---------------------------------------------------------- fetch 钩子 ----

  function authTokenFrom(headers) {
    if (!headers) return null;
    const get = (k) => {
      if (typeof headers.get === 'function') return headers.get(k);
      const key = Object.keys(headers).find((x) => x.toLowerCase() === k.toLowerCase());
      return key ? headers[key] : null;
    };
    const auth = get('authorization') || get('Authorization') || '';
    return auth.startsWith('Bearer ') ? auth.slice(7) : null;
  }

  async function handleApi(url, init) {
    const parsed = new URL(url, location.href);
    const method = ((init && init.method) || 'GET').toUpperCase();
    const pathname = parsed.pathname.replace(new RegExp('^' + API_PREFIX), '') || '/';
    const match = matchRoute(method, pathname);

    if (!match) {
      console.log('[pb-api] 未实现', method, pathname);
      return jsonResponse(404, { error: 'Not found.' });
    }

    let body;
    if (init && init.body) {
      try { body = JSON.parse(init.body); } catch { body = undefined; }
    }
    const ctx = {
      params: parsed.searchParams,
      body,
      slug: match.slug,
      account: accountByToken(authTokenFrom(init && init.headers)),
    };

    try {
      const out = await match.handler(ctx);
      const [code, payload] = out;
      return jsonResponse(code, payload);
    } catch (e) {
      console.error('[pb-api]', method, pathname, e);
      return jsonResponse(500, { error: 'Internal local error.' });
    }
  }

  function jsonResponse(code, payload) {
    // 204/205/304 这类状态码按规范不能带响应体，之前带空串会让 Response 构造抛错
    const noBody = payload === undefined || code === 204 || code === 205 || code === 304;
    const body = noBody ? null : JSON.stringify(payload);
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
    if (!noBody) headers['content-length'] = String(new TextEncoder().encode(body).length);
    return new Response(body, { status: code, headers });
  }

  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : input && input.url;
      if (url && (url.startsWith(API_PREFIX) || url.startsWith(ORIGIN_MARK))) {
        return handleApi(url.startsWith(ORIGIN_MARK) ? url.slice(ORIGIN_MARK.length) : url, init);
      }
    } catch (e) {
      console.warn('[pb-api] 拦截失败，走原始 fetch', e);
    }
    return origFetch(input, init);
  };

  const ORIGIN_MARK = 'https://api.pokebonk.com';

  // 便于排查：__pbLocalApi.status()
  window.__pbLocalApi = {
    status() {
      return {
        accounts: Object.keys(store.accounts).length,
        ranked: rankedAccounts().length,
        boards: Object.keys(boardCache.boards).length,
        bridge: !!(window.PBAndroid && window.PBAndroid.officialGet),
        season: season.n,
      };
    },
    reset() {
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem(BOARD_KEY);
      location.reload();
    },
  };

  console.log('[pb-api] 手机版本地 API 已接管', window.__pbLocalApi.status());
})();