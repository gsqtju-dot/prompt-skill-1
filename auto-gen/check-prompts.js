// 验证 promps.md 中所有 prompt 字符数
const fs = require('fs');
const path = require('path');

const target = process.argv[2] || '../domains/architectural-drawing-styles/prompts.md';
const promptsPath = path.join(__dirname, target);
const content = fs.readFileSync(promptsPath, 'utf-8');
const lines = content.split('\n');

const prompts = [];
let inCodeBlock = false;
let blockLines = [];
let currentLabel = '';

for (const line of lines) {
  const labelMatch = line.match(/^###\s+Prompt\s+(\d+-\w+)\s*\((.+)\)/);
  if (labelMatch) {
    currentLabel = labelMatch[1] + ' ' + labelMatch[2];
    continue;
  }
  if (line.trim() === '```' && currentLabel && !inCodeBlock) {
    inCodeBlock = true;
    blockLines = [];
    continue;
  }
  if (line.trim() === '```' && inCodeBlock) {
    inCodeBlock = false;
    const text = blockLines.join('\n').trim();
    if (text.length > 0) {
      prompts.push({
        id: currentLabel.split(' ')[0],
        label: currentLabel,
        length: text.length,
        status: text.length > 536 ? 'OVER!' : 'OK',
      });
    }
    currentLabel = '';
    continue;
  }
  if (inCodeBlock) blockLines.push(line);
}

prompts.forEach(p => console.log(`${p.id} | ${p.length} chars | ${p.status}`));
console.log(`\nTotal: ${prompts.length} prompts`);
const over = prompts.filter(p => p.length > 536);
if (over.length > 0) {
  console.log(`\nWARNING: ${over.length} prompts over 536 chars!`);
  over.forEach(p => console.log(`  ${p.id}: ${p.length}`));
} else {
  console.log('All prompts OK!');
}
