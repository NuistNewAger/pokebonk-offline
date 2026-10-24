#!/usr/bin/env node
/**
 * PokéBonk Offline —— 本地单机服务器
 *
 *  - 从 web/ 目录提供镜像下来的游戏文件（离线可玩）
 *  - 把游戏里指向 https://api.pokebonk.com 的请求改写成 /api，由本地接口实现
 *  - Cloudflare Turnstile 用本地桩替代（本地没有验证码）
 *  - 缺文件时按需从官网补抓并写回 web/（之后即可离线）
 *
 * 存档在 data/store.json；镜像缓存在 web/ 与 state/index.json。
 * 仅监听 127.0.0.1，不对外网开放。
 */
import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  now, token, newProfile, newAccount, hashPassword, checkPassword,
  SEASON, EVENTS, seasonPayload, boardFor, json, body,
} from './lib/api-shared.mjs';
import { socialRoutes, edgeKey } from './lib/api-social.mjs';
import * as official from './lib/official.mjs';
import { LAB_ITEMS, ITEM_PRICES } from './lib/prices.mjs';

const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = 'https://pokebonk.com';
const ROOT = path.resolve(import.meta.dirname, 'web');
const DATA = path.resolve(import.meta.dirname, 'data');
const LIB = path.resolve(import.meta.dirname, 'lib');

// 游戏里写死的两个外部地址（构建无关，可在任何版本上替换）
const API_FROM = 'https://api.pokebonk.com';
const TURNSTILE_FROM = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const mimeFor = (file) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

// ---------------------------------------------------------------- 存档 ----

const STORE_FILE = path.join(DATA, 'store.json');
let store = { accounts: {}, runs: {}, nextRun: 1, friends: {}, pres: {}, rooms: {}, invites: {} };
try {
  store = JSON.parse(await readFile(STORE_FILE, 'utf8'));
} catch {
  /* 首次启动 */
}
store.accounts ||= {};
store.runs ||= {};
store.friends ||= {};
store.pres ||= {};
store.rooms ||= {};
store.invites ||= {};
store.nextRun ||= 1;

let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    mkdir(DATA, { recursive: true })
      .then(() => writeFile(STORE_FILE, JSON.stringify(store)))
      .catch((e) => console.error('存档写入失败', e));
  }, 120);
}

const accountByToken = (req) => {
  const auth = req.headers.authorization || '';
  const t = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!t) return null;
  return Object.values(store.accounts).find((a) => a.token === t) || null;
};
const accountByName = (name) => {
  const k = String(name || '').toLowerCase();
  return Object.values(store.accounts).find((a) => a.name.toLowerCase() === k) || null;
};

// ---------------------------------------------------------------- API ----

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route('GET', '/status', () => ({
  maintenance: { on: false, title: '', message: '', eta: 0 },
  bypass: false, season: seasonPayload(), events: EVENTS,
  registration: { inviteOnly: false },
}));
route('GET', '/news', () => []);
route('GET', '/version.json', () => ({ build: 'local', version: '0.0.0' }));

