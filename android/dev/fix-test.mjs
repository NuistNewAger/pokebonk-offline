// 在真机上试验修复写法：注入 button{align-items:...} 看卡片是否恢复
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

const measure = `(() => {
  const card = document.querySelector('.sp-card');
  const show = card && card.querySelector('.ls-show');
  const spr = card && card.querySelector('canvas.ls-spr');
  return {
    cardAlign: card ? getComputedStyle(card).alignItems : null,
    showW: show ? Math.round(show.getBoundingClientRect().width) : null,
    sprW: spr ? Math.round(spr.getBoundingClientRect().width) : null,
    sprH: spr ? Math.round(spr.getBoundingClientRect().height) : null,
  };
})()`;

console.log('修复前:', JSON.stringify(await ev(measure)));

for (const value of ['normal', 'stretch', 'inherit']) {
  await ev(`(() => {
    let s = document.getElementById('pb-fix-test');
    if (!s) { s = document.createElement('style'); s.id = 'pb-fix-test'; document.head.appendChild(s); }
    s.textContent = 'button { align-items: ${value} !important }';
    return 'set';
  })()`);
  await new Promise((r) => setTimeout(r, 400));
  console.log(`button{align-items:${value}} =>`, JSON.stringify(await ev(measure)));
}

// 顺带看看还有哪些 button 是 flex 容器、align-items 处于 flex-start
console.log('\n其他受影响的 flex 按钮:');
console.log(JSON.stringify(await ev(`(() => {
  const out = [];
  for (const b of document.querySelectorAll('button')) {
    const cs = getComputedStyle(b);
    if (cs.display.includes('flex') && cs.alignItems === 'flex-start') {
      out.push({ cls: String(b.className).slice(0,40), dir: cs.flexDirection, txt: (b.innerText||'').trim().slice(0,16) });
    }
  }
  return out.slice(0, 12);
})()`), null, 2));

// 清理试验样式
await ev(`document.getElementById('pb-fix-test')?.remove(); 'cleaned'`);
ws.close(); process.exit(0);