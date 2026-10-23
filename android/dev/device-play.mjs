// 真机对局验证：游客 → 选御三家 → 开始游戏 → 经典模式 → 地区 → 进入对局
import fs from 'node:fs/promises';
import path from 'node:path';
const OUT = path.resolve(import.meta.dirname, '..', '..', 'state', 'android-probe');
const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json());
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const events = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); return p(m); } if (m.method) events.push(m); });
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); if (r.result?.data) await fs.writeFile(path.join(OUT, n + '.png'), Buffer.from(r.result.data, 'base64')); };
const tap = (re) => ev(`(() => { const els=[...document.querySelectorAll('button,[role=button],a,div,span')].filter(e=>e.offsetParent!==null).sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length); const el=els.find(e=>${re}.test((e.innerText||'').trim())); if(!el) return 'NOT FOUND'; el.click(); return 'ok:'+(el.innerText||'').trim().slice(0,24); })()`);
const uiText = () => ev(`(document.getElementById('ui')?.innerText||'').replace(/\\s+/g,' ')`);
const key = async (k, code, vk) => { for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); };
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');

console.log('登录:', await tap('/^以游客身份游玩！?$/'));
await sleep(6000);
console.log('选御三家:', await tap('/#004|小火龙/'));
await sleep(700);
await tap('/^我选你了/');
await sleep(4500);
console.log('开始游戏:', await tap('/^开始游戏$/'));
await sleep(2500);
console.log('经典模式:', await tap('/经典模式/'));
await sleep(5000);
await tap('/^知道了$/');
await sleep(1000);
await tap('/^普通$/');
await sleep(800);
await shot('device-region');
console.log('地区界面:', String(await uiText()).slice(0, 90));
await key('Enter', 'Enter', 13);
await sleep(3000);
await key('Enter', 'Enter', 13);
await sleep(20000);
console.log('对局中:', String(await uiText()).slice(0, 200));
await shot('device-run');
await sleep(6000);
await shot('device-run2');

const errs = [...new Set(events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Network.responseReceived' && e.params.response.status >= 400))
  .map((e) => e.method === 'Runtime.exceptionThrown' ? 'EXC ' + (e.params.exceptionDetails?.exception?.description || '').slice(0, 150) : `[${e.params.response.status}] ${e.params.response.url.slice(0, 110)}`))];
console.log('错误:', errs.length ? errs.slice(0, 8) : '无');
ws.close(); process.exit(0);