// 账号
route('POST', '/auth/guest', async (req, res) => {
  const acc = newAccount(`Guest ${crypto.randomBytes(2).toString('hex').toUpperCase()}`, true);
  store.accounts[acc.id] = acc;
  persist();
  json(res, 200, { id: acc.id, name: acc.name, token: acc.token, guest: true });
});
route('GET', '/auth/me', (req, res) => {
  const acc = accountByToken(req);
  if (!acc) return json(res, 401, { error: 'Invalid session.' });
  acc.lastSeen = now();
  json(res, 200, { id: acc.id, name: acc.name, guest: acc.guest, created: acc.created });
});
route('GET', '/auth/name', (req, res, url) => {
  const name = url.searchParams.get('name') || '';
  json(res, 200, { ok: name.length >= 3 && name.length <= 16 && !accountByName(name), name });
});
route('POST', '/auth/register', async (req, res) => {
  const b = (await body(req)) || {};
  if (!b.name || !b.password) return json(res, 400, { error: 'Missing data.' });
  if (accountByName(b.name)) return json(res, 409, { error: 'That name is already in use.' });
  const acc = newAccount(b.name, false);
  acc.password = await hashPassword(b.password);
  store.accounts[acc.id] = acc;
  persist();
  json(res, 200, { id: acc.id, name: acc.name, token: acc.token, guest: false });
});
route('POST', '/auth/login', async (req, res) => {
  const b = (await body(req)) || {};
  const acc = accountByName(b.name);
  if (!acc || !(await checkPassword(b.password, acc.password))) {
    return json(res, 401, { error: 'Incorrect username or password.' });
  }
  acc.token = token();
  acc.lastSeen = now();
  persist();
  json(res, 200, { id: acc.id, name: acc.name, token: acc.token, guest: false });
});
route('POST', '/auth/logout', (req, res) => json(res, 204, undefined));
route('POST', '/auth/upgrade', async (req, res) => {
  const acc = accountByToken(req);
  if (!acc) return json(res, 401, { error: 'Invalid session.' });
  const b = (await body(req)) || {};
  if (accountByName(b.name)) return json(res, 409, { error: 'That name is already in use.' });
  acc.name = b.name;
  acc.guest = false;
  acc.password = await hashPassword(b.password);
  acc.profile.name = b.name;
  persist();
  json(res, 200, { id: acc.id, name: acc.name, token: acc.token, guest: false });
});

// 档案
const requireAccount = (req, res) => {
  const acc = accountByToken(req);
  if (!acc) json(res, 401, { error: 'Invalid session.' });
  return acc;
};
route('GET', '/profile', (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  json(res, 200, { profile: acc.profile, now: now() });
});
route('PUT', '/profile/prefs', async (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  const b = (await body(req)) || {};
  const p = acc.profile;
  if (b.settings && typeof b.settings === 'object') p.settings = { ...p.settings, ...b.settings };
  for (const k of ['lastSpecies', 'lastBiome', 'avatar', 'frame', 'title', 'skins']) {
    if (b[k] !== undefined) p[k] = b[k];
  }
  persist();
  json(res, 204, undefined);
});
route('POST', '/profile/starter', async (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  const b = (await body(req)) || {};
  const p = acc.profile;
  const id = Number(b.id);
  if (![1, 4, 7].includes(id)) return json(res, 400, { error: 'Invalid starter.' });
  p.starter = id;
  p.lastSpecies = id;
  if (!p.league.includes(id)) p.league.push(id);
  if (!p.unlocked.includes(id)) p.unlocked.push(id);
  persist();
  json(res, 200, { profile: p });
});
// ------------------------------------------------------- 购买/领奖操作 ----
//
// 客户端把操作批量发到 /profile/actions，形如：
//   { actions: [ {k:'lab', id, lv}, {k:'item', key}, {k:'archive', key, off},
//                {k:'quest', id}, {k:'task', period, slot} ] }
// 其中 lab 的 lv 是客户端已经加过的目标等级（客户端自己先扣了钱、升了级），
// 所以服务端必须做同样的事并把结果返回，否则 adopt() 会把界面回滚。
// 价格表由 android/dev/extract-prices.mjs 从游戏包里自动生成。
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

route('POST', '/profile/actions', async (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  const b = (await body(req)) || {};
  const spent = applyActions(acc.profile, b.actions);
  persist();
  if (spent) console.log(`[操作] 应用 ${b.actions?.length || 0} 条，花费星尘 ${spent}`);
  json(res, 200, { profile: acc.profile });
});

