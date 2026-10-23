// 验证修复：平板上选御三家卡片是否恢复正常
import fs from 'node:fs/promises';
import path from 'node:path';
const OUT = path.resolve(import.meta.dirname, '..', '..', 'state');
await fs.mkdir(OUT, { recursive: true });
const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json());
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const errs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); return p(m); }
  if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails?.exception?.description || '').slice(0, 160));
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tap = (re) => ev(`(() => { const els=[...document.querySelectorAll('button,[role=button],a,div,span')].filter(e=>e.offsetParent!==null).sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length); const el=els.find(e=>${re}.test((e.innerText||'').trim())); if(!el) return 'NOT FOUND'; el.click(); return 'ok'; })()`);
await send('Runtime.enable'); await send('Page.enable');

console.log('兼容补丁:', await ev(`!!document.getElementById('pb-compat')`));
let ui = String(await ev(`(document.getElementById('ui')?.innerText||'')`));
if (!/选择你的伙伴/.test(ui)) {
  console.log('登录:', await tap('/^以游客身份游玩！?$/'));
  await sleep(6500);
  ui = String(await ev(`(document.getElementById('ui')?.innerText||'')`));
}
console.log('当前界面:', ui.replace(/\s+/g, ' ').slice(0, 50));

console.log('\n三张卡片的量测:');
console.log(JSON.stringify(await ev(`[...document.querySelectorAll('.sp-card')].map(card => {
  const show = card.querySelector('.ls-show');
  const spr = card.querySelector('canvas.ls-spr');
  const name = card.querySelector('.ls-plate h1');
  return {
    name: name ? name.innerText : null,
    cardAlign: getComputedStyle(card).alignItems,
    showW: Math.round(show.getBoundingClientRect().width),
    spr: spr ? [Math.round(spr.getBoundingClientRect().width), Math.round(spr.getBoundingClientRect().height)] : null,
    chips: [...card.querySelectorAll('.chip')].map(c => c.innerText).join('/'),
  };
})`), null, 2));

await sleep(800);
const r = await send('Page.captureScreenshot', { format: 'png' });
if (r.result?.data) await fs.writeFile(path.join(OUT, '平板-修复后.png'), Buffer.from(r.result.data, 'base64'));
console.log('\n截图: state/平板-修复后.png   错误:', errs.length ? errs.slice(0, 3) : '无');
ws.close(); process.exit(0);