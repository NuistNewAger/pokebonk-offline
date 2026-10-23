// 判定游戏世界到底有没有在渲染：直接在游戏 canvas 上 readPixels
const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json());
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); return p(m); } });
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description };
  return r.result?.result?.value;
};
await send('Runtime.enable');

// 顺手把测试用的红块删掉
await ev(`[...document.querySelectorAll('canvas')].filter(c=>c.style.border.includes('lime')).forEach(c=>c.remove()); 'cleaned'`);

const out = await ev(`new Promise((resolve) => {
  requestAnimationFrame(() => {
    try {
      const c = document.getElementById('game');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const w = 96, h = 96;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(Math.floor(c.width/2 - w/2), Math.floor(c.height/2 - h/2), w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const colors = new Set();
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = 0; i < px.length; i += 4) {
        r += px[i]; g += px[i+1]; b += px[i+2]; a += px[i+3];
        if (i % 40 === 0) colors.add(px[i] + ',' + px[i+1] + ',' + px[i+2]);
      }
      const n = px.length / 4;
      resolve({
        canvas: [c.width, c.height],
        avg: [Math.round(r/n), Math.round(g/n), Math.round(b/n), Math.round(a/n)],
        sampledColors: colors.size,
        sample: [...colors].slice(0, 6),
      });
    } catch (e) { resolve({ error: String(e) }); }
  });
})`);
console.log(JSON.stringify(out, null, 2));
ws.close(); process.exit(0);