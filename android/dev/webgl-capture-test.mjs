// 测试：截图能否捕获 WebGL 内容（注入一个红色 WebGL 覆盖层）
import fs from 'node:fs/promises';
import path from 'node:path';
const OUT = path.resolve(import.meta.dirname, '..', '..', 'state', 'android-probe');
const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json());
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); return p(m); } });
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(await ev(`(() => {
  const c = document.createElement('canvas');
  c.width = 300; c.height = 300;
  c.style.cssText = 'position:fixed;left:40px;top:350px;width:300px;height:300px;z-index:99999;border:4px solid lime';
  document.body.appendChild(c);
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return 'no webgl';
  gl.clearColor(1, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return 'red webgl canvas injected: ' + gl.getParameter(gl.VERSION);
})()`));
await sleep(1500);
const r = await send('Page.captureScreenshot', { format: 'png' });
if (r.result?.data) await fs.writeFile(path.join(OUT, 'webgl-test.png'), Buffer.from(r.result.data, 'base64'));
// 同时用设备端 screencap 对照
console.log('已保存 webgl-test.png');
ws.close(); process.exit(0);