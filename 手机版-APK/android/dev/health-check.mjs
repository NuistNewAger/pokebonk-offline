// 非侵入式健康检查：只读取状态，不点击任何东西
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
await send('Runtime.enable');
await new Promise((r) => setTimeout(r, 800));

console.log('本地 API 层 :', JSON.stringify(await ev('window.__pbLocalApi ? window.__pbLocalApi.status() : "缺失"')));
console.log('视口        :', JSON.stringify(await ev('[innerWidth, innerHeight, devicePixelRatio]')));
console.log('兼容补丁    :', await ev('!!document.getElementById("pb-compat")'));
console.log('卡片对齐    :', await ev('getComputedStyle(document.querySelector(".sp-card") || document.body).alignItems'));
console.log('原生桥接    :', await ev('!!(window.PBAndroid ? window.PBAndroid.officialGet : null)'));
console.log('当前界面    :', String(await ev('(document.getElementById("ui")?.innerText||"").replace(/\\s+/g," ").slice(0,60)')));
console.log('运行期异常  :', errs.length ? errs.slice(0, 3) : '无');
ws.close(); process.exit(0);