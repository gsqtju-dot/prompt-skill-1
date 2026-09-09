const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const RAW_ITEMS = path.join(__dirname, 'debug', 'raw_items.json');
const OUTPUT_CSV = path.join(__dirname, 'authors_followers_xhs.csv');
const PROGRESS_FILE = path.join(__dirname, 'debug', 'progress.json');

const BASE = 'https://jimeng.jianying.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================
// 提取作者列表（去重）
// ============================================================
function loadAuthors() {
  const raw = JSON.parse(fs.readFileSync(RAW_ITEMS, 'utf8'));
  const map = new Map();
  for (const item of raw) {
    const a = item.author || {};
    const name = (a.name || '').trim();
    const secUid = a.sec_uid || '';
    if (!name || !secUid || map.has(name)) continue;
    map.set(name, {
      name,
      secUid,
      profileUrl: `${BASE}/ai-tool/personal/${secUid}`,
    });
  }
  return Array.from(map.values());
}

// ============================================================
// 加载/保存进度
// ============================================================
function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return { lastIndex: 0, results: [] };
  }
}
function saveProgress(idx, results) {
  const dir = path.dirname(PROGRESS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ lastIndex: idx, results }), 'utf8');
}

function writeCSV(rows) {
  const header = '排名,作者名,即梦粉丝,小红书账号,小红书链接,作者主页';
  const lines = rows.map((r, i) => {
    return `${i + 1},"${(r.name || '').replace(/"/g, '""')}","${r.followers || ''}","${r.xhsName || ''}","${r.xhsUrl || ''}","${r.profileUrl || ''}"`;
  });
  fs.writeFileSync(OUTPUT_CSV, '﻿' + [header, ...lines].join('\n'), 'utf8');
}

// ============================================================
// 从作者主页提取信息
// ============================================================
async function extractProfileInfo(page) {
  return page.evaluate(() => {
    let followers = '未找到';
    const xhsLinks = [];
    const allSocial = [];

    // 1. 找"粉丝"文本
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.children.length === 0 && el.textContent) {
        const t = el.textContent.trim();
        if ((t.includes('粉丝') || t.includes('follow')) && t.length < 30 && /\d/.test(t)) {
          if (!followers || followers === '未找到') {
            // 优先精确格式 "123粉丝" 或 "1.2万粉丝"
            if (/^[\d,.]+万?\s*(粉丝|follow)/i.test(t)) {
              followers = t;
            }
          }
        }
      }
    }

    // 回退：按行搜
    if (followers === '未找到') {
      for (const line of document.body.innerText.split('\n')) {
        const t = line.trim();
        if (t.includes('粉丝') && t.length < 40 && /\d/.test(t)) {
          followers = t;
          break;
        }
      }
    }

    // 2. 找小红书链接
    const links = document.querySelectorAll('a[href]');
    for (const link of links) {
      const href = link.href || '';
      const text = (link.textContent || '').trim();

      // 直接的小红书链接
      if (
        href.includes('xiaohongshu.com') ||
        href.includes('xhslink.com') ||
        href.includes('xiaohongshu') ||
        href.includes('redbook')
      ) {
        xhsLinks.push({ text, href });
      }

      // 检查文本是否提到小红书
      if (
        text.includes('小红书') ||
        text.includes('小红薯') ||
        text.includes('xiaohongshu') ||
        text.includes('RedNote') ||
        text.toLowerCase().includes('red book')
      ) {
        xhsLinks.push({ text, href });
      }

      // 收集所有外部社交链接
      if (
        href.includes('weibo.com') ||
        href.includes('bilibili.com') ||
        href.includes('douyin.com') ||
        href.includes('xiaohongshu.com') ||
        href.includes('xhslink.com') ||
        href.includes('twitter.com') ||
        href.includes('instagram.com')
      ) {
        allSocial.push({ platform: new URL(href).hostname, text, href });
      }
    }

    // 3. 没找到链接但页面文本里提到小红书
    let xhsText = '';
    if (xhsLinks.length === 0) {
      const bodyText = document.body.innerText;
      const idx = bodyText.indexOf('小红书');
      if (idx > -1) {
        xhsText = bodyText.substring(idx, idx + 80).replace(/\n/g, ' ');
      }
    }

    return {
      followers,
      xhsLinks: xhsLinks.map((l) => ({ text: l.text, href: l.href })),
      allSocial: allSocial.slice(0, 10),
      xhsText,
    };
  });
}

// ============================================================

(async () => {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  即梦作者主页 → 粉丝数 + 小红书链接 ║');
  console.log('╚══════════════════════════════════════╝\n');

  const authors = loadAuthors();
  console.log(`待处理: ${authors.length} 个作者\n`);

  // 加载进度（支持中断续传）
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
    console.log('✅ 已连接浏览器\n');
  } catch (e) {
    console.log('❌ 请先: chrome.exe --remote-debugging-port=9222');
    process.exit(1);
  }

  // ============================================================
  // 逐个访问
  // ============================================================
  console.log('开始抓取...\n');

  let xhsFoundCount = 0;

  for (let i = lastIndex; i < authors.length; i++) {
    const a = authors[i];
    const idx = `[${i + 1}/${authors.length}]`;
    process.stdout.write(`${idx} ${a.name} `);

    let profilePage;
    let followers = '未找到';
    let xhsName = '';
    let xhsUrl = '';

    try {
      profilePage = await browser.newPage();
      await profilePage.goto(a.profileUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      await sleep(1500);

      const info = await extractProfileInfo(profilePage);
      followers = info.followers;

      // 小红书链接
      if (info.xhsLinks.length > 0) {
        xhsFoundCount++;
        const xhs = info.xhsLinks[0];
        xhsName = xhs.text.replace(/[\/\\,:：，。\.\s]+/g, '').substring(0, 30) || '小红书';
        xhsUrl = xhs.href;
        console.log(`→ 粉丝:${followers}  小红书:${xhsUrl.substring(0, 50)}`);
      } else if (info.xhsText) {
        console.log(`→ 粉丝:${followers}  小红书文本:"${info.xhsText}"`);
        xhsName = info.xhsText.substring(0, 30);
      } else if (info.allSocial.length > 0) {
        const platforms = info.allSocial.map((s) => s.platform).join(',');
        console.log(`→ 粉丝:${followers}  其他社交: ${platforms}`);
      } else {
        console.log(`→ 粉丝:${followers}  无社交链接`);
      }

      await profilePage.close();
    } catch (e) {
      console.log(`→ 错误: ${e.message}`);
      if (profilePage) await profilePage.close().catch(() => {});
    }

    results.push({
      name: a.name,
      followers,
      xhsName,
      xhsUrl,
      profileUrl: a.profileUrl,
    });

    // 每 20 个保存进度 + CSV
    if ((i + 1) % 20 === 0) {
      saveProgress(i + 1, results);
      writeCSV(results);
      const eta = ((authors.length - i - 1) * 3.5 / 60).toFixed(0);
      console.log(`  💾 已保存 (${results.length}条, 找到${xhsFoundCount}个小红书, 预计剩余${eta}分钟)\n`);
    }

    // 间隔 2-3 秒
    await sleep(2000 + Math.random() * 1000);
  }

  // 最终保存
  saveProgress(authors.length, results);
  writeCSV(results);

  console.log('\n══════════════════════════════════════');
  console.log(`✅ 完成！`);
  console.log(`   总作者: ${results.length}`);
  console.log(`   有小红书链接: ${xhsFoundCount}`);
  console.log(`   CSV: ${OUTPUT_CSV}`);
  console.log('══════════════════════════════════════');

  await browser.disconnect();
})();