route('POST', '/lab/buy', async (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  const b = (await body(req)) || {};
  applyActions(acc.profile, [{ k: 'lab', id: b.id }]);
  persist();
  json(res, 200, { profile: acc.profile });
});
route('POST', '/items/buy', async (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  const b = (await body(req)) || {};
  applyActions(acc.profile, [{ k: 'item', key: b.key }]);
  persist();
  json(res, 200, { profile: acc.profile });
});
route('POST', '/items/archive', async (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  const b = (await body(req)) || {};
  applyActions(acc.profile, [{ k: 'archive', key: b.key, off: b.off }]);
  persist();
  json(res, 200, { profile: acc.profile });
});
route('POST', '/quests/claim', async (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  const b = (await body(req)) || {};
  applyActions(acc.profile, [{ k: 'quest', id: b.id }]);
  persist();
  json(res, 200, { profile: acc.profile });
});
route('POST', '/tasks/claim', async (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  const b = (await body(req)) || {};
  applyActions(acc.profile, [{ k: 'task', period: b.period, slot: b.slot }]);
  persist();
  json(res, 200, { profile: p });
});
route('POST', '/tasks/reroll', (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  json(res, 200, { profile: acc.profile });
});
route('GET', '/records', (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  json(res, 200, []);
});
route('GET', '/records/endless', (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  json(res, 200, []);
});

// ---------------------------------------------------------- 榜单合并 ----
// 官网榜单是“别人”的，本地账号是“我”的。把两者按同一规则合并、重新排名，
// 这样游戏里既能看到真实全服排名，也能看到自己的成绩插在第几名。
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
  return {
    ...body,
    entries: rows.slice(0, limit),
    me: mine,
    players: (body.players || 0) + extra.length,
  };
}

function mergePokemon(body, accounts, season, mode) {
  if (!Array.isArray(body)) return body;
  const bySpecies = new Map(body.map((e) => [Number(e.species), { ...e }]));
  const sortTime = mode === 'time';
  for (const acc of accounts) {
    for (const r of acc.profile.runs || []) {
      if (season !== 'all' && r.season !== SEASON.n) continue;
      const sp = Number(r.species);
      if (!sp) continue;
      const row = bySpecies.get(sp);
      const top = { name: acc.name, kills: r.kills || 0, time: r.time || 0 };
      if (!row) {
        bySpecies.set(sp, { species: sp, players: 1, top, me: true });
        continue;
      }
      const better = sortTime
        ? Boolean(r.victory) && (r.time || Infinity) < (row.top?.time ?? Infinity)
        : (r.kills || 0) > (row.top?.kills || 0);
      if (better) {
        row.top = top;
        row.me = true;
      }
    }
  }
  return [...bySpecies.values()].sort((a, b) => a.species - b.species);
}

// 排行榜：官网全服榜 + 本地账号，合并后在本机重新排序。
route('GET', '/leaderboard', async (req, res, url) => {
  const mode = url.searchParams.get('mode') || 'kills';
  const season = url.searchParams.get('season') || 'week';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50) || 50, 1), 100);
  const viewer = accountByToken(req);
  const local = boardFor(rankedAccounts(), mode, season, 500, url, viewer);

  // 固定拉 100 条再合并，这样同一个玩家在不同 limit 下看到的自己名次是稳定的
  const officialParams = new URLSearchParams(url.searchParams);
  officialParams.set('limit', '100');
  const remote = await official.board('/leaderboard?' + officialParams.toString()).catch(() => null);

  if (!remote) return json(res, 200, local);

  res.setHeader('x-pb-board-source', remote.source);
  const merged = mergeBoards(remote.body, local, 100, viewer, mode);
  merged.entries = merged.entries.slice(0, limit);
  json(res, 200, merged);
});

route('GET', '/leaderboard/pokemon', async (req, res, url) => {
  const qs = url.searchParams.toString();
  const season = url.searchParams.get('season') || 'week';
  const mode = url.searchParams.get('mode') || 'kills';
  const remote = await official.board('/leaderboard/pokemon' + (qs ? `?${qs}` : '')).catch(() => null);
  if (remote) {
    res.setHeader('x-pb-board-source', remote.source);
    return json(res, 200, mergePokemon(remote.body, rankedAccounts(), season, mode));
  }
  json(res, 200, []);
});
route('GET', '/seasons/awards', (req, res) => json(res, 200, []));
route('POST', '/seasons/claim', (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  json(res, 200, { profile: acc.profile });
});

