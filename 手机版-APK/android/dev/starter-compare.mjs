// 对比平板与电脑在「选御三家」界面的计算样式差异
//   node android/dev/starter-compare.mjs pc      （自己起无头 Chrome 跑到该界面）
//   node android/dev/starter-compare.mjs tablet  （连 adb 转发的真机 WebView）
import { spawn } from 'node:child_process';
import path from 'node:path';

const MODE = process.argv[2] || 'tablet';

const SNAPSHOT = `(() => {
  const pick = (el, props) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const o = { rect: [Math.round(r.width), Math.round(r.height)], cls: String(el.className).slice(0, 60) };
    for (const p of props) o[p] = cs[p];
    return o;
  };
  const q = (s) => document.querySelector(s);
  return {
    viewport: [innerWidth, innerHeight, devicePixelRatio],
    htmlClass: document.documentElement.className,
    bodyClass: document.body.className,
    htmlStyle: document.documentElement.getAttribute('style'),
    bodyStyle: document.body.getAttribute('style'),
    uiStyle: q('#ui') && q('#ui').getAttribute('style'),
    media: {
      w900: matchMedia('(max-width:900px)').matches,
      h560: matchMedia('(max-height:560px)').matches,
      coarse: matchMedia('(pointer:coarse)').matches,
      hoverNone: matchMedia('(hover:none)').matches,
      landscape: matchMedia('(orientation:landscape)').matches,
    },
    touchPoints: navigator.maxTouchPoints,
    spRow: pick(q('.sp-row'), ['display','gridTemplateColumns','gap','maxWidth','width','justifyItems']),
    spCard: pick(q('.sp-card'), ['display','flexDirection','alignItems','width','height','justifyContent','padding']),
    lsShow: pick(q('.sp-card .ls-show'), ['display','width','height','minHeight','alignSelf','position','overflow','backgroundImage']),
    lsStage: pick(q('.sp-card .ls-stage'), ['display','position','inset','top','bottom','left','right','width','height','justifyContent','alignItems']),
    lsSpr: pick(q('.sp-card canvas.ls-spr'), ['display','width','height','maxWidth','maxHeight','aspectRatio','transform','animationName','position']),
    lsSprStyleAttr: q('.sp-card canvas.ls-spr') && q('.sp-card canvas.ls-spr').getAttribute('style'),
    cardHTML: (q('.sp-card') ? q('.sp-card').outerHTML.slice(0, 600) : null),
  };
})()`;

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); return p(m); } });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await send('Runtime.enable');
  return { send, close: () => ws.close() };
}

if (MODE === 'tablet') {
  const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json());
  const page = list.find((t) => t.type === 'page');
  const c = await connect(page.webSocketDebuggerUrl);
  const r = await c.send('Runtime.evaluate', { expression: SNAPSHOT, returnByValue: true });
  console.log(JSON.stringify(r.result?.result?.value, null, 2));
  c.close();
  process.exit(0);
}

// ---- PC：起无头 Chrome，走到选御三家界面再采样 ----
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9340;
const profile = path.join(process.env.TEMP, 'cmp-' + Date.now());
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--headless=new',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-first-run', '--disable-extensions',
  '--window-size=1024,640', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch {} await sleep(250); }
const target = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('http://127.0.0.1:8899/')}`, { method: 'PUT' }).then((r) => r.json());
const c = await connect(target.webSocketDebuggerUrl);
const ev = async (x) => (await c.send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const tap = (re) => ev(`(() => { const els=[...document.querySelectorAll('button,[role=button],a,div,span')].filter(e=>e.offsetParent!==null).sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length); const el=els.find(e=>${re}.test((e.innerText||'').trim())); if(!el) return 'NOT FOUND'; el.click(); return 'ok'; })()`);
// 用设备模拟：触摸屏 + 2.5x 像素比
await c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 640, deviceScaleFactor: 2.5, mobile: false });
await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await sleep(16000);
await tap('/^以游客身份游玩！?$/');
await sleep(6000);
console.log('界面:', String(await ev(`(document.getElementById('ui')?.innerText||'').slice(0,40)`)));
const r = await c.send('Runtime.evaluate', { expression: SNAPSHOT, returnByValue: true });
console.log(JSON.stringify(r.result?.result?.value, null, 2));
c.close(); chrome.kill(); process.exit(0);