// 诊断真机上「选御三家」卡片为什么不显示：查 DOM、图片加载状态、失败请求
const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json());
const page = list.find((t) => t.type === 'page');
if (!page) { console.log('没有页面'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const fails = []; const logs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); return p(m); }
  if (m.method === 'Network.loadingFailed') fails.push(`${m.params.errorText} ${m.params.type}`);
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) fails.push(`[${m.params.response.status}] ${m.params.response.url}`);
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 180));
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description };
  return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');

console.log('视口:', JSON.stringify(await ev(`({ inner:[innerWidth,innerHeight], dpr:devicePixelRatio, visual:[visualViewport.width, visualViewport.height, visualViewport.scale], screen:[screen.width,screen.height] })`)));

console.log('\n卡片结构:');
console.log(JSON.stringify(await ev(`(() => {
  const ui = document.getElementById('ui');
  const cards = [...ui.querySelectorAll('*')].filter(e => /#00[147]/.test(e.textContent||'') && e.querySelectorAll('*').length < 60);
  const card = cards[cards.length-1];
  if (!card) return { none: true, sample: (ui.innerText||'').slice(0,120) };
  const box = card.getBoundingClientRect();
  const walk = (el, d=0) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName, cls: String(el.className).slice(0,50), d,
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      bg: cs.backgroundImage !== 'none' ? cs.backgroundImage.slice(0,80) : (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : ''),
      txt: (el.children.length === 0 ? (el.innerText||'').trim().slice(0,20) : ''),
      img: el.tagName === 'IMG' ? { src: el.src.slice(-60), nw: el.naturalWidth, complete: el.complete } : undefined,
      canvas: el.tagName === 'CANVAS' ? { w: el.width, h: el.height } : undefined,
    };
  };
  return { cardRect: [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)], children: [...card.querySelectorAll('*')].slice(0, 26).map(e => walk(e)) };
})()`), null, 2));

console.log('\n页面里的 <img> 加载情况:');
console.log(JSON.stringify(await ev(`[...document.querySelectorAll('img')].map(i => ({ src: i.src.slice(-50), nw: i.naturalWidth, complete: i.complete, vis: i.offsetParent !== null })).slice(0, 12)`), null, 2));

console.log('\ncanvas 元素:');
console.log(JSON.stringify(await ev(`[...document.querySelectorAll('canvas')].map(c => ({ id: c.id, cls: String(c.className).slice(0,20), w: c.width, h: c.height, rect: [Math.round(c.getBoundingClientRect().width), Math.round(c.getBoundingClientRect().height)] }))`), null, 2));

console.log('\n失败请求 / 错误:');
const uniq = [...new Set([...fails, ...logs])];
if (!uniq.length) console.log('  无');
for (const f of uniq.slice(0, 15)) console.log('  ' + f);

ws.close(); process.exit(0);