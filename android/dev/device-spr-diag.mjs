// 深挖：精灵画布为什么是 0 尺寸
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

console.log('精灵画布及其祖先链:');
console.log(JSON.stringify(await ev(`(() => {
  const sp = document.querySelector('canvas.ls-spr');
  if (!sp) return 'no .ls-spr canvas';
  const chain = [];
  let el = sp;
  for (let i = 0; i < 7 && el; i++) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    chain.push({
      tag: el.tagName, cls: String(el.className).slice(0,60),
      rect: [Math.round(r.width), Math.round(r.height)],
      display: cs.display, position: cs.position,
      w: cs.width, h: cs.height, flex: cs.flex, aspect: cs.aspectRatio,
      overflow: cs.overflow, minW: cs.minWidth, maxW: cs.maxWidth,
    });
    el = el.parentElement;
  }
  return chain;
})()`), null, 2));

console.log('\n页面里所有 0 尺寸但有内容的元素（前 20）:');
console.log(JSON.stringify(await ev(`(() => {
  const out = [];
  for (const el of document.querySelectorAll('#ui *')) {
    const r = el.getBoundingClientRect();
    if ((r.width === 0 || r.height === 0) && el.children.length > 0) {
      out.push({ tag: el.tagName, cls: String(el.className).slice(0,50), rect: [Math.round(r.width), Math.round(r.height)], display: getComputedStyle(el).display });
      if (out.length >= 20) break;
    }
  }
  return out;
})()`), null, 2));

console.log('\nCSS 支持情况:');
console.log(JSON.stringify(await ev(`({
  aspectRatio: CSS.supports('aspect-ratio', '1'),
  containerQueries: CSS.supports('container-type', 'inline-size'),
  has: CSS.supports('selector(:has(*))'),
  nesting: CSS.supports('selector(&)'),
  dvh: CSS.supports('height', '100dvh'),
  gap: CSS.supports('gap', '1px'),
  webp: document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'),
  avif: CSS.supports('background-image', 'url(x.avif)'),
})`), null, 2));

console.log('\n样式表中和 ls-spr / pix 有关的规则:');
console.log(JSON.stringify(await ev(`(() => {
  const hits = [];
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) {
      const t = r.cssText || '';
      if (/\\.ls-spr|\\.pix\\b/.test(t) && hits.length < 12) hits.push(t.slice(0, 220));
    }
  }
  return hits;
})()`), null, 2));
ws.close(); process.exit(0);