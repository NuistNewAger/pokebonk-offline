// 把本地存档里的星星沙子改到 100 万（给电脑单机版用）
// 直接用 Node 读写，保证与 server.mjs 的 JSON 格式完全一致（不经过 PowerShell 的序列化）
import fs from 'node:fs';

const target = process.argv[2];
const amount = Number(process.argv[3] || 1000000);
if (!target) {
  console.error('用法: node set-stardust.mjs <store.json路径> [数量]');
  process.exit(1);
}

const raw = fs.readFileSync(target, 'utf8');
const store = JSON.parse(raw);

// 先备份一份原始存档
fs.writeFileSync(target + '.bak', raw);

let changed = 0;
for (const acc of Object.values(store.accounts || {})) {
  const p = acc.profile || (acc.profile = {});
  const before = p.stardust;
  p.stardust = amount;
  // 累计值（图鉴/统计里会显示）也跟着抬到不低于当前持有量
  p.totalStardust = Math.max(Number(p.totalStardust) || 0, amount);
  console.log(`账号 ${acc.name}（guest=${acc.guest}）: 星星沙子 ${before} → ${p.stardust}，累计 → ${p.totalStardust}`);
  changed++;
}
if (!changed) console.log('存档里没有账号，未改动');

fs.writeFileSync(target, JSON.stringify(store));
console.log('已写入:', target, '（原文件备份为 .bak）');