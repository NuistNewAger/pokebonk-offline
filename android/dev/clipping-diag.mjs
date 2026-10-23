// 诊断：底部按钮/文字被截断的原因（视口 meta、溢出、布局高度）
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
await send('Runtime.enable');

console.log(JSON.stringify(await ev(`(() => {
  const meta = document.querySelector('meta[name=viewport]');
  const screenEl = document.querySelector('.screen.sp') || document.querySelector('.screen');
  const btn = [...document.querySelectorAll('button')].find(b => /我选你了/.test(b.innerText||''));
  const title = [...document.querySelectorAll('#ui *')].find(e => /选择你的伙伴吧/.test(e.innerText||''));
  const r = (el) => el ? (() => { const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; })() : null;
  const cs = screenEl ? getComputedStyle(screenEl) : null;
  return {
    viewportMeta: meta && meta.content,
    inner: [innerWidth, innerHeight],
    docScrollH: document.documentElement.scrollHeight,
    bodyScrollH: document.body.scrollHeight,
    screenEl: screenEl ? { cls: String(screenEl.className).slice(0,40), rect: r(screenEl), height: cs.height, minHeight: cs.minHeight, overflow: cs.overflow, padding: cs.padding, display: cs.display, flexDir: cs.flexDirection, justify: cs.justifyContent, gap: cs.gap } : null,
    titleRect: r(title),
    buttonRect: r(btn),
    buttonBottom: btn ? Math.round(btn.getBoundingClientRect().bottom) : null,
    clipped: btn ? btn.getBoundingClientRect().bottom > innerHeight : null,
  };
})()`), null, 2));

console.log('\n页面根节点滚动/溢出:');
console.log(JSON.stringify(await ev(`(() => ({
  htmlOverflow: getComputedStyle(document.documentElement).overflow,
  bodyOverflow: getComputedStyle(document.body).overflow,
  uiOverflow: getComputedStyle(document.getElementById('ui')).overflow,
  uiHeight: getComputedStyle(document.getElementById('ui')).height,
  canScroll: document.documentElement.scrollHeight > innerHeight,
}))()`), null, 2));
ws.close(); process.exit(0);