const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ACTIVITY_URL =
  'https://jimeng.jianying.com/ai-tool/activity-detail/2026-172-dreamina-weekly-challenge';
const BASE = 'https://jimeng.jianying.com';
const OUTPUT_CSV = path.join(__dirname, 'authors_followers.csv');
const DEBUG_DIR = path.join(__dirname, 'debug');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function writeCSV(rows) {
  const header = '排名,作者名,作者主页,粉丝数';
  const lines = rows.map(
    (r, i) =>
      `${i + 1},"${(r.name || '').replace(/"/g, '""')}","${r.profileUrl || ''}","${r.followers || ''}"`
  );
  fs.writeFileSync(OUTPUT_CSV, '﻿' + [header, ...lines].join('\n'), 'utf8');
  console.log(`\nCSV: ${OUTPUT_CSV} (${rows.length} 条)`);
}

function prompt(msg) {
  return new Promise((resolve) => {
    process.stdout.write(msg + ' ');
    process.stdin.once('data', (d) => resolve(d.toString().trim()));
  });
}

// ============================================================

(async () => {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  即梦AI 爬虫 v6 - 拦截 API 模式     ║');
  console.log('╚══════════════════════════════════════╝\n');

  // ---- 连接浏览器 ----
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

  // ---- 找到或创建活动页 ----
  const pages = await browser.pages();
  let page = null;
  for (const p of pages) {
    if (p.url().includes('activity-detail') || p.url().includes('dreamina')) {
      page = p;
      break;
    }
  }
  if (!page) {
    page = pages[pages.length - 1];
  }

  // ---- 拦截 API 响应 ----
  const workListItems = []; // 收集所有作品数据
  let msToken = '';

  page.on('response', async (resp) => {
    const url = resp.url();
    // 捕获 msToken
    if (url.includes('msToken=')) {
      const m = url.match(/msToken=([^&]+)/);
      if (m) msToken = m[1];
    }
    // 捕获作品列表 API
    if (url.includes('get_weekly_challenge_work_list')) {
      try {
        const text = await resp.text();
        const json = JSON.parse(text);
        if (json.ret === '0' && json.data && json.data.item_list) {
          json.data.item_list.forEach((item) => workListItems.push(item));
          console.log(
            `  📦 API 拦截: +${json.data.item_list.length} 条, 累计 ${workListItems.length}, has_more=${json.data.has_more}`
          );
        }
      } catch (e) { /* ignore parse errors */ }
    }
  });

  // ---- 导航并触发数据加载 ----
  console.log('加载页面并触发数据...\n');

  // 如果不在活动页，先导航
  if (!page.url().includes('activity-detail')) {
    await page.goto(ACTIVITY_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  } else {
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  }

  await sleep(3000);

  // 滚动加载全部数据（页面是虚拟列表，需要不断滚动触发分页）
  console.log('滚动页面触发分页加载...\n');
  const scrollContainer = 'div[class*="scroll-container"]';

  let prevCount = 0;
  let noChangeCount = 0;

  for (let i = 0; i < 50; i++) {
    // 滚动内部容器
    await page.evaluate((sel) => {
      const container = document.querySelector(sel);
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
      window.scrollTo(0, document.body.scrollHeight);
    }, scrollContainer);

    await sleep(1500);

    const currentCount = workListItems.length;
    if (currentCount === prevCount) {
      noChangeCount++;
      if (noChangeCount >= 5) {
        console.log(`数据稳定 (${currentCount} 条)，停止滚动`);
        break;
      }
    } else {
      noChangeCount = 0;
    }
    prevCount = currentCount;
  }

  console.log(`\n━━━ 拦截到 ${workListItems.length} 个作品 ━━━\n`);

  if (workListItems.length === 0) {
    console.log('❌ 未捕获到 API 数据。');
    console.log('请确认：1) 已登录 2) 页面显示了作品列表');
    console.log(`msToken: ${msToken || '(未捕获到)'}`);
    await browser.disconnect();
    process.exit(1);
  }

  // ---- 提取作者 ----
  if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DEBUG_DIR, 'raw_items.json'),
    JSON.stringify(workListItems, null, 2),
    'utf8'
  );
  console.log('原始数据: debug/raw_items.json\n');

  // 解析作者，尝试找 uid
  const authorMap = new Map();

  for (const item of workListItems) {
    const a = item.author || {};
    const name = (a.name || '').trim();
    if (!name || authorMap.has(name)) continue;

    // 遍历 author 对象所有字段找 uid
    const uidFields = ['sec_uid', 'user_id', 'author_id', 'uid', 'personal_id', 'id', 'open_id', 'account_id'];
    let uid = '';
    for (const f of uidFields) {
      if (a[f]) { uid = a[f]; break; }
    }
    // 如果标准字段都没找到，找包含 "uid" 或 "_id" 的字段
    if (!uid) {
      for (const key of Object.keys(a)) {
        if ((key.includes('uid') || key.includes('_id') || key.includes('Id')) && typeof a[key] === 'string' && a[key].length > 5) {
          uid = a[key];
          break;
        }
      }
    }

    authorMap.set(name, {
      name,
      uid,
      profileUrl: uid ? `${BASE}/ai-tool/personal/${uid}` : '',
      avatar: a.avatar_url || '',
      _authorKeys: Object.keys(a).join(', '),
    });
  }

  const authors = Array.from(authorMap.values());
  console.log(`去重后 ${authors.length} 个作者:\n`);
  authors.forEach((a, i) => {
    const status = a.profileUrl ? '✅' : '⚠ 无uid';
    console.log(`  ${String(i + 1).padStart(2)}. ${a.name} ${status}`);
  });

  // 列出无 uid 的作者
  const noUid = authors.filter((a) => !a.uid);
  if (noUid.length > 0) {
    console.log(`\n⚠ ${noUid.length} 个作者缺少 uid。author 对象字段:`);
    noUid.forEach((a) => {
      console.log(`  ${a.name}: keys = [${a._authorKeys}]`);
    });
    console.log('\n请把上面字段名发给我，我来修正 uid 提取。');
  }

  console.log(`\nraw_items.json 中第一个 item 的完整 author 对象:`);
  const firstAuthor = workListItems[0]?.author;
  if (firstAuthor) {
    console.log(JSON.stringify(firstAuthor, null, 2).substring(0, 500));
  }

  await prompt('\n按回车继续获取粉丝数...');

  // ---- 获取粉丝数 ----
  console.log('\n━━━ 获取粉丝数 ━━━\n');

  const results = [];

  for (let i = 0; i < authors.length; i++) {
    const author = authors[i];
    const idx = `[${i + 1}/${authors.length}]`;
    process.stdout.write(`${idx} ${author.name} ... `);

    let followers = 'N/A';

    if (author.profileUrl) {
      let pp;
      try {
        pp = await browser.newPage();
        await pp.goto(author.profileUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(2000);

        followers = await pp.evaluate(() => {
          for (const line of document.body.innerText.split('\n')) {
            const t = line.trim();
            if (t && (t.includes('粉丝') || t.toLowerCase().includes('follower')) && t.length < 40) return t;
          }
          return '未找到';
        });

        console.log(`→ ${followers}`);
      } catch (e) {
        console.log('→ 错误');
        followers = '错误';
      } finally {
        if (pp) await pp.close().catch(() => {});
      }
    } else {
      console.log('→ 无主页');
    }

    results.push({ name: author.name, profileUrl: author.profileUrl, followers });

    if ((i + 1) % 10 === 0) writeCSV(results);
    await sleep(2000 + Math.random() * 2000);
  }

  writeCSV(results);
  console.log('\n✅ 完成');
  await browser.disconnect();
})();
