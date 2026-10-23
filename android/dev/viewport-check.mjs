// 检查视口与是否还有上下裁切
import fs from 'node:fs/promises';
import path from 'node:path';
const OUT = path.resolve(import.meta.dirname, '..', '..', 'state');
const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json());
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); return p(m); } });
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description };
  return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable');

console.log('视口:', JSON.stringify(await ev(`({ inner: [innerWidth, innerHeight], dpr: devicePixelRatio, meta: document.querySelector('meta[name=viewport]').content })`)));

// 若不在选御三家界面，先游客登录进入
let ui = String(await ev(`(document.getElementById('ui')?.innerText||'')`));
if (!/选择你的伙伴/.test(ui)) {
  await ev(`(() => { const els=[...document.querySelectorAll('button,div,span')].filter(e=>e.offsetParent!==null).sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length); const el=els.find(e=>/^以游客身份游玩！?$/.test((e.innerText||'').trim())); if(el) el.click(); })()`);
  await new Promise((r) => setTimeout(r, 7000));
}

console.log('\n关卡屏幕各元素位置（判断有没有被裁）:');
console.log(JSON.stringify(await ev(`(() => {
  const screenEl = document.querySelector('.screen.sp');
  if (!screenEl) return 'not on starter screen';
  const kids = [...screenEl.children].map(el => {
    const r = el.getBoundingClientRect();
    return { tag: el.tagName, cls: String(el.className).slice(0,30), top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), txt: (el.innerText||'').replace(/\\s+/g,' ').slice(0,18) };
  });
  const first = kids[0], last = kids[kids.length-1];
  return { viewportH: innerHeight, screenTop: Math.round(screenEl.getBoundingClientRect().top), kids,
           topClipped: first ? first.top < 0 : null, bottomClipped: last ? last.bottom > innerHeight : null };
})()`), null, 2));

const r = await send('Page.captureScreenshot', { format: 'png' });
if (r.result?.data) await fs.writeFile(path.join(OUT, '平板-视口修复后.png'), Buffer.from(r.result.data, 'base64'));
console.log('\n截图: state/平板-视口修复后.png');
ws.close(); process.exit(0);