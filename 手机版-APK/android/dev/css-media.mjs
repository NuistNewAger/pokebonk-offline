// 分析 CSS：找出相关选择器所在的 @media 分支
import fs from 'node:fs';
const file = process.argv[2];
const css = fs.readFileSync(file, 'utf8');
const want = [/\.ls-show/, /\.ls-stage/, /\.ls-spr/, /\.sp-card/, /\.sp-show/, /\.sp-row/];

const results = [];
let i = 0;
const stack = [];
while (i < css.length) {
  const open = css.indexOf('{', i);
  if (open < 0) break;
  const prelude = css.slice(i, open).trim();
  // 判断这个 { 是 at-rule 还是普通规则：用括号平衡找结尾
  let depth = 0, j = open;
  for (; j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}') { depth--; if (depth === 0) break; }
  }
  const body = css.slice(open + 1, j);
  const isAt = prelude.startsWith('@');
  if (isAt) {
    if (/^@(media|supports|container|layer|scope)/.test(prelude)) {
      stack.push(prelude);
      // 进入 at-rule 内部继续扫描
      const inner = body;
      let k = 0;
      while (k < inner.length) {
        const o2 = inner.indexOf('{', k);
        if (o2 < 0) break;
        const p2 = inner.slice(k, o2).trim();
        let d2 = 0, m2 = o2;
        for (; m2 < inner.length; m2++) {
          if (inner[m2] === '{') d2++;
          else if (inner[m2] === '}') { d2--; if (d2 === 0) break; }
        }
        const b2 = inner.slice(o2 + 1, m2);
        if (want.some((w) => w.test(p2)) && results.length < 40) {
          results.push({ at: [...stack], sel: p2.replace(/\s+/g, ' ').slice(0, 120), decl: b2.replace(/\s+/g, ' ').slice(0, 200) });
        }
        k = m2 + 1;
      }
      stack.pop();
      i = j + 1;
      continue;
    }
    // 其它 at-rule（keyframes/font-face）跳过
    i = j + 1;
    continue;
  }
  if (want.some((w) => w.test(prelude)) && results.length < 40) {
    results.push({ at: [], sel: prelude.replace(/\s+/g, ' ').slice(0, 120), decl: body.replace(/\s+/g, ' ').slice(0, 200) });
  }
  i = j + 1;
}

console.log('媒体查询分支下的相关规则:');
for (const r of results) {
  if (!r.at.length) continue;
  console.log(`\n@ ${r.at.join(' && ')}`);
  console.log(`   ${r.sel}`);
  console.log(`   { ${r.decl} }`);
}
console.log('\n无媒体查询（全局）的相关规则条数:', results.filter((r) => !r.at.length).length);

const medias = [...new Set(results.flatMap((r) => r.at))];
console.log('\n涉及的条件:', JSON.stringify(medias, null, 2));