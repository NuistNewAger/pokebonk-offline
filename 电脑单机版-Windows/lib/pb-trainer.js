/* PokéBonk 离线版 · 修改器
 * ------------------------------------------------------------------
 * 两种用法：
 *   1) 游戏内浮层：本地服务器把它注入到 index.html，游戏里按 F8 或点右上角“改”打开。
 *   2) 独立页面：  http://127.0.0.1:8787/__pb/trainer
 *
 * 能改什么
 *   · 对局内（内存，立即生效）：宝可币、重随/跳过/放逐剩余次数、待选等级、
 *     无敌（锁定无敌帧）、时间倍速、回满血
 *   · 存档（写 data/store.json，自动备份）：星尘、研究所全部等级、道具全解锁、
 *     清空放逐名单、解锁全部图鉴
 *
 * 对局对象由服务器在打包游戏 JS 时注入的一行 window.__pbRun=this 暴露出来
 * （见 server.mjs 的 applyRunHook），因此换游戏版本也能用；万一失效，
 * “对局内”面板会显示未连接，但存档修改依然可用。
 */
(function () {
  'use strict';

  const standalone = /(^|[?&])standalone=1/.test(location.search);
  const API = '/__pb/trainer';
  const HOTKEY = 'F8';

  // ------------------------------------------------------------ 样式 ----
  const CSS = `
  #pbt-btn{position:fixed;top:10px;right:10px;z-index:2147483000;width:38px;height:38px;border-radius:10px;
    background:#1b1630;color:#ffd75e;border:2px solid #6a5acd;font:700 15px/1 system-ui,sans-serif;cursor:pointer;
    box-shadow:0 4px 14px rgba(0,0,0,.45);opacity:.92}
  #pbt-btn:hover{opacity:1;transform:scale(1.05)}
  #pbt{position:fixed;top:10px;right:10px;z-index:2147483001;width:344px;max-height:88vh;overflow:auto;
    background:#141126f2;color:#e9e6ff;border:2px solid #6a5acd;border-radius:14px;
    font:13px/1.5 system-ui,"Microsoft YaHei",sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.6);padding:10px 12px 14px}
  #pbt *{box-sizing:border-box}
  #pbt h1{font-size:14px;margin:0;color:#ffd75e;display:flex;align-items:center;gap:6px}
  #pbt .hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  #pbt .x{cursor:pointer;color:#9b93c9;font-size:16px;padding:0 4px}
  #pbt .x:hover{color:#fff}
  #pbt .tabs{display:flex;gap:6px;margin-bottom:10px}
  #pbt .tabs button{flex:1;padding:6px 0;border-radius:8px;border:1px solid #4b4290;background:#221c3d;color:#cfc9f5;cursor:pointer;font-size:12px}
  #pbt .tabs button.on{background:#6a5acd;color:#fff;border-color:#8b7cf0}
  #pbt .row{display:flex;align-items:center;gap:6px;margin:5px 0}
  #pbt .row>label{flex:0 0 66px;color:#b9b2e6;font-size:12px}
  #pbt input[type=number]{width:82px;padding:3px 6px;border-radius:6px;border:1px solid #4b4290;background:#0f0d1e;color:#fff;font:12px system-ui}
  #pbt button.b{padding:3px 8px;border-radius:6px;border:1px solid #4b4290;background:#2a2350;color:#ded9ff;cursor:pointer;font-size:12px}
  #pbt button.b:hover{background:#3a3170}
  #pbt button.p{background:#3d2f7a;border-color:#8b7cf0}
  #pbt button.d{background:#5a2140;border-color:#c05a8b}
  #pbt .st{font-size:11.5px;color:#8f88bb;margin:2px 0 8px}
  #pbt .val{color:#7ef0b0;font-weight:600}
  #pbt .off{color:#ff9a9a}
  #pbt hr{border:0;border-top:1px solid #332b5e;margin:10px 0}
  #pbt .note{font-size:11px;color:#8f88bb;line-height:1.6}
  #pbt .ok{color:#7ef0b0}
  #pbt .err{color:#ff9a9a}
  #pbt label.ck{display:flex;align-items:center;gap:4px;color:#cfc9f5;font-size:12px;cursor:pointer}
  #pbt select{width:100%;padding:4px;border-radius:6px;border:1px solid #4b4290;background:#0f0d1e;color:#fff;font-size:12px}
  .pbt-flash{animation:pbtf .6s}
  @keyframes pbtf{0%{background:#6a5acd}100%{background:transparent}}
  `;

  // ------------------------------------------------------------ 工具 ----
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'style') Object.assign(n.style, v);
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid);
    return n;
  };
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const run = () => window.__pbRun || null;
  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('zh-CN') : String(n ?? '—'));

  async function api(path, body) {
    const res = await fetch(API + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }

  // 锁定：每 200ms 把被锁的值写回去
  const locks = new Map(); // key -> value
  let lockTimer = null;
  function syncLocks() {
    if (locks.size && !lockTimer) {
      lockTimer = setInterval(() => {
        const r = run();
        if (!r) return;
        for (const [k, v] of locks) {
          try { r[k] = v; } catch { /* 忽略 */ }
        }
      }, 200);
    } else if (!locks.size && lockTimer) {
      clearInterval(lockTimer);
      lockTimer = null;
    }
  }
  const toggleLock = (key, value, on) => {
    if (on) locks.set(key, value); else locks.delete(key);
    syncLocks();
  };

  // 幸运值锁：写的是 run.player.stats.luck，单独一个定时器
  let luckLock = null;
  function lockLuck(value) {
    if (luckLock) { clearInterval(luckLock); luckLock = null; }
    if (value == null) { locks.delete('luck'); return; }
    locks.set('luck', value);
    luckLock = setInterval(() => {
      const r = run();
      if (r?.player?.stats) r.player.stats.luck = value;
    }, 200);
  }

  // 无敌锁：写 run.player.iframes（受伤入口 hurt() 就是靠它免疫），每 100ms 补一次
  let iframeLock = null;
  function lockIframes(on, value = 999) {
    if (iframeLock) { clearInterval(iframeLock); iframeLock = null; }
    if (!on) { locks.delete('iframes'); return; }
    locks.set('iframes', value);
    const tick = () => { const r = run(); if (r?.player) r.player.iframes = value; };
    tick();
    iframeLock = setInterval(tick, 100);
  }

  // Boss 伤害闸门：游戏给 boss 设了 capRate = maxHp / 预算秒数（25~40 秒），
  // 单段伤害会被 capHit() 削到额度以内 —— 所以伤害数字很大但血条掉得慢。
  // capRate>0 才会走这个闸门，持续清零即可解除（boss 新出场也会被立刻清掉）。
  let capLock = null;
  function lockBossCap(on) {
    if (capLock) { clearInterval(capLock); capLock = null; }
    if (!on) { locks.delete('bossCap'); return; }
    locks.set('bossCap', 1);
    const tick = () => {
      const arr = run()?.enemies?.capRate;
      if (!arr || typeof arr.length !== 'number') return;
      for (let i = 0; i < arr.length; i++) if (arr[i] > 0) arr[i] = 0;
    };
    tick();
    capLock = setInterval(tick, 300);
  }

  // ------------------------------------------------------------ 面板 ----
  css();
  function css() {
    if (document.getElementById('pbt-css')) return;
    document.head.append(el('style', { id: 'pbt-css', html: CSS }));
  }

  const body = el('div');
  const tabsBar = el('div', { class: 'tabs' });
  const panel = el('div', { id: 'pbt' },
    el('div', { class: 'hd' },
      el('h1', {}, '🛠 PokéBonk 修改器'),
      el('span', { class: 'x', title: '关闭', onclick: () => panel.remove() }, '✕')),
    tabsBar,
    body);
  const btn = el('button', { id: 'pbt-btn', title: `修改器（${HOTKEY}）`, onclick: open }, '改');

  let tab = standalone && !run() ? 'save' : 'run';

  function open() {
    btn.remove();
    if (!panel.isConnected) document.body.append(panel);
    render();
  }
  function close() {
    panel.remove();
    if (!btn.isConnected) document.body.append(btn);
  }

  function render() {
    tabsBar.replaceChildren(
      tabBtn('run', '对局内'), tabBtn('save', '存档'), tabBtn('about', '说明'));
    body.replaceChildren(tab === 'run' ? viewRun() : tab === 'save' ? viewSave() : viewAbout());
  }
  const tabBtn = (id, label) => el('button', {
    class: tab === id ? 'on' : '', onclick: () => { tab = id; render(); },
  }, label);

  // ---------------------------------------------------- 对局内面板 ----
  let saveMsg = null;

  function viewRun() {
    const r = run();
    const wrap = el('div');
    if (!r) {
      const hooked = !!window.__pbHookLoaded;
      wrap.append(el('div', { class: 'st off' },
        hooked ? '还没进入对局：请在菜单里点“开始游戏”真正打起来。' : '游戏脚本是旧缓存，缺少修改器钩子。'));
      wrap.append(el('div', { class: 'note' },
        hooked
          ? ['修改器在游戏每帧更新时抓取对局对象，进入战斗后这里会自动变成“已连接”。',
            el('br'), '如果打起来了还连不上，说明这个版本的游戏 JS 结构变了，需要更新注入规则。']
          : ['按 F5（或 Ctrl+R）刷新一下游戏页面即可 —— 刷新后脚本会带上修改器钩子。',
            el('br'), '如果刷新后仍是这样，请确认本地服务器是刚重启过的。']));
      wrap.append(el('hr'), el('button', { class: 'b', onclick: () => location.reload() }, '🔄 刷新游戏页面'));
      wrap.append(' ', el('button', { class: 'b', onclick: render }, '重新检测'));
      return wrap;
    }
    wrap.append(el('div', { class: 'st' },
      el('span', { class: 'ok' }, '● 已连接对局'), '　局内数值实时生效'));

    // 宝可币
    wrap.append(el('div', { class: 'row' },
      el('label', { title: '对局内货币：商店购物、开箱子、转盘都用它。锁定后捡钱花钱都不变。' }, '宝可币'),
      el('span', { class: 'val', id: 'pbt-gold' }, fmt(r.gold)),
      el('input', { type: 'number', id: 'pbt-gold-in', value: '99999' }),
      el('button', { class: 'b p', onclick: () => { r.gold = num(inp('pbt-gold-in').value); render(); } }, '设为'),
      el('button', { class: 'b', onclick: () => { r.gold += 10000; render(); } }, '+1万'),
      lockCk('gold', () => num(inp('pbt-gold-in').value))));

    // 重随 / 跳过 / 放逐
    for (const [key, label] of [['rerolls', '重随次数'], ['skips', '跳过次数'], ['banishes', '放逐次数']]) {
      wrap.append(el('div', { class: 'row' },
        el('label', { title: key === 'rerolls' ? '升级三选一时用来刷新选项的次数（基础 2 + 研究所等级）' : key === 'skips' ? '跳过本次升级选择、直接换钱（基础 2 + 研究所等级）' : '把某个强化从本局后续选项里永久移除（基础 1 + 研究所等级）' }, label),
        el('span', { class: 'val' }, fmt(r[key])),
        el('input', { type: 'number', id: `pbt-${key}-in`, value: '99' }),
        el('button', { class: 'b p', onclick: () => { r[key] = num(inp(`pbt-${key}-in`).value); render(); } }, '设为'),
        el('button', { class: 'b', onclick: () => { r[key] += 1; render(); } }, '+1'),
        el('button', { class: 'b', onclick: () => { r[key] += 5; render(); } }, '+5'),
        lockCk(key, () => num(inp(`pbt-${key}-in`).value))));
    }

    wrap.append(el('hr'));
    // 待选等级
    wrap.append(el('div', { class: 'row' },
      el('label', { title: '排队中还没选的升级次数：每弹一次强化选择消耗 1。设成 10 就会连弹 10 次三选一（研究所第四选项满级为四选一）。' }, '待选等级'),
      el('span', { class: 'val' }, fmt(r.pendingLevels)),
      el('input', { type: 'number', id: 'pbt-pendingLevels-in', value: '10' }),
      el('button', { class: 'b p', onclick: () => { r.pendingLevels = num(inp('pbt-pendingLevels-in').value); render(); } }, '设为'),
      el('button', { class: 'b', onclick: () => { r.pendingLevels += 10; render(); } }, '+10')));

    // 临时加成：游戏自己就用 run.tempMods 挂增益（耿鬼祭坛等），这里手动塞进去
    const myMods = (r.tempMods || []).filter((m) => m && m.pbTrainer);
    wrap.append(el('hr'));
    wrap.append(el('div', { class: 'st' }, '临时加成（本局有效，已加 ' + myMods.length + ' 项）'));
    const modRow = (label, mod) => el('button', {
      class: 'b', style: { flex: '1' },
      onclick: () => {
        if (!Array.isArray(r.tempMods)) r.tempMods = [];
        r.tempMods.push({ ...mod, pbTrainer: true });
        try { r.player?.recompute?.(); } catch { /* 忽略 */ }
        render();
      },
    }, label);
    wrap.append(el('div', { class: 'row' },
      modRow('伤害 ×2', { stat: 'damage', mul: 2 }),
      modRow('金币 ×5', { stat: 'gold', mul: 5 }),
      modRow('经验 ×5', { stat: 'xpGain', mul: 5 })));
    wrap.append(el('div', { class: 'row' },
      modRow('攻速 ×2', { stat: 'attackSpeed', mul: 2 }),
      modRow('移速 ×1.5', { stat: 'moveSpeed', mul: 1.5 }),
      modRow('暴击 +50%', { stat: 'critChance', add: 0.5 })));
    wrap.append(el('div', { class: 'row' },
      modRow('回血 +10', { stat: 'regen', add: 10 }),
      modRow('范围 ×2', { stat: 'area', mul: 2 }),
      modRow('幸运 +500', { stat: 'luck', add: 500 })));
    wrap.append(el('div', { class: 'row' },
      el('button', {
        class: 'b d', style: { flex: '1' },
        onclick: () => {
          if (Array.isArray(r.tempMods)) r.tempMods = r.tempMods.filter((m) => !(m && m.pbTrainer));
          try { r.player?.recompute?.(); } catch { /* 忽略 */ }
          render();
        },
      }, '清除修改器加成')));

    // 幸运值：游戏里是 run.player.stats.luck（影响闪光/稀有掉落），每帧可能被重算，所以带锁定
    const pl = r.player && r.player.stats ? r.player.stats : null;
    wrap.append(el('div', { class: 'row' },
      el('label', { title: 'run.player.stats.luck：影响闪光与稀有事件概率。游戏每帧会重算，需要锁定才稳定。' }, '幸运值'),
      el('span', { class: 'val' }, pl ? fmt(Math.round(pl.luck ?? 0)) : '—'),
      el('input', { type: 'number', id: 'pbt-luck-in', value: '500' }),
      el('button', {
        class: 'b p', onclick: () => {
          if (r.player?.stats) r.player.stats.luck = num(inp('pbt-luck-in').value);
          render();
        },
      }, '设为'),
      el('button', {
        class: 'b', onclick: () => {
          if (r.player?.stats) r.player.stats.luck += 100;
          render();
        },
      }, '+100'),
      el('label', { class: 'ck' },
        el('input', {
          type: 'checkbox', ...(locks.has('luck') ? { checked: 'checked' } : {}),
          onchange: (e) => {
            // 锁定走 player.stats，用专用定时器写（通用锁定只写 run 上的字段）
            if (e.target.checked) lockLuck(num(inp('pbt-luck-in').value));
            else lockLuck(null);
          },
        }), ' 锁定')));

    wrap.append(el('hr'));
    // 无敌：游戏里真正管用的是「无敌帧」player.iframes（hurt() 开头就 return），
    // 类字段 godMode 从没被任何代码读取，是开发遗留，所以这里改用 iframes 锁定。
    const iframeOn = locks.has('iframes');
    wrap.append(el('div', { class: 'row' },
      el('label', { title: '锁定无敌帧（player.iframes）：hurt() 一开头就检查它，锁住等于免疫一切伤害。' }, '无敌'),
      el('label', { class: 'ck' },
        el('input', {
          type: 'checkbox', ...(iframeOn ? { checked: 'checked' } : {}),
          onchange: (e) => { lockIframes(e.target.checked); render(); },
        }), ' 开（锁定无敌帧）'),
      el('span', { class: 'st' }, iframeOn ? '当前 ' + Math.round(r.player?.iframes ?? 0) : '')));

    const hp = r.player && typeof r.player.hp === 'number' ? r.player.hp : null;
    const maxHp = r.player && typeof r.player.maxHp === 'number' ? r.player.maxHp : null;
    wrap.append(el('div', { class: 'row' },
      el('label', { title: '当前血量 / 上限，点“回满血”立刻恢复。' }, '生命'),
      el('span', { class: 'val' }, hp == null ? '—' : `${Math.round(hp)}${maxHp ? ' / ' + Math.round(maxHp) : ''}`),
      el('button', {
        class: 'b p', onclick: () => {
          if (r.player && maxHp) r.player.hp = maxHp;
          else if (r.player && typeof r.player.hp === 'number') r.player.hp = 9999;
          render();
        },
      }, '回满血'),
      el('button', {
        class: 'b', onclick: () => { lockIframes(!locks.has('iframes')); render(); },
      }, iframeOn ? '关无敌' : '开无敌')));

    // Boss 伤害闸门开关
    const capOn = locks.has('bossCap');
    wrap.append(el('div', { class: 'row' },
      el('label', { title: '游戏给 Boss 设了每秒掉血上限（capRate = 最大生命 / 25~40 秒），所以伤害数字很大但血条掉得慢。打开这个开关会持续清零该上限，Boss 就会按真实伤害掉血。' }, 'Boss 上限'),
      el('label', { class: 'ck' },
        el('input', {
          type: 'checkbox', ...(capOn ? { checked: 'checked' } : {}),
          onchange: (e) => { lockBossCap(e.target.checked); render(); },
        }), ' 解除（Boss 按真实伤害掉血）')));

    wrap.append(el('div', { class: 'row' },
      el('label', { title: '游戏内时间流速，2× 就是双倍速。' }, '时间倍速'),
      ...[0.5, 1, 2, 3, 5].map((v) => el('button', {
        class: 'b' + (Math.abs(num(r.timeScale) - v) < 0.01 ? ' p' : ''),
        onclick: () => { r.timeScale = v; render(); },
      }, `${v}×`))));

    wrap.append(el('hr'));
    wrap.append(el('div', { class: 'row' },
      el('button', {
        class: 'b p', onclick: () => {
          const rr = run(); if (!rr) return;
          rr.gold = 999999;
          rr.rerolls = rr.skips = rr.banishes = 99;
          rr.pendingLevels = Math.max(num(rr.pendingLevels), 10);
          lockIframes(true);          // 真·无敌（锁无敌帧）
          if (rr.player?.stats) rr.player.stats.luck = Math.max(num(rr.player.stats.luck), 500);
          lockLuck(Math.max(num(rr.player?.stats?.luck), 500));
          for (const [k, v] of [['gold', 999999], ['rerolls', 99], ['skips', 99], ['banishes', 99]]) locks.set(k, v);
          syncLocks();
          render();
        },
      }, '一键全拉满（含锁定）'),
      el('button', {
        class: 'b d', onclick: () => { locks.clear(); lockIframes(false); lockLuck(null); syncLocks(); render(); },
      }, '解除所有锁定')));

    wrap.append(el('div', { class: 'st' },
      '击杀 ', el('b', {}, fmt(r.stats?.kills)), '　阶段 ', el('b', {}, fmt(r.stage)),
      '　时间 ', el('b', {}, Math.round(num(r.time)) + 's')));
    return wrap;
  }

  const inp = (id) => document.getElementById(id) || { value: '0' };
  function lockCk(key, valFn, label = '锁定') {
    return el('label', { class: 'ck' },
      el('input', {
        type: 'checkbox', ...(locks.has(key) ? { checked: 'checked' } : {}),
        onchange: (e) => { toggleLock(key, valFn(), e.target.checked); },
      }), ' ' + label);
  }

  // ------------------------------------------------------ 存档面板 ----
  let selAccId = null;   // 记住选中的账号，重绘后不能丢
  let sett = {};         // 服务器端的修改器设置（档案库容量等）

  function viewSave() {
    const wrap = el('div');
    wrap.append(el('div', { class: 'st' }, '直接改本地存档 data/store.json（改前自动备份为 .bak）'));

    const sel = el('select', {
      id: 'pbt-acc',
      onchange: (e) => { selAccId = e.target.value; saveMsg = null; },   // 只记选择，不重绘
    });
    const info = el('div', { class: 'st' });

    api('/accounts').then((d) => {
      sett = d.settings || {};
      const chosen = selAccId && d.accounts.some((a) => a.id === selAccId) ? selAccId : d.accounts[0]?.id;
      selAccId = chosen;
      sel.replaceChildren(...d.accounts.map((a) => el('option', {
        value: a.id, ...(a.id === chosen ? { selected: 'selected' } : {}),
      }, `${a.name}${a.guest ? '（游客）' : ''} · 🌟${fmt(a.stardust)}`)));
      if (d.accounts.length === 0) sel.append(el('option', {}, '（还没有账号）'));
      wrap.replaceChild(sel, wrap.querySelector('#pbt-acc'));
      const a = d.accounts.find((x) => x.id === chosen);
      if (a) info.textContent = `${a.name}：研究所 ${a.labCount} 项，道具 ${a.itemCount} 件，图鉴 ${a.seenCount} 种`;
      else info.textContent = '还没有账号：先在游戏里创建账号或游客进入一次';
    }).catch((e) => { info.innerHTML = `<span class="err">读取失败：${e.message}</span>`; });

    wrap.append(sel, info);
    const accId = () => selAccId || sel.value;

    const stIn = el('input', { type: 'number', id: 'pbt-star-in', value: '1000000' });
    wrap.append(el('div', { class: 'row' }, el('label', {}, '星尘'), stIn,
      el('button', { class: 'b p', onclick: () => apply({ id: accId(), action: 'stardust', value: num(stIn.value), mode: 'set' }) }, '设为'),
      el('button', { class: 'b', onclick: () => apply({ id: accId(), action: 'stardust', value: num(stIn.value), mode: 'add' }) }, '增加')));

    const bigBtn = (label, payload, cls = 'b p') => el('button', {
      class: cls, style: { flex: '1' }, onclick: () => apply({ id: accId(), ...payload }),
    }, label);

    wrap.append(el('hr'));
    wrap.append(el('div', { class: 'row' },
      bigBtn('研究所全满', { action: 'lab-all', level: 'max' }),
      bigBtn('研究所清零', { action: 'lab-all', level: 0 }, 'b d')));
    wrap.append(el('div', { class: 'row' },
      bigBtn('道具全解锁', { action: 'items-all' }),
      bigBtn('清空放逐名单', { action: 'banished-clear' }, 'b')));
    wrap.append(el('div', { class: 'row' },
      bigBtn('解锁全部图鉴', { action: 'dex-all' }, 'b d')));
    wrap.append(el('hr'));
    // 档案库容量：游戏里是 5 × 档案库等级（4 级 = 20），这里改的是容量函数本身
    wrap.append(el('div', { class: 'row' },
      el('label', {}, '档案库容量'),
      el('input', { type: 'number', id: 'pbt-arch-in', value: '100' }),
      el('button', {
        class: 'b p',
        onclick: () => apply({ id: accId(), action: 'archive-cap', value: num(inp('pbt-arch-in').value) }),
      }, '固定为'),
      el('button', {
        class: 'b',
        onclick: () => apply({ id: accId(), action: 'archive-cap', value: 0 }),
      }, '恢复官方')));
    wrap.append(el('div', { class: 'st' }, '当前：' + (sett.archiveCap > 0 ? `固定 ${sett.archiveCap}` : '官方算法（5 × 等级）') + '　改完回游戏按 F5 生效'));
    wrap.append(el('div', { class: 'row' },
      bigBtn('↩ 还原到修改前（用 .bak）', { action: 'restore-backup' }, 'b')));
    wrap.append(el('hr'));
    wrap.append(el('div', { class: 'st' }, '地区与难度解锁（官方靠逐个通关开启）'));
    wrap.append(el('div', { class: 'row' },
      bigBtn('按通关记录补解锁', { action: 'unlock-tier' }, 'b p'),
      bigBtn('解锁全部地区+难度', { action: 'unlock-biomes' }, 'b d')));
    wrap.append(el('div', { class: 'note' },
      '· 研究所全满后进对局即获得最大重随/跳过/放逐次数（基础值 + 等级）',
      el('br'), '· 解锁全部图鉴会写入联盟/已见/已捕获名单，可能影响成就统计',
      el('br'), '· 对局内的即时数值改动不写入存档，退出即失效',
      el('br'), '· 每次启动服务器后第一次修改会备份一次，点上面的按钮可把该账号退回去'));

    if (saveMsg) wrap.append(el('div', { class: saveMsg.ok ? 'st ok' : 'st err' }, saveMsg.text));
    return wrap;
  }

  async function apply(payload) {
    try {
      const d = await api('/apply', payload);
      saveMsg = { ok: true, text: `✅ ${d.message}` };
      if (d.warning) saveMsg.text += `（${d.warning}）`;
    } catch (e) {
      saveMsg = { ok: false, text: `❌ ${e.message}` };
    }
    render();
  }

  // -------------------------------------------------------- 说明 ----
  function viewAbout() {
    return el('div', {},
      el('div', { class: 'note' },
        el('b', {}, '快捷键'), el('br'), `${HOTKEY} 打开/关闭面板；右上角“改”按钮同样可以打开。`, el('br'), el('br'),
        el('b', {}, '对局内数值'), el('br'),
        '宝可币、重随、跳过、放逐、待选等级、幸运值、无敌（锁定无敌帧）、时间倍速、回血，以及一组“临时加成”（伤害/金币/经验/攻速/移速/暴击/回血/范围/幸运）。',
        '这些是内存里的实时值，勾了“锁定”会每 0.2 秒写回一次，适合“无限”玩法。',
        el('br'), '临时加成走的是游戏自己的 run.tempMods（耿鬼祭坛就是用它），点一下加一项，可随时“清除修改器加成”。', el('br'), el('br'),
        el('b', {}, '存档数值'), el('br'),
        '星尘、研究所等级、道具、放逐名单、图鉴。写入 data/store.json，并在修改前备份为 store.json.bak。', el('br'), el('br'),
        el('b', {}, '原理'), el('br'),
        '本地服务器把游戏 JS 里的每帧更新函数补一行 window.__pbRun=this，修改器就拿到了对局对象；',
        '存档部分走 /__pb/trainer/apply 接口。所有改动都在你本机，仅用于个人离线游玩。'));
  }

  // -------------------------------------------------------- 启动 ----
  function boot() {
    document.body.append(standalone ? panel : btn);
    if (standalone) { panel.style.position = 'static'; panel.style.margin = '24px auto'; }
    window.addEventListener('keydown', (e) => {
      if (e.key === HOTKEY || e.key === 'F8') {
        e.preventDefault(); e.stopPropagation();
        panel.isConnected ? close() : open();
      }
    }, true);
    // 面板内的按键不要传给游戏
    panel.addEventListener('keydown', (e) => e.stopPropagation(), true);
    panel.addEventListener('keyup', (e) => e.stopPropagation(), true);
    if (!standalone) {
      // 每帧刷新数值显示（仅在“对局内”页且面板打开时）
      setInterval(() => {
        if (!panel.isConnected || tab !== 'run') return;
        const r = run();
        const g = document.getElementById('pbt-gold');
        if (r && g) g.textContent = fmt(r.gold);
      }, 400);
    }
    if (standalone) document.title = 'PokéBonk 修改器';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.__pbTrainer = { open, close, run, locks };
})();