route('GET', '/events/:id', (req, res, url, params) => {
  const ev = EVENTS.find((e) => e.id === params.id);
  if (!ev) return json(res, 404, { error: 'Event not found.' });
  json(res, 200, { event: ev, track: [], quests: [], points: 0, claimed: [] });
});
route('POST', '/events/:id/track', (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  json(res, 200, { profile: acc.profile });
});
route('POST', '/events/:id/quest', (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  json(res, 200, { profile: acc.profile });
});

route('GET', '/players', (req, res, url) => {
  const id = url.searchParams.get('id');
  const name = url.searchParams.get('name');
  const acc = id ? store.accounts[id] : accountByName(name);
  if (!acc) return json(res, 404, { error: 'Player not found.' });
  json(res, 200, {
    id: acc.id, name: acc.name, created: acc.created,
    species: acc.profile.lastSpecies, avatar: acc.profile.avatar,
    frame: acc.profile.frame, title: acc.profile.title, skins: acc.profile.skins,
    league: acc.profile.league, kills: {}, records: [], runs: [],
  });
});
route('POST', '/players/:id/report', (req, res) => json(res, 204, undefined));

// 对局
route('POST', '/runs', async (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  const b = (await body(req)) || {};
  const id = `run-${store.nextRun++}`;
  store.runs[id] = { id, account: acc.id, cfg: b, seed: b.seed ?? crypto.randomInt(1, 2 ** 31), started: now() };
  persist();
  json(res, 200, { id, seed: store.runs[id].seed, ranked: true, boosts: [] });
});
route('GET', '/runs/:id/build', (req, res, url, params) => {
  const run = store.runs[params.id];
  if (!run) return json(res, 404, { error: 'Run not found.' });
  json(res, 200, { run: run.cfg, seed: run.seed });
});
route('POST', '/runs/:id/checkpoint', async (req, res, url, params) => {
  const run = store.runs[params.id];
  if (!run) return json(res, 404, { error: 'Run not found.' });
  const b = (await body(req)) || {};
  run.cps = (run.cps || []).concat(b.cps || []).slice(-600);
  json(res, 204, undefined);
});
route('POST', '/runs/:id/finish', async (req, res, url, params) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  const b = (await body(req)) || {};
  const result = b.result || {};
  const p = acc.profile;
  const run = store.runs[params.id];
  if (run) run.finished = now();

  const entry = { ...result, id: params.id, date: now(), season: SEASON.n, score: result.kills || 0, ranked: true };
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

  json(res, 200, {
    profile: p, record: entry, ranked: true, guest: !!acc.guest, review: false,
    stardust, ends: SEASON.end, rewards: { stardust },
    kills: {
      season: SEASON.n, week: 1, all: 1, playersWeek: 1, playersAll: 1,
      ranked: true, live: true, dust: 1, cutoff: 0, ends: SEASON.end,
    },
    pb: false, prevBest: null, prevKills: null, weekPb: false, killsPb: false, medal: 0, mon: null,
  });
});

// 邮件 / 战队（单人模式下的空实现）
route('GET', '/mail', (req, res) => json(res, 200, []));
route('POST', '/mail/read', (req, res) => json(res, 204, undefined));
route('POST', '/mail/:id/answer', (req, res) => json(res, 204, undefined));
route('POST', '/mail/:id/claim', (req, res) => json(res, 204, undefined));

