// 当前界面状态 + 各屏幕元素是否被裁
const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json());
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); return p(m); } });
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable');

console.log('界面:', String(await ev(`(document.getElementById('ui')?.innerText||'').replace(/\\s+/g,' ').slice(0,90)`)));
console.log('\n最外层屏幕容器:');
console.log(JSON.stringify(await ev(`[...document.querySelectorAll('.screen')].map(s => {
  const r = s.getBoundingClientRect();
  const kids = [...s.children].map(k => { const b = k.getBoundingClientRect(); return { cls: String(k.className).slice(0,26), top: Math.round(b.top), bottom: Math.round(b.bottom) }; });
  return { cls: String(s.className).slice(0,40), rect: [Math.round(r.top), Math.round(r.bottom)], viewportH: innerHeight,
           firstTop: kids.length ? kids[0].top : null, lastBottom: kids.length ? kids[kids.length-1].bottom : null, kids: kids.slice(0,5) };
})`), null, 2));
ws.close(); process.exit(0);