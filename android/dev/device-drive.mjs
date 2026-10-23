#!/usr/bin/env node
/**
 * 开发用：通过 adb 转发的 WebView 调试端口，在真机上驱动游戏跑完整流程。
 *
 *   1) adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
 *   2) node android/dev/device-drive.mjs [--keep]
 *
 * 做的事：本地 API 自检 → 游客登录 → 选御三家 → 主菜单 → 排行榜（官网合并）→
 *        注册正式账号 → 提交一局成绩 → 榜单里看到自己 → 截图。
 * 默认结束时会清空测试数据（--keep 保留）。
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '..', '..', 'state', 'android-probe');
const KEEP = process.argv.includes('--keep');
await fs.mkdir(OUT, { recursive: true });

const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json());
const page = list.find((t) => t.type === 'page');
if (!page) throw new Error('没有找到 WebView 页面，检查 adb forward 是否生效');
const ws = new WebSocket(page.webSocketDebuggerUrl);

let id = 0;
const pending = new Map();
const events = [];
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  if (r.result?.data) {
    await fs.writeFile(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64'));
    return true;
  }
  return false;
};
const tap = (re) => ev(`(() => {
  const els=[...document.querySelectorAll('button,[role=button],a,div,span')]
    .filter(e=>e.offsetParent!==null)
    .sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length);
  const el=els.find(e=>${re}.test((e.innerText||'').trim()));
  if(!el) return 'NOT FOUND';
  el.click();
  return 'ok:'+(el.innerText||'').trim().slice(0,24);
})()`);
const uiText = () => ev(`(document.getElementById('ui')?.innerText||'').replace(/\\s+/g,' ')`);

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');

console.log('=== 1. 本地 API 层自检 ===');
console.log(JSON.stringify(await ev(`window.__pbLocalApi ? window.__pbLocalApi.status() : 'MISSING'`)));
console.log('页面:', await ev('location.href'), '| 标题:', await ev('document.title'));

console.log('\n=== 2. 触摸/点击：游客登录 ===');
let ui = await uiText();
if (/选择你的伙伴/.test(ui)) {
  console.log('已处于选御三家界面，跳过登录');
} else {
  console.log('点游客:', await tap('/^以游客身份游玩！?$/'));
  await sleep(6000);
  ui = await uiText();
}

if (/选择你的伙伴/.test(ui)) {
  console.log('\n=== 3. 选御三家 ===');
  console.log('选小火龙:', await tap('/#004|小火龙/'));
  await sleep(700);
  console.log('确认:', await tap('/^我选你了/'));
  await sleep(4500);
} else {
  console.log('未进入选御三家界面，当前 UI:', String(ui).slice(0, 120));
}
console.log('主菜单:', String(await uiText()).slice(0, 110));
await shot('device-menu');

console.log('\n=== 4. 排行榜（官网数据合并）===');
console.log('打开排行榜:', await tap('/排行榜|Ranking/'));
await sleep(4000);
await tap('/^知道了$/');
await sleep(1200);
const boardText = String(await uiText());
console.log('片段:', boardText.slice(120, 400));
await shot('device-board');

console.log('\n=== 5. 注册正式账号 + 提交一局成绩 ===');
const result = await ev(`(async () => {
  const call = async (m, p, body, tok) => {
    const r = await fetch('/api' + p, {
      method: m,
      headers: { ...(body ? {'Content-Type':'application/json'} : {}), ...(tok ? {Authorization:'Bearer '+tok} : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, j };
  };
  const name = 'Tablet' + Math.floor(Math.random()*9000+1000);
  const reg = await call('POST', '/auth/register', { name, password: 'secret123' });
  if (!reg.j) return { error: 'register failed', reg };
  const tok = reg.j.token;
  await call('POST', '/profile/starter', { id: 4 }, tok);
  const run = await call('POST', '/runs', { seed: 7, biome: 'forest', tier: 0, species: 4, mode: 'classic' }, tok);
  await call('POST', '/runs/' + run.j.id + '/finish', {
    result: { kills: 88888, time: 1234, biome: 'forest', tier: 0, species: 4, finalSpecies: 6, victory: false,
              progress: { seen: [1,4,6,7], league: [4], shinies: [] } },
  }, tok);
  const board = await call('GET', '/leaderboard?mode=kills&season=week&limit=5', null, tok);
  const poke = await call('GET', '/leaderboard/pokemon?season=week&mode=kills');
  return {
    name, register: reg.status,
    myRank: board.j.me ? board.j.me.rank : null,
    players: board.j.players,
    topName: board.j.entries[0] && board.j.entries[0].name,
    officialMerged: board.j.players > 1000,
    pokemonRows: Array.isArray(poke.j) ? poke.j.length : 'not-array',
  };
})()`);
console.log(JSON.stringify(result, null, 2));

console.log('\n=== 6. 控制台错误 ===');
const errs = [...new Set(events
  .filter((e) => e.method === 'Runtime.exceptionThrown' ||
    (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
  .map((e) => e.method === 'Runtime.exceptionThrown'
    ? 'EXC ' + (e.params.exceptionDetails?.exception?.description || '').slice(0, 200)
    : 'LOG ' + e.params.entry.text.slice(0, 200)))];
if (!errs.length) console.log('  无');
for (const e of errs.slice(0, 10)) console.log('  ' + e);

if (!KEEP) {
  console.log('\n=== 7. 清理测试数据（--keep 可保留）===');
  await ev(`localStorage.clear()`);
  await send('Page.reload', { ignoreCache: true });
  await sleep(9000);
  console.log('已重置，当前 UI:', String(await uiText()).slice(0, 60));
  await shot('device-reset');
}

ws.close();
process.exit(0);