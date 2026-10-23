// 清空状态 → 游客登录 → 选御三家界面：检查是否还有裁切并截图
import fs from 'node:fs/promises';
import path from 'node:path';
const OUT = path.resolve(import.meta.dirname, '..', '..', 'state');
const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json());
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const errs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); return p(m); }
  if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails?.exception?.description || '').slice(0, 140));
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tap = (re) => ev(`(() => { const els=[...document.querySelectorAll('button,[role=button],a,div,span')].filter(e=>e.offsetParent!==null).sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length); const el=els.find(e=>${re}.test((e.innerText||'').trim())); if(!el) return 'NOT FOUND'; el.click(); return 'ok'; })()`);
await send('Runtime.enable'); await send('Page.enable');

await ev(`localStorage.clear()`);
await send('Page.reload', { ignoreCache: true });
await sleep(15000);
console.log('视口:', JSON.stringify(await ev(`[innerWidth, innerHeight]`)));
console.log('登录:', await tap('/^以游客身份游玩！?$/'));
await sleep(7000);
console.log('界面:', String(await ev(`(document.getElementById('ui')?.innerText||'').replace(/\\s+/g,' ').slice(0,40)`)));

console.log('\n选御三家界面各元素是否被裁:');
console.log(JSON.stringify(await ev(`(() => {
  const s = document.querySelector('.screen.sp');
  if (!s) return 'not starter screen';
  const kids = [...s.children].map(k => { const b = k.getBoundingClientRect(); return { cls: String(k.className).slice(0,24), top: Math.round(b.top), bottom: Math.round(b.bottom) }; });
  const title = [...s.querySelectorAll('h1,h2,.hd,h3')].map(h => { const b = h.getBoundingClientRect(); return { t: (h.innerText||'').slice(0,14), top: Math.round(b.top), bottom: Math.round(b.bottom) }; });
  const btn = [...s.querySelectorAll('button')].map(b => ({ cls: String(b.className).slice(0,20), txt: (b.innerText||'').replace(/\\s+/g,' ').slice(0,14), top: Math.round(b.getBoundingClientRect().top), bottom: Math.round(b.getBoundingClientRect().bottom) })).filter(b => b.bottom > 500);
  return { viewportH: innerHeight, kids, title, bottomButtons: btn,
           topClipped: kids.some(k => k.top < 0), bottomClipped: kids.some(k => k.bottom > innerHeight) };
})()`), null, 2));

const r = await send('Page.captureScreenshot', { format: 'png' });
if (r.result?.data) await fs.writeFile(path.join(OUT, '平板-御三家-最终.png'), Buffer.from(r.result.data, 'base64'));
console.log('\n截图: state/平板-御三家-最终.png  错误:', errs.length ? errs.slice(0, 3) : '无');
ws.close(); process.exit(0);