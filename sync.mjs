#!/usr/bin/env node
/**
 * PokéBonk Offline —— 站点镜像同步工具
 *
 * 用法:
 *   node sync.mjs --crawl            首次/手动全量抓取
 *   node sync.mjs --update           增量更新（默认：检查已有文件 + 发现新版构建）
 *   node sync.mjs --update --prune   增量更新并清理旧构建残留
 *   node sync.mjs --list             只列出发现的资源，不下载
 *
 * 说明:
 *   - 只抓取 pokebonk.com 同源资源，不抓 /api 接口。
 *   - 资源保存在 web/ 下，元数据保存在 state/index.json。
 *   - 站点是 Vite 构建，文件名带内容哈希，所以旧构建文件可以安全清理。
 */
import fs from 'node:fs/promises';
import fsc from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(ROOT, 'web');
const STATE = path.join(ROOT, 'state');
const INDEX_FILE = path.join(STATE, 'index.json');
const LOG_FILE = path.join(STATE, 'sync.log');

const ORIGIN = (process.env.PB_ORIGIN || 'https://pokebonk.com').replace(/\/$/, '');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Safari/537.36 PokebonkOffline/1.0';

const args = new Set(process.argv.slice(2));
const MODE_UPDATE = args.has('--update') || args.has('-u');
const MODE_CRAWL = args.has('--crawl') || args.has('-c') || !MODE_UPDATE;
const DO_PRUNE = args.has('--prune');
const LIST_ONLY = args.has('--list');
const QUIET = args.has('--quiet');
// --list-file <path>：额外把文件里的路径清单全部纳入抓取（用于站点运行时才拼接出来的资源）
const listFileArg = process.argv.indexOf('--list-file');
const LIST_FILE = listFileArg > 0 ? process.argv[listFileArg + 1] : null;
const CONCURRENCY = Number(process.env.PB_CONCURRENCY || 6);

const EXT = [
  'js', 'mjs', 'css', 'html', 'json', 'webmanifest', 'xml', 'txt', 'map',
  'png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'svg', 'ico',
  'glb', 'gltf', 'bin', 'ktx2', 'hdr', 'exr', 'obj', 'fbx', 'drc', 'basis',
  'mp3', 'ogg', 'oga', 'wav', 'm4a', 'aac', 'flac', 'mp4', 'webm',
  'wasm', 'ttf', 'otf', 'woff', 'woff2', 'fnt', 'frag', 'vert', 'glsl',
];
const EXT_RE = new RegExp(`\\.(${EXT.join('|')})$`, 'i');
const TEXT_EXT = new Set(['.js', '.mjs', '.css', '.html', '.json', '.webmanifest', '.xml', '.txt', '.svg', '.map']);
const PAGE_ROUTES = new Set(['/', '/legal', '/privacy', '/terms', '/about', '/news']);

// ---------------------------------------------------------------- utilities

