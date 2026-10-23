// 诊断：真机上 WebGL / canvas 状态
const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json());
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const logs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); return p(m); }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 200));
  if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || '').slice(0, 200));
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(500);

console.log(JSON.stringify(await ev(`(() => {
  const c = document.getElementById('game');
  const probe = document.createElement('canvas');
  let glInfo = 'none';
  try {
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    glInfo = gl ? (gl.getParameter(gl.VERSION) + ' | ' + gl.getParameter(gl.RENDERER)) : 'null';
  } catch (e) { glInfo = 'throw:' + e.message; }
  return {
    canvas: c ? { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight, style: c.getAttribute('style') } : null,
    devicePixelRatio: window.devicePixelRatio,
    innerSize: [window.innerWidth, window.innerHeight],
    webgl: glInfo,
    canvases: [...document.querySelectorAll('canvas')].map(x => ({ id: x.id, w: x.width, h: x.height, cls: x.className })),
    fps: window.__pbFps ?? null,
  };
})()`), null, 2));

console.log('\n最近的控制台输出:');
for (const l of logs.slice(-25)) console.log('  ' + l);
ws.close(); process.exit(0);