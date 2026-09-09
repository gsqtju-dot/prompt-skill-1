const fs = require('fs');
const path = require('path');

const input = path.join(__dirname, 'debug', 'raw_items.json');
const output = path.join(__dirname, 'authors_works.csv');

const raw = JSON.parse(fs.readFileSync(input, 'utf8'));

console.log(`读取到 ${raw.length} 条作品数据\n`);

// 去重（同一作者可能有多个作品）
const rows = [];
const seen = new Set();

for (const item of raw) {
  const author = item.author || {};
  const common = item.common_attr || {};

  const name = (author.name || '').trim();
  const title = (common.title || '').trim();
  const secUid = author.sec_uid || '';
  const profileUrl = secUid
    ? `https://jimeng.jianying.com/ai-tool/personal/${secUid}`
    : '';

  rows.push({ name, title, profileUrl });
}

console.log(`共 ${rows.length} 条记录\n`);

// 统计作者数
const authorSet = new Set(rows.map((r) => r.name));
console.log(`去重作者数: ${authorSet.size}\n`);

// 输出预览
console.log('前 10 条预览:');
rows.slice(0, 10).forEach((r, i) => {
  console.log(`  ${i + 1}. ${r.name}  |  ${r.title}  |  ${r.profileUrl.substring(0, 50)}...`);
});

// 写 CSV
const header = '序号,作者名,作品名称,作者主页';
const lines = rows.map(
  (r, i) => `${i + 1},"${r.name.replace(/"/g, '""')}","${r.title.replace(/"/g, '""')}","${r.profileUrl}"`
);
fs.writeFileSync(output, '﻿' + [header, ...lines].join('\n'), 'utf8');

console.log(`\n✅ 已导出: ${output}`);
console.log(`   共 ${rows.length} 行 (${authorSet.size} 个作者)`);