route('GET', '/clans/status', (req, res) => json(res, 200, { clan: null, mail: 0, requests: 0, friends: 0, rewards: 0, board: 0 }));
route('GET', '/clans/board', (req, res) => json(res, 200, { entries: [], info: seasonPayload() }));
route('GET', '/clans/search', (req, res) => json(res, 200, { clans: [] }));
route('GET', '/clans/:id', (req, res) => json(res, 404, { error: 'Clan not found.' }));
route('GET', '/clans/:id/activity', (req, res) => json(res, 200, []));
route('GET', '/clans/:id/chat', (req, res) => json(res, 200, []));
route('POST', '/clans', (req, res) => json(res, 400, { error: '本地模式不提供战队。' }));
route('POST', '/clans/chat', (req, res) => json(res, 400, { error: '本地模式不提供战队。' }));
route('POST', '/clans/react', (req, res) => json(res, 204, undefined));
route('POST', '/clans/claim', (req, res) => json(res, 400, { error: '本地模式不提供战队。' }));
route('POST', '/clans/expand', (req, res) => json(res, 400, { error: '本地模式不提供战队。' }));

// 好友 / 房间 / 邀请（同机单人时基本都是空表）
const socialApi = {
  me: (req, res) => {
    const acc = accountByToken(req);
    if (!acc) json(res, 401, { error: 'Invalid session.' });
    return acc;
  },
  byId: async (id) => store.accounts[id] || null,
  byName: async (name) => accountByName(name),
  search: async (q, limit) => {
    const ql = String(q || '').toLowerCase();
    return Object.values(store.accounts).filter((a) => a.name.toLowerCase().includes(ql)).slice(0, limit);
  },
  edges: async (uid) => Object.values(store.friends).filter((e) => e && e.users && e.users.includes(uid)),
  saveEdge: async (e) => { store.friends[edgeKey(e.users[0], e.users[1])] = e; },
  delEdge: async (k) => { delete store.friends[k]; },
  pres: async (ids) => {
    const out = {};
    for (const id of ids) if (store.pres[id]) out[id] = store.pres[id];
    return out;
  },
  setPres: async (id, v) => { store.pres[id] = v; },
  room: async (code) => store.rooms[code] || null,
  myRoom: async (uid) => Object.values(store.rooms).find((r) => r && r.m && r.m[uid]) || null,
  saveRoom: async (r) => { store.rooms[r.code] = r; },
  delRoom: async (code) => { delete store.rooms[code]; },
  invites: async (uid) => Object.values(store.invites).filter((i) => i && i.to === uid),
  saveInvite: async (i) => { store.invites[`${i.to}|${i.from}`] = i; },
  delInvite: async (from, to) => { delete store.invites[`${to}|${from}`]; },
  flush: persist,
};
for (const r of socialRoutes(socialApi).routes) routes.push(r);

route('POST', '/feedback', (req, res) => json(res, 204, undefined));
route('POST', '/account/rename', async (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  const b = (await body(req)) || {};
  if (accountByName(b.name)) return json(res, 409, { error: 'That name is already in use.' });
  acc.name = b.name;
  acc.profile.name = b.name;
  persist();
  json(res, 200, { name: acc.name });
});
route('GET', '/account/rename', (req, res) => json(res, 200, { wait: 0 }));
route('POST', '/account/reset', async (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  acc.profile = newProfile(acc.name);
  persist();
  json(res, 200, { ok: true });
});
route('POST', '/account/delete', (req, res) => {
  const acc = requireAccount(req, res);
  if (!acc) return;
  delete store.accounts[acc.id];
  persist();
  json(res, 200, { ok: true });
});

// 合作模式在单机版里不提供，但要给客户端一个明确的空响应而不是 404 崩溃
route('GET', '/coop/access', (req, res) => json(res, 200, { ok: false, allowed: false }));
route('GET', '/coop/board', (req, res) => json(res, 200, { entries: [], board: 'coop' }));

