// 官网排行榜的只读同步层。
//
// api.pokebonk.com 的 /leaderboard 需要 Bearer 令牌，所以这里用一个匿名游客身份
// （服务器自己创建、只用来读公开榜单）去取数据，取到后缓存到 data/leaderboard-cache.json。
// 断网或官网接口异常时一律回退到上次缓存，绝不影响单机游玩。
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const API = 'https://api.pokebonk.com';
const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE_FILE = path.join(ROOT, 'data', 'leaderboard-cache.json');
const SESSION_FILE = path.join(ROOT, 'data', 'official-session.json');
const TTL_MS = 5 * 60 * 1000;        // 同一份榜单 5 分钟内不重复请求
const MAX_AGE_MS = 30 * 24 * 3600 * 1000; // 超过 30 天的缓存不再当“最新”展示

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const HEADERS = {
  'user-agent': UA,
  'origin': 'https://pokebonk.com',
  'referer': 'https://pokebonk.com/',
  'accept': 'application/json',
};

let session = null;       // { id, token, created }
let cache = null;         // { boards: { key: { at, body } } }
let writes = Promise.resolve();
let lastSessionAt = 0;
let offlineUntil = 0;     // 官网连续失败后的冷却期，避免离线时每个请求都等超时

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

function saveJson(file, obj) {
  writes = writes
    .then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(obj));
    })
    .catch(() => {});
  return writes;
}

export async function init() {
  session = await readJson(SESSION_FILE);
  cache = (await readJson(CACHE_FILE)) || { boards: {} };
  if (!cache.boards) cache.boards = {};
}

async function newGuest() {
  const res = await fetch(`${API}/auth/guest`, {
    method: 'POST',
    headers: { ...HEADERS, 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`guest ${res.status}`);
  const data = await res.json();
  if (!data?.token) throw new Error('guest token 缺失');
  lastSessionAt = Date.now();
  return { id: data.id, token: data.token, created: new Date().toISOString() };
}

async function ensureSession({ force = false } = {}) {
  if (!force && session?.token) return session.token;
  // 避免官网接口抽风时反复注册
  if (!force && Date.now() - lastSessionAt < 60_000 && session?.token) return session.token;
  session = await newGuest();
  saveJson(SESSION_FILE, session);
  return session.token;
}

/** 取一份榜单：优先新鲜缓存 → 官网 → 过期缓存。 */
export async function board(pathWithQuery) {
  const key = pathWithQuery;
  const hit = cache?.boards?.[key];
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < TTL_MS) return { body: hit.body, source: 'cache', age };

  // 冷却期内（官网刚失败过）直接用缓存，不再等超时
  if (Date.now() < offlineUntil) {
    return hit && age < MAX_AGE_MS ? { body: hit.body, source: 'stale', age } : null;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const token = await ensureSession({ force: attempt > 0 });
      const res = await fetch(`${API}${pathWithQuery}`, {
        headers: { ...HEADERS, authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(12_000),
      });
      if (res.status === 401 || res.status === 403) {
        await res.body?.cancel();
        session = null;
        continue;
      }
      if (!res.ok) throw new Error(`http ${res.status}`);
      const body = await res.json();
      sanitize(body);
      cache.boards[key] = { at: Date.now(), body };
      saveJson(CACHE_FILE, cache);
      return { body, source: 'live', age: 0 };
    } catch (err) {
      if (attempt === 1) break;
    }
  }

  offlineUntil = Date.now() + 2 * 60 * 1000;
  if (hit && age < MAX_AGE_MS) return { body: hit.body, source: 'stale', age };
  return null;
}

/** 榜单是“别人”的，本地玩家不可能在上面，别把 me 指到别人的条目。 */
function sanitize(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  body.me = null;
  if (Array.isArray(body.entries)) {
    for (const e of body.entries) if (e && typeof e === 'object') e.me = false;
  }
  return body;
}

/** 启动时预热最常用的几份榜单（失败就静默）。 */
export async function warm() {
  const targets = [
    '/leaderboard?mode=kills&season=week&limit=100',
    '/leaderboard?mode=time&season=week&limit=100',
    '/leaderboard?mode=kills&season=all&limit=100',
    '/leaderboard?mode=time&season=all&limit=100',
    '/leaderboard/pokemon?season=week&mode=kills',
  ];
  let ok = 0;
  await Promise.all(targets.map(async (t) => {
    const r = await board(t).catch(() => null);
    if (r) ok++;
  }));
  return ok;
}

export function stats() {
  const boards = Object.entries(cache?.boards || {}).map(([k, v]) => {
    const body = v.body;
    const count = Array.isArray(body) ? body.length : Array.isArray(body?.entries) ? body.entries.length : 0;
    return { key: k, at: v.at, entries: count };
  });
  return {
    guest: session?.id || null,
    boards: boards.length,
    newest: boards.reduce((a, b) => Math.max(a, b.at || 0), 0) || null,
    detail: boards.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 8),
  };
}