const seenLog = new Set();
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  if (!QUIET) console.log(msg);
  seenLog.add(line);
  if (seenLog.size % 20 === 0) flushLog();
}
let logBuffer = [];
function flushLog() {
  if (QUIET && logBuffer.length === 0) return;
  try {
    fsc.mkdirSync(STATE, { recursive: true });
    fsc.appendFileSync(LOG_FILE, logBuffer.join('\n') + (logBuffer.length ? '\n' : ''), 'utf8');
  } catch {}
  logBuffer = [];
}
function note(msg) {
  logBuffer.push(`[${new Date().toISOString()}] ${msg}`);
  if (!QUIET) console.log(msg);
  if (logBuffer.length >= 20) flushLog();
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function fileFor(pathname) {
  let p = pathname;
  try {
    p = decodeURIComponent(pathname);
  } catch {}
  if (p.endsWith('/')) p += 'index.html';
  const parts = p
    .replace(/^\/+/, '')
    .split('/')
    .filter((s) => s && s !== '.' && s !== '..')
    .map((s) => s.replace(/[<>:"|?*\u0000-\u001f]/g, '_'));
  return path.join(WEB, ...parts);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2));
  await fs.rename(tmp, file);
}

async function fetchOnce(url, extraHeaders = {}, method = 'GET') {
  const res = await fetch(url, {
    method,
    redirect: 'follow',
    headers: {
      'user-agent': UA,
      accept: '*/*',
      'accept-language': 'es,en;q=0.8,zh;q=0.7',
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(90_000),
  });
  return res;
}

async function fetchWithRetry(url, extraHeaders = {}, method = 'GET') {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetchOnce(url, extraHeaders, method);
      if (res.status >= 500 && attempt < 3) {
        await res.body?.cancel();
        await sleep(600 * attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      await sleep(600 * attempt);
    }
  }
  throw lastErr;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isTextual(pathname, contentType) {
  const ext = path.extname(pathname).toLowerCase();
  if (TEXT_EXT.has(ext)) return true;
  const ct = (contentType || '').toLowerCase();
  return /text\/|javascript|json|xml|svg/.test(ct);
}

// ---------------------------------------------------------------- discovery

const STR_RE = new RegExp(
  `["'\`]([^"'\`\\s<>]{2,400}?\\.(?:${EXT.join('|')})(?:\\?[^"'\`\\s<>]*)?)["'\`]`,
  'gi',
);
const CSS_URL_RE = /url\(\s*['"]?([^'")]+?)['"]?\s*\)/gi;
const ABS_RE = /https?:\/\/[^\s"'`)<>,]+/gi;
const ANCHOR_RE = /<a\b[^>]*?href\s*=\s*["']([^"'#]+)["']/gi;

function normalize(raw, baseHref, { fromHtml = false } = {}) {
  if (!raw) return null;
  let s = raw.trim().replace(/&amp;/g, '&');
  if (!s || /^(data:|blob:|javascript:|mailto:|tel:|#)/i.test(s)) return null;
  let u;
  try {
    u = new URL(s, baseHref);
  } catch {
    return null;
  }
  if (u.origin !== ORIGIN) return null;
  if (/^\/(api|cdn-cgi|__pb)\//.test(u.pathname)) return null;
  if (/\.(php|cgi)$/i.test(u.pathname)) return null;
  const hasExt = EXT_RE.test(u.pathname);
  if (!hasExt) {
    const route = u.pathname.replace(/\/+$/, '') || '/';
    if (!fromHtml || !(PAGE_ROUTES.has(route) || route === '/legal')) return null;
  }
  u.hash = '';
  u.search = '';
  return u.pathname;
}

function discover(text, baseHref, opts = {}) {
  const out = new Set();
  for (const m of text.matchAll(STR_RE)) {
    const p = normalize(m[1], baseHref, opts);
    if (p) out.add(p);
  }
  for (const m of text.matchAll(CSS_URL_RE)) {
    const p = normalize(m[1], baseHref, opts);
    if (p) out.add(p);
  }
  for (const m of text.matchAll(ABS_RE)) {
    const p = normalize(m[0], baseHref, opts);
    if (p) out.add(p);
  }
  if (opts.fromHtml) {
    for (const m of text.matchAll(ANCHOR_RE)) {
      const p = normalize(m[1], baseHref, { fromHtml: true });
      if (p) out.add(p);
    }
  }
  return out;
}

// ---------------------------------------------------------------- pool

async function pool(items, limit, worker) {
  const queue = items.slice();
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        await worker(item);
      } catch (err) {
        note(`  ! ${item} -> ${err.message}`);
      }
    }
  });
  await Promise.all(runners);
}

// ---------------------------------------------------------------- main

async function main() {
  await fs.mkdir(WEB, { recursive: true });
  await fs.mkdir(STATE, { recursive: true });

  const index = await readJson(INDEX_FILE, { origin: ORIGIN, files: {}, build: null });
  index.origin = ORIGIN;
  index.files ||= {};

  const visited = new Set();
  const queue = [];
  const discoverNew = (urls, depth) => {
    for (const u of urls) {
      if (visited.has(u)) continue;
      visited.add(u);
      queue.push({ url: u, depth });
    }
  };

  // 入口页面每次都重新抓取（HTML 是 no-store，会指向新版构建）
  const seeds = MODE_UPDATE
    ? ['/', '/manifest.webmanifest', '/legal', '/robots.txt', '/sitemap.xml']
    : ['/', '/legal', '/manifest.webmanifest', '/favicon.ico', '/robots.txt', '/sitemap.xml', '/icons/favicon-96.png'];
  discoverNew(seeds, 0);

  let extraPaths = [];
  if (LIST_FILE) {
    try {
      const raw = (await fs.readFile(LIST_FILE, 'utf8')).replace(/^\uFEFF/, '');
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      }
      extraPaths = Array.isArray(parsed) ? parsed : parsed.paths || [];
      extraPaths = extraPaths
        .map((p) => (p.startsWith('/') ? p : `/${p}`))
        .filter((p) => EXT_RE.test(p.split('?')[0]));
      note(`清单: ${extraPaths.length} 个待抓取路径`);
      if (MODE_UPDATE) {
        // 清单里尚未缓存的文件直接入队；已缓存的交给上面的条件请求
        const missing = extraPaths.filter((p) => !index.files[p]);
        discoverNew(missing, 1);
        note(`清单: 新增 ${missing.length} 个`);
      } else {
        discoverNew(extraPaths, 1);
      }
    } catch (e) {
      note(`清单读取失败: ${e.message}`);
    }
  }

  let downloaded = 0;
  let unchanged = 0;
  let bytes = 0;
  let failed = 0;
  let discovered = 0;

  const work = async ({ url, depth }) => {
    if (depth > 4) return;
    const target = `${ORIGIN}${url}`;
    const prev = index.files[url];
    const headers = {};
    if (MODE_UPDATE && prev?.etag) headers['if-none-match'] = prev.etag;
    if (MODE_UPDATE && !prev?.etag && prev?.lastModified) headers['if-modified-since'] = prev.lastModified;

    const res = await fetchWithRetry(target, headers);
    if (res.status === 304 && prev) {
      unchanged++;
      if (res.body) await res.body.cancel();
      return;
    }
    if (res.status === 404 || res.status === 403) {
      if (res.body) await res.body.cancel();
      if (depth === 0) note(`  - 跳过 ${url} (${res.status})`);
      return;
    }
    if (!res.ok) {
      if (res.body) await res.body.cancel();
      failed++;
      note(`  ! HTTP ${res.status} ${url}`);
      return;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const digest = sha256(buf);
    const ct = res.headers.get('content-type') || '';

    if (prev && prev.sha === digest) {
      unchanged++;
      prev.etag = res.headers.get('etag') || prev.etag;
      prev.lastModified = res.headers.get('last-modified') || prev.lastModified;
      prev.checkedAt = new Date().toISOString();
      return;
    }

    if (LIST_ONLY) {
      note(`  ${(buf.length / 1024).toFixed(1).padStart(9)} KB  ${url}`);
      downloaded++;
      bytes += buf.length;
      return;
    }

    const file = fileFor(url);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buf);
    index.files[url] = {
      size: buf.length,
      ct,
      etag: res.headers.get('etag') || null,
      lastModified: res.headers.get('last-modified') || null,
      sha: digest,
      savedAt: new Date().toISOString(),
    };
    downloaded++;
    bytes += buf.length;
    if (downloaded % 100 === 0) {
      // 中途落盘，进程被打断也能续传
      await writeJson(INDEX_FILE, index).catch(() => {});
    }
    if (downloaded % 25 === 0) note(`  … 已保存 ${downloaded} 个文件 (${(bytes / 1048576).toFixed(1)} MB)`);

    if (isTextual(url, ct)) {
      const text = buf.toString('utf8');
      const base = `${ORIGIN}${url}`;
      const isHtml = /html/i.test(ct) || /\.html?$/.test(url) || url === '/';
      const next = discover(text, base, { fromHtml: isHtml });
      discovered += next.size;
      discoverNew([...next], depth + 1);
      if (url === '/') {
        const m = text.match(/name="pokebonk-build"\s+content="([^"]+)"/);
        if (m && index.build !== m[1]) {
          note(`  · 站点构建版本: ${m[1]}${index.build ? ` (原 ${index.build})` : ''}`);
          index.build = m[1];
        }
      }
    }
  };

  const started = Date.now();
  note(`PokéBonk 同步开始 —— 模式: ${MODE_UPDATE ? '增量更新' : '全量抓取'}`);

  // 增量更新时先看线上构建号：没变就只刷新入口页，几秒结束；每周做一次完整校验兜底。
  let skipHeavy = false;
  if (MODE_UPDATE && !args.has('--force')) {
    const lastFull = Date.parse(index.lastFullCheck || 0) || 0;
    const stale = Date.now() - lastFull > 7 * 24 * 3600 * 1000;
    try {
      const res = await fetchWithRetry(`${ORIGIN}/`);
      const html = await res.text();
      const m = html.match(/name="pokebonk-build"\s+content="([^"]+)"/);
      const liveBuild = m?.[1];
      if (liveBuild && index.build === liveBuild && !stale) {
        note(`站点构建未变化 (${liveBuild})，跳过全量校验。加 --force 可强制完整检查。`);
        skipHeavy = true;
      } else if (liveBuild && index.build !== liveBuild) {
        note(`站点构建 ${index.build || '?'} → ${liveBuild}，开始下载新版本。`);
      } else if (stale) {
        note('距离上次完整校验超过 7 天，做一次完整检查。');
      }
    } catch {
      note('无法连接官网，使用现有离线缓存（游戏仍可离线运行）。');
    }
  }

  // 增量模式下先处理已有文件，再处理新发现（避免一上来就请求全部）
  if (MODE_UPDATE && !skipHeavy) {
    const existing = Object.keys(index.files).filter((u) => u !== '/');
    let done = 0;
    await pool(existing, CONCURRENCY, async (url) => {
      await work({ url, depth: 1 });
      if (++done % 50 === 0) note(`  … 已校验 ${done}/${existing.length}`);
    });
    index.lastFullCheck = new Date().toISOString();
  }

  // 广度优先处理队列（队列会在处理中增长）
  while (queue.length) {
    const batch = queue.splice(0, CONCURRENCY * 4);
    await pool(batch, CONCURRENCY, work);
  }

  // 旧版本的带哈希文件会留在 web/assets 里（每个版本几 MB），不影响运行；
  // 需要腾空间时直接删掉整个 web/ 再跑一次 --crawl 即可。

  index.updatedAt = new Date().toISOString();
  index.stats = {
    files: Object.keys(index.files).length,
    bytes: Object.values(index.files).reduce((a, f) => a + (f.size || 0), 0),
  };
  await writeJson(INDEX_FILE, index);

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  note(
    `同步完成: 下载 ${downloaded} / 未变 ${unchanged} / 失败 ${failed} / 新发现 ${discovered} 个链接, ` +
      `${(bytes / 1048576).toFixed(1)} MB, 用时 ${secs}s, 缓存共 ${index.stats.files} 个文件 ${(index.stats.bytes / 1048576).toFixed(1)} MB`,
  );
  flushLog();
}

main().catch(async (err) => {
  note(`同步失败: ${err?.stack || err}`);
  flushLog();
  process.exitCode = 1;
});
