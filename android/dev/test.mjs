#!/usr/bin/env node
/**
 * 开发用：用无头 Chrome 验证手机端方案。
 *   1. shim 是否加载、官网桥接是否可用
 *   2. 本地账号注册 / 对局结算 / 榜单合并（在页面里直接调 /api）
 *   3. 真实 UI 流程：游客 → 选御三家 → 主菜单 → 排行榜
 *
 * 前置：先跑 node android/dev/serve.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:8899/';
const OUT = path.resolve(import.meta.dirname, '..', '..', 'state', 'android-probe');
await fs.mkdir(OUT, { recursive: true });
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9338;
const profile = path.join(process.env.TEMP, 'pbapk-' + Date.now());

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--headless=new',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-first-run', '--disable-extensions',
  '--window-size=1280,800', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch {} await sleep(250); }
const target = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const events = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); return p(m); }
  if (m.method) events.push(m);
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
  return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); if (r.result?.data) await fs.writeFile(path.join(OUT, n + '.png'), Buffer.from(r.result.data, 'base64')); };
const click = (re) => ev(`(() => { const els=[...document.querySelectorAll('button,[role=button],a,div,span')].filter(e=>e.offsetParent!==null).sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length); const el=els.find(e=>${re}.test((e.innerText||'').trim())); if(!el) return 'NOT FOUND'; el.click(); return 'ok:'+(el.innerText||'').trim().slice(0,24); })()`);
const key = async (k, code, vk) => { for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); };

console.log('=== 1. 加载与本地 API 层 ===');
await sleep(16000);
console.log('shim:', JSON.stringify(await ev(`window.__pbLocalApi ? window.__pbLocalApi.status() : 'MISSING'`)));
console.log('页面标题:', await ev('document.title'));

console.log('\n=== 2. 本地接口（在页面内直接调用）===');
const apiTest = await ev(`(async () => {
  const call = async (m, p, body, tok) => {
    const r = await fetch('/api' + p, {
      method: m,
      headers: { ...(body ? {'Content-Type':'application/json'} : {}), ...(tok ? {Authorization:'Bearer '+tok} : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, j };
  };
  const out = {};
  const name = 'Phone' + Math.floor(Math.random()*9000+1000);
  const reg = await call('POST', '/auth/register', { name, password: 'secret123' });
  out.register = reg.status;
  const tok = reg.j.token;
  out.me = (await call('GET', '/auth/me', null, tok)).j.name;
  out.status = (await call('GET', '/status')).j.season.n;
  await call('POST', '/profile/starter', { id: 4 }, tok);
  const run = await call('POST', '/runs', { seed: 42, biome: 'forest', tier: 0, species: 4, mode: 'classic' }, tok);
  out.runId = run.j.id;
  const fin = await call('POST', '/runs/' + run.j.id + '/finish', {
    result: { kills: 123456, time: 900, biome: 'forest', tier: 0, species: 4, finalSpecies: 6, victory: false,
              progress: { seen: [4, 6], league: [4], shinies: [] } },
  }, tok);
  out.finish = fin.status;
  out.stardust = fin.j.profile.stardust;
  const board = await call('GET', '/leaderboard?mode=kills&season=week&limit=5', null, tok);
  out.boardEntries = board.j.entries.length;
  out.players = board.j.players;
  out.myRank = board.j.me ? board.j.me.rank : null;
  out.myName = board.j.me ? board.j.me.name : null;
  out.topName = board.j.entries[0] && board.j.entries[0].name;
  out.mergedFromOfficial = !!(board.j.board && board.j.players > 1000);
  const poke = await call('GET', '/leaderboard/pokemon?season=week&mode=kills');
  out.pokemonRows = Array.isArray(poke.j) ? poke.j.length : 'not-array';
  return out;
})()`);
console.log(JSON.stringify(apiTest, null, 2));

console.log('\n=== 3. UI 流程（游客 → 御三家 → 排行榜）===');
await ev(`localStorage.clear()`);
await send('Page.reload', { ignoreCache: true });
await sleep(17000);
console.log('登录页:', (await ev(`(document.getElementById('ui')?.innerText||'').replace(/\\s+/g,' ').slice(0,60)`)));
console.log('游客登录:', await click('/^以游客身份游玩！?$/'));
await sleep(6000);
console.log('选御三家:', await click('/#004|小火龙/'));
await sleep(800);
await click('/^我选你了/');
await sleep(4000);
console.log('菜单:', (await ev(`(document.getElementById('ui')?.innerText||'').replace(/\\s+/g,' ').slice(0,90)`)));
await click('/排行榜|Ranking/');
await sleep(3500);
await click('/^知道了$/');
await sleep(1200);
await shot('board');
const txt = await ev(`(document.getElementById('ui')?.innerText||'').replace(/\\s+/g,' ')`);
console.log('榜单文本片段:', txt.slice(120, 420));

console.log('\n=== 4. 错误 ===');
const errs = [...new Set(events.filter((e) => e.method === 'Runtime.exceptionThrown' ||
  (e.method === 'Network.responseReceived' && e.params.response.status >= 400))
  .map((e) => e.method === 'Runtime.exceptionThrown'
    ? 'EXC ' + (e.params.exceptionDetails?.exception?.description || '').slice(0, 200)
    : `[${e.params.response.status}] ${e.params.response.url}`))];
for (const e of errs.slice(0, 12)) console.log('  ' + e);

ws.close(); chrome.kill(); process.exit(0);