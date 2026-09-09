const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const NAMES_FILE = path.join(__dirname, 'xhs_search_names.txt');
const OUTPUT_CSV = path.join(__dirname, 'xhs_followers.csv');
const PROGRESS_FILE = path.join(__dirname, 'debug', 'xhs_progress.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadNames() {
  const text = fs.readFileSync(NAMES_FILE, 'utf8');
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return { lastIndex: 0, results: [] }; }
}
function saveProgress(idx, results) {
  const dir = path.dirname(PROGRESS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ lastIndex: idx, results }), 'utf8');
}
function writeCSV(rows) {
  const header = '序号,搜索关键词,小红书昵称,小红书ID,粉丝数,小红书主页';
  const lines = rows.map((r, i) =>
    `${i + 1},"${(r.keyword || '').replace(/"/g, '""')}","${(r.xhsName || '').replace(/"/g, '""')}","${r.xhsId || ''}","${r.followers || ''}","${r.xhsUrl || ''}"`
  );
  fs.writeFileSync(OUTPUT_CSV, '﻿' + [header, ...lines].join('\n'), 'utf8');
}

async function searchXHS(page, keyword) {
  // 小红书搜索用户
  const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes&type=user`;
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2500);

  const result = await page.evaluate(() => {
    // 在用户搜索结果页提取用户卡片
    const users = [];

    // 小红书用户卡片常见选择器
    const cards = document.querySelectorAll(
      '[class*="user"], [class*="User"], [class*="card"], [class*="Card"], ' +
      '[class*="item"], [class*="Item"], section a[href*="/user/"]'
    );

    for (const card of cards) {
      const text = (card.textContent || '').trim();
      if (!text || text.length < 3) continue;

      // 找粉丝数
      let followers = '';
      const fMatch = text.match(/([\d,.]+万?)\s*(?:粉丝|fans?)/i);
      if (fMatch) followers = fMatch[0];
      if (!followers) {
        const fMatch2 = text.match(/(?:粉丝|fans?)\s*([\d,.]+万?)/i);
        if (fMatch2) followers = fMatch2[0];
      }

      // 找昵称（通常是最短的文本行）
      const lines = text.split('\n').filter((l) => l.trim());
      const name = lines[0]?.trim()?.substring(0, 30) || '';

      // 找小红书号 / ID
      let xhsId = '';
      const idMatch = text.match(/小红书[号ID]\s*[:：]?\s*(\S+)/);
      if (idMatch) xhsId = idMatch[1];
      if (!xhsId) {
        const idMatch2 = text.match(/RED\s*[:：]?\s*(\S+)/i);
        if (idMatch2) xhsId = idMatch2[1];
      }

      // 找链接
      const link = card.closest('a') || card.querySelector('a');
      const href = link ? link.href : '';

      if (name || followers) {
        users.push({ name, xhsId, followers, href });
      }
    }

    // 如果没找到结构化数据，尝试找带 "粉丝" 的行
    if (users.length === 0) {
      const bodyText = document.body.innerText;
      const lines = bodyText.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if ((line.includes('粉丝') || line.includes('关注')) && line.length < 50) {
          // 上一行或当前行可能是昵称
          const prevLine = i > 0 ? lines[i - 1].trim() : '';
          users.push({
            name: prevLine || line,
            xhsId: '',
            followers: line,
            href: '',
          });
        }
      }
    }

    return users.slice(0, 5); // 返回前5个匹配
  });

  return result;
}

// ============================================================

(async () => {
  console.log('╔══════════════════════════════════╗');
  console.log('║  小红书搜索 → 粉丝数爬取        ║');
  console.log('╚══════════════════════════════════╝\n');

  const names = loadNames();
  console.log(`待搜索: ${names.length} 个名字\n`);

  // 进度续传
  const progress = loadProgress();
  let { lastIndex, results } = progress;
  if (lastIndex > 0) {
    console.log(`从第 ${lastIndex + 1} 个继续...\n`);
  }

  // 连接浏览器
  let browser;
  try {
    const r = await fetch('http://127.0.0.1:9222/json/version');
    const info = await r.json();
    browser = await puppeteer.connect({
      browserWSEndpoint: info.webSocketDebuggerUrl,
      defaultViewport: null,
    });
    console.log('✅ 已连接浏览器');
    console.log('⚠  请确保已在浏览器中登录小红书 (xiaohongshu.com)\n');
  } catch (e) {
    console.log('❌ 请先: chrome.exe --remote-debugging-port=9222');
    process.exit(1);
  }

  console.log('开始搜索...\n');

  let foundCount = 0;

  for (let i = lastIndex; i < names.length; i++) {
    const keyword = names[i];
    const idx = `[${i + 1}/${names.length}]`;
    process.stdout.write(`${idx} "${keyword}" ... `);

    let xhsName = '', xhsId = '', followers = '', xhsUrl = '';

    try {
      const users = await searchXHS(page, keyword);

      if (users.length > 0) {
        foundCount++;
        const u = users[0];
        xhsName = u.name || '';
        xhsId = u.xhsId || '';
        followers = u.followers || '';
        xhsUrl = u.href || '';

        // 显示第一个匹配
        const preview = `${xhsName}` + (followers ? ` | ${followers}` : '') + (xhsId ? ` | ID:${xhsId}` : '');
        console.log(`✅ ${preview}`);

        // 如果有多个匹配，列出
        if (users.length > 1) {
          users.slice(1).forEach((u2) => {
            console.log(`      还有: ${u2.name} | ${u2.followers || '无粉丝'} | ${u2.xhsId || ''}`);
          });
        }
      } else {
        console.log('❌ 未找到');
      }
    } catch (e) {
      console.log(`❌ 错误: ${e.message}`);
    }

    results.push({ keyword, xhsName, xhsId, followers, xhsUrl });

    // 每 15 个保存
    if ((i + 1) % 15 === 0) {
      saveProgress(i + 1, results);
      writeCSV(results);
      const eta = ((names.length - i - 1) * 4 / 60).toFixed(0);
      console.log(`  💾 已保存 (${results.length}条, 找到${foundCount}个, 预计剩${eta}分钟)\n`);
    }

    // 间隔 3-4 秒（小红书限流更严）
    await sleep(3000 + Math.random() * 1000);
  }

  // 最终保存
  saveProgress(names.length, results);
  writeCSV(results);

  console.log('\n══════════════════════════════');
  console.log(`✅ 完成！找到 ${foundCount}/${names.length}`);
  console.log(`CSV: ${OUTPUT_CSV}`);
  console.log('══════════════════════════════');

  await browser.disconnect();
})();
