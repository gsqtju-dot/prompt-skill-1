// 从 prompts.md 解析所有 prompt
const fs = require('fs');
const path = require('path');

const promptsPath = path.join(__dirname, '..', 'domains', 'architectural-walkthrough', 'prompts.md');

function loadPrompts() {
  const content = fs.readFileSync(promptsPath, 'utf-8');
  const lines = content.split('\n');

  const prompts = [];
  let currentStyle = null;
  let currentLabel = null;
  let inCodeBlock = false;
  let blockLines = [];

  for (const line of lines) {
    // 检测流派标题: "## N. StyleName"
    const styleMatch = line.match(/^##\s+\d+\.\s+(.+)/);
    if (styleMatch) {
      currentStyle = styleMatch[1].trim();
      continue;
    }

    // 检测 prompt 标签: "### Prompt N-X (Label)"
    const labelMatch = line.match(/^###\s+Prompt\s+(\d+-\w+)\s*\((.+)\)/);
    if (labelMatch) {
      currentLabel = labelMatch[1] + ' ' + labelMatch[2];
      continue;
    }

    // 代码块开始
    if (line.trim() === '```' && currentLabel && !inCodeBlock) {
      inCodeBlock = true;
      blockLines = [];
      continue;
    }

    // 代码块结束
    if (line.trim() === '```' && inCodeBlock) {
      inCodeBlock = false;
      const text = blockLines.join('\n').trim();
      if (text.startsWith('Horizontal interior photo')) {
        prompts.push({
          style: currentStyle,
          label: currentLabel,
          id: currentLabel.split(' ')[0],
          text: text,
        });
      }
      currentLabel = null;
      continue;
    }

    // 收集代码块内容
    if (inCodeBlock) {
      blockLines.push(line);
    }
  }

  return prompts;
}

module.exports = { loadPrompts };
