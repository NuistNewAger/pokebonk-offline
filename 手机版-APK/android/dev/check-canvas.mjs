// 检查精灵画布内容 + 顺手跑一遍主要界面看有没有别的塌陷
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

console.log('精灵画布像素检查:');
console.log(JSON.stringify(await ev(`[...document.querySelectorAll('.sp-card canvas.ls-spr')].map(c => {
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let opaque = 0, sample = null;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] > 8) { opaque++; if (!sample) sample = [d[i-3], d[i-2], d[i-1]]; }
  }
  return { size: [c.width, c.height], opaquePixels: opaque, firstColor: sample };
})`), null, 2));

console.log('\n全页面 0 尺寸但有内容的元素（塌陷扫描）:');
console.log(JSON.stringify(await ev(`(() => {
  const out = [];
  for (const el of document.querySelectorAll('#ui *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 && el.children.length > 0 && (el.innerText||'').trim().length > 0) {
      out.push({ tag: el.tagName, cls: String(el.className).slice(0,44), txt: (el.innerText||'').trim().slice(0,14) });
      if (out.length >= 12) break;
    }
  }
  return out;
})()`), null, 2));
ws.close(); process.exit(0);