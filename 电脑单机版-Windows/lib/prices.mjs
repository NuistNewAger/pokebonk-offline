// 由 android/dev/extract-prices.mjs 从游戏包自动生成，请勿手改。
// 来源: main-CPuTGAQ--mvlr7rzv.js + news-CbTCXK8Y-mvlr7rzv.js
// 价格规则: we(x) = round(x * 0.85 / 5) * 5（游戏内 85 折 + 取整到 5）
export const we = (x) => Math.round((x * 0.85) / 5) * 5;
export const TABLE = { get: (a, i) => a[Math.min(i, a.length - 1)] };
export const LAB_ITEMS = {
  'slot-move': { max: 1, cost: () => we(1500) },
  'slot-vit': { max: 2, cost: (lv) => we(TABLE.get([1200,3000], lv)) },
  'reroll': { max: 6, cost: (lv) => we(120 * 1.4 ** lv) },
  'skip': { max: 6, cost: (lv) => we(80 * 1.4 ** lv) },
  'banish': { max: 6, cost: (lv) => we(150 * 1.4 ** lv) },
  'choice4': { max: 1, cost: () => we(3000) },
  'dmg': { max: 8, cost: (lv) => we(100 * 1.4 ** lv) },
  'hp': { max: 8, cost: (lv) => we(100 * 1.4 ** lv) },
  'spd': { max: 6, cost: (lv) => we(120 * 1.45 ** lv) },
  'xp': { max: 6, cost: (lv) => we(120 * 1.45 ** lv) },
  'gold': { max: 6, cost: (lv) => we(100 * 1.45 ** lv) },
  'luck': { max: 6, cost: (lv) => we(140 * 1.45 ** lv) },
  'magnet': { max: 5, cost: (lv) => we(80 * 1.45 ** lv) },
  'regen': { max: 5, cost: (lv) => we(120 * 1.45 ** lv) },
  'armor': { max: 6, cost: (lv) => we(120 * 1.45 ** lv) },
  'revive': { max: 1, cost: () => we(5000) },
  'research': { max: 4, cost: (lv) => we(250 * 1.6 ** lv) },
  'party': { max: 1, cost: () => we(3500) },
  'archive': { max: 4, cost: (lv) => we(TABLE.get([600,1200,2000,3000], lv)) },
  'crit': { max: 5, cost: (lv) => we(200 * 1.5 ** lv) },
  'atkspd': { max: 5, cost: (lv) => we(220 * 1.5 ** lv) },
  'area': { max: 5, cost: (lv) => we(200 * 1.5 ** lv) },
  'ult': { max: 5, cost: (lv) => we(250 * 1.5 ** lv) },
  'bag': { max: 1, cost: () => we(4000) },
};
export const ITEM_PRICES = {
  'soda-pop': 150, 'repel': 150, 'white-flute': 150, 'binding-band': 200, 'metronome': 200, 'smooth-rock': 250,
  'adrenaline-orb': 250, 'awakening': 250, 'old-rod': 300, 'burn-heal': 300, 'ice-heal': 300, 'metal-powder': 300,
  'lemonade': 250, 'secret-key': 300, 'gold-teeth': 300, 'macho-brace': 350, 'focus-band': 350, 'kings-rock': 400,
  'eviolite': 400, 'black-sludge': 400, 'lum-berry': 450, 'stick': 500, 'shed-shell': 500, 'razor-fang': 550,
  'cell-battery': 600, 'bicycle': 500, 'iron-ball': 500, 'fresh-water': 550, 'full-heal': 550, 'guard-spec': 600,
  'coin-case': 600, 'poke-doll': 550, 'dowsing-machine': 600, 'focus-sash': 900, 'comet-shard': 900, 'fire-stone': 1000,
  'thunder-stone': 1000, 'ice-stone': 1000, 'leaf-stone': 1000, 'protector': 1100, 'electirizer': 1100, 'revive': 1200,
  'griseous-orb': 1200, 'reaper-cloth': 1400, 'thick-club': 1100, 'rage-candy-bar': 1100, 'silph-scope': 1200, 'ss-ticket': 1200,
  'max-ether': 1200, 'moon-stone': 2200, 'silver-wing': 2500, 'sun-stone': 2500, 'adamant-orb': 2800, 'lustrous-orb': 2800,
  'soul-dew': 3000, 'dawn-stone': 3200, 'rainbow-wing': 3500, 'poke-flute': 3000, 'tm-case': 3200,
};