function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    if (r.pattern === pathname) return { handler: r.handler, params: {} };
    if (!r.pattern.includes(':')) continue;
    const a = r.pattern.split('/');
    const b = pathname.split('/');
    if (a.length !== b.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < a.length; i++) {
      if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
      else if (a[i] !== b[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

// ------------------------------------------------------------ 静态资源 ----

const JS_CACHE = new Map(); // file -> { mtime, buf|null }
const HTML_CACHE = new Map();

// 游戏自带的“短屏放宽虚拟视口”逻辑只对短边 <480px 的手机生效（横屏时）。
// 平板（例如华为 2560×1600 / DPR2.5 → 1024×640 CSS px）短边 640，装不下基础布局
// （选御三家需要约 740px 高），上下内容会被裁掉。这里把阈值改成平板也走放宽分支，
// 用正则匹配变量名，换构建版本后依然有效。
const VIEWPORT_RE = /(\w+)=480,(\w+)=1100/;
function applyViewportPatch(src) {
  if (!VIEWPORT_RE.test(src)) return src;
  return src.replace(
    VIEWPORT_RE,
    '$1=(screen.width>=900?820:480),$2=(screen.width>=900?1280:1100)',
  );
}

async function patchedBuffer(file, st) {
  const key = file;
  const hit = JS_CACHE.get(key);
  if (hit && hit.mtime === st.mtimeMs) return hit.buf;
  let buf = null;
  if (st.size < 8 * 1024 * 1024) {
    const src = await readFile(file, 'utf8');
    let out = src;
    if (out.includes(API_FROM)) out = out.split(API_FROM).join('/api');
    if (out.includes(TURNSTILE_FROM)) out = out.split(TURNSTILE_FROM).join('/turnstile-stub.js');
    out = applyViewportPatch(out);
    if (out !== src) {
      buf = Buffer.from(out);
      console.log(`[patch] ${path.relative(ROOT, file)} -> 本地 API / 视口修正`);
    }
  }
  JS_CACHE.set(key, { mtime: st.mtimeMs, buf });
  return buf;
}

async function htmlBuffer(file, st) {
  const hit = HTML_CACHE.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.buf;
  let src = await readFile(file, 'utf8');
  const before = src;
  src = src.replace(/<script[^>]*static\.cloudflareinsights\.com[\s\S]*?<\/script>/g, '');
  // 注入 Chromium 旧内核兼容补丁（详见 lib/pb-compat.css）
  if (!src.includes('pb-compat')) {
    const css = await readFile(path.join(LIB, 'pb-compat.css'), 'utf8').catch(() => '');
    if (css) {
      src = src.replace(/<head([^>]*)>/i, `<head$1>\n    <style id="pb-compat">${css}</style>`);
    }
  }
  const buf = src === before ? null : Buffer.from(src);
  HTML_CACHE.set(file, { mtime: st.mtimeMs, buf });
  return buf;
}

function sendBuffer(req, res, buf, file, { immutable = false } = {}) {
  const total = buf.length;
  const headers = {
    'content-type': mimeFor(file),
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'access-control-allow-origin': '*',
  };
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      let start = m[1] === '' ? NaN : Number(m[1]);
      let end = m[2] === '' ? NaN : Number(m[2]);
      if (Number.isNaN(start)) {
        start = Math.max(0, total - (Number.isNaN(end) ? 0 : end));
        end = total - 1;
      } else if (Number.isNaN(end) || end >= total) {
        end = total - 1;
      }
      if (start <= end && start < total) {
        res.writeHead(206, {
          ...headers,
          'content-range': `bytes ${start}-${end}/${total}`,
          'accept-ranges': 'bytes',
          'content-length': end - start + 1,
        });
        return res.end(buf.subarray(start, end + 1));
      }
      res.writeHead(416, { 'content-range': `bytes */${total}` });
      return res.end();
    }
  }
  headers['content-length'] = total;
  headers['accept-ranges'] = 'bytes';
  res.writeHead(200, headers);
  res.end(buf);
}

function streamFile(req, res, file, st, immutable) {
  const headers = {
    'content-type': mimeFor(file),
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'accept-ranges': 'bytes',
    'content-length': st.size,
    'access-control-allow-origin': '*',
  };
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}

let online = true;

async function fetchUpstream(rel) {
  const target = `${UPSTREAM}/${rel}`;
  try {
    const upstream = await fetch(target, {
      redirect: 'follow',
      headers: { 'user-agent': 'PokebonkOffline/1.0' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok) return null;
    const buf = Buffer.from(await upstream.arrayBuffer());
    const out = path.join(ROOT, rel);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, buf).catch(() => {});
    return buf;
  } catch {
    online = false;
    return null;
  }
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  rel = rel.replace(/^(?:assets\/)+assets\//, 'assets/').replace(/^(?:data\/)+data\//, 'data/');
  if (rel === '') rel = 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  rel = rel.replace(/\.\./g, '');

  const file = path.join(ROOT, rel);
  const inside = path.resolve(file).startsWith(ROOT);

  if (inside && existsSync(file)) {
    const st = await stat(file);
    if (st.isDirectory()) {
      const index = path.join(file, 'index.html');
      if (existsSync(index)) return serveStatic(req, res, pathname.replace(/\/?$/, '/'));
    }
    const ext = path.extname(file).toLowerCase();
    if (ext === '.js') {
      const patched = await patchedBuffer(file, st);
      if (patched) return sendBuffer(req, res, patched, file, { immutable: true });
      return streamFile(req, res, file, st, true);
    }
    if (ext === '.html') {
      const patched = await htmlBuffer(file, st);
      if (patched) return sendBuffer(req, res, patched, file);
      return streamFile(req, res, file, st, false);
    }
    return streamFile(req, res, file, st, /-[A-Za-z0-9_-]{8}\./.test(path.basename(file)));
  }

  // 单页应用路由
  if (!path.extname(rel)) {
    const index = path.join(ROOT, 'index.html');
    if (existsSync(index)) return serveStatic(req, res, '/');
  }

  // 镜像里缺的资源：按需从官网补一份并缓存
  if (!rel.startsWith('api/')) {
    const fetched = await fetchUpstream(rel).catch(() => null);
    if (fetched) return sendBuffer(req, res, fetched, file, { immutable: true });
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

// ---------------------------------------------------------------- 服务 ----

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    });
    return res.end();
  }

  if (url.pathname === '/turnstile-stub.js') {
    const buf = await readFile(path.join(LIB, 'turnstile-stub.js'));
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'content-length': buf.length });
    return res.end(buf);
  }

  if (url.pathname === '/__pb/status') {
    return json(res, 200, {
      ok: true, port: PORT, online,
      accounts: Object.keys(store.accounts).length,
      leaderboard: official.stats(),
    });
  }

  if (url.pathname === '/__pb/refresh-boards') {
    const n = await official.warm().catch(() => 0);
    return json(res, 200, { refreshed: n, ...official.stats() });
  }

  if (url.pathname.startsWith('/api/')) {
    const apiPath = url.pathname.slice(4) || '/';
    const m = matchRoute(req.method, apiPath);
    if (!m) {
      console.log(`[api] 未实现 ${req.method} ${apiPath}`);
      return json(res, 404, { error: 'Not found.' });
    }
    try {
      const out = await m.handler(req, res, url, m.params);
      if (out !== undefined && !res.writableEnded) json(res, 200, out);
      return;
    } catch (e) {
      console.error(`${req.method} ${url.pathname}`, e);
      return json(res, 500, { error: 'Internal local server error.' });
    }
  }

  try {
    return await serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error('static', url.pathname, e);
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Internal error');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`PokéBonk 本地版已启动  →  http://127.0.0.1:${PORT}/`);
  // 每次启动游戏：后台把官网排行榜同步到本地缓存，然后再进游戏就能看到真实榜单。
  official
    .init()
    .then(() => official.warm())
    .then((n) => console.log(`[榜单] 已从官网同步 ${n} 份排行榜`))
    .catch((e) => console.log(`[榜单] 同步失败，使用本地缓存：${e.message}`));

  // 长时间挂着玩时，每 15 分钟刷新一次（失败静默）
  setInterval(() => {
    official.warm().catch(() => {});
  }, 15 * 60 * 1000).unref();
});
