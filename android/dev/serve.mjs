#!/usr/bin/env node
/**
 * 开发用：在电脑上模拟 APK 里的资源管线，用来验证手机端逻辑。
 *
 *   node android/dev/serve.mjs [port]
 *
 * 和 Apache/静态服务器不同的是：
 *   1. 把游戏 JS 里的 https://api.pokebonk.com 改写成 /api（APK 里由 Java 层做同样的事）；
 *   2. 往 index.html 注入 pb-api-shim.js（本地 API 层）；
 *   3. 提供 /__official/* 代理，代替 APK 里的原生桥接（浏览器跨域拿不到官网接口）。
 */
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const WEB = path.join(ROOT, 'web');
const SHIM = path.join(ROOT, 'android', 'assets-extra', 'pb-api-shim.js');
const PORT = Number(process.argv[2] || 8899);
const API_FROM = 'https://api.pokebonk.com';
const OFFICIAL = 'https://api.pokebonk.com';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
};
const mime = (f) => MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';

let guestToken = null;
async function officialFetch(pathWithQuery) {
  const headers = {
    'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
    origin: 'https://pokebonk.com', referer: 'https://pokebonk.com/', accept: 'application/json',
  };
  if (!guestToken) {
    const r = await fetch(`${OFFICIAL}/auth/guest`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}' });
    if (!r.ok) return null;
    guestToken = (await r.json()).token;
  }
  let res = await fetch(OFFICIAL + pathWithQuery, { headers: { ...headers, authorization: `Bearer ${guestToken}` } });
  if (res.status === 401) {
    const r = await fetch(`${OFFICIAL}/auth/guest`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}' });
    guestToken = r.ok ? (await r.json()).token : null;
    res = await fetch(OFFICIAL + pathWithQuery, { headers: { ...headers, authorization: `Bearer ${guestToken}` } });
  }
  if (!res.ok) return null;
  return await res.json();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname.startsWith('/__official/')) {
    const target = url.pathname.slice('/__official'.length) + (url.search || '');
    const body = await officialFetch(target).catch(() => null);
    if (!body) { res.writeHead(502); return res.end('{}'); }
    const buf = Buffer.from(JSON.stringify(body));
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': buf.length });
    return res.end(buf);
  }

  if (url.pathname === '/pb-api-shim.js') {
    const buf = await readFile(SHIM);
    res.writeHead(200, { 'content-type': MIME['.js'], 'content-length': buf.length, 'cache-control': 'no-store' });
    return res.end(buf);
  }

  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (rel === '') rel = 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(WEB, rel);
  if (!path.resolve(file).startsWith(WEB) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('Not found');
  }

  const ext = path.extname(file).toLowerCase();
  if (ext === '.js') {
    const src = await readFile(file, 'utf8');
    const out = src.includes(API_FROM) ? src.split(API_FROM).join('/api') : src;
    const buf = Buffer.from(out);
    res.writeHead(200, { 'content-type': mime(file), 'content-length': buf.length, 'cache-control': 'no-store' });
    return res.end(buf);
  }
  if (ext === '.html' && rel === 'index.html') {
    let src = await readFile(file, 'utf8');
    src = src.replace(/<script[^>]*static\.cloudflareinsights\.com[\s\S]*?<\/script>/g, '');
    src = src.replace(/<head([^>]*)>/i, '<head$1>\n    <script src="/pb-api-shim.js"></script>');
    const buf = Buffer.from(src);
    res.writeHead(200, { 'content-type': mime(file), 'content-length': buf.length, 'cache-control': 'no-store' });
    return res.end(buf);
  }

  const st = statSync(file);
  res.writeHead(200, { 'content-type': mime(file), 'content-length': st.size, 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => console.log(`模拟 APK 管线: http://127.0.0.1:${PORT}/`));