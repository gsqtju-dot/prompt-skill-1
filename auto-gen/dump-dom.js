// 自动探查 Done AI 页面结构 v2 — 自动点击"开始创作"进入生图界面
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');

(async () => {
  const userDataDir = path.join(__dirname, '.browser-data');
  const outFile = path.join(__dirname, 'dom-dump.txt');
  const lines = [];

  function log(msg) {
    console.log(msg);
    lines.push(msg);
  }

  log('===== Done AI DOM Dump v2 =====');
  log('Time: ' + new Date().toISOString());
  log('');

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chromium',
    viewport: { width: 1920, height: 1080 },
  });

  const page = browser.pages()[0] || await browser.newPage();

  // Step 1: 打开主页
  log('--- Step 1: Home Page ---');
  await page.goto(config.homeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  log('URL: ' + page.url());
  log('Title: ' + await page.title());

  // 打印侧边栏菜单项
  const menuItems = await page.$$eval('.next-menu-item, [role="menuitem"], [role="option"]', els =>
    els.slice(0, 20).map(e => ({
      text: (e.textContent || '').trim().slice(0, 60),
      className: (e.className || '').slice(0, 80),
      role: e.getAttribute('role') || '',
    }))
  );
  log(`\nMenu items (${menuItems.length}):`);
  menuItems.forEach(m => log(JSON.stringify(m)));

  // Step 2: 点击"开始创作"
  log('\n--- Step 2: 点击"开始创作" ---');
  const createBtn = await page.locator('text=开始创作').first();
  if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await createBtn.click();
    log('已点击"开始创作"');
    await page.waitForTimeout(5000);
  } else {
    log('未找到"开始创作"，尝试其他入口');
  }

  log('Current URL: ' + page.url());

  // 打印当前输入元素
  const inputInfo = await page.$$eval('textarea, input, [contenteditable="true"]', els =>
    els.slice(0, 20).map((e, i) => ({
      index: i,
      tag: e.tagName.toLowerCase(),
      type: e.type || 'N/A',
      placeholder: e.placeholder || '',
      name: e.name || '',
      id: e.id || '',
      className: (e.className || '').slice(0, 120),
      contentEditable: e.contentEditable,
      visible: e.offsetParent !== null,
      aria: e.getAttribute('aria-label') || '',
      role: e.getAttribute('role') || '',
    }))
  );
  log(`\nInputs (${inputInfo.length}):`);
  inputInfo.forEach(i => log(JSON.stringify(i)));

  // 打印所有按钮（完整文本）
  const btnInfo = await page.$$eval('button, [role="button"]', els =>
    els.slice(0, 30).map((e, i) => ({
      index: i,
      tag: e.tagName.toLowerCase(),
      text: (e.textContent || '').slice(0, 120),
      className: (e.className || '').slice(0, 120),
      visible: e.offsetParent !== null,
      aria: e.getAttribute('aria-label') || '',
      title: e.getAttribute('title') || '',
      id: e.id || '',
    }))
  );
  log(`\nButtons (${btnInfo.length}):`);
  btnInfo.forEach(b => log(JSON.stringify(b)));

  // 打印 select / tab / radio 等
  const miscInfo = await page.$$eval('select, [role="tab"], [role="radio"], [role="listbox"], [role="combobox"], [role="radiogroup"]', els =>
    els.slice(0, 20).map(e => ({
      tag: e.tagName.toLowerCase(),
      role: e.getAttribute('role') || '',
      text: (e.textContent || '').slice(0, 120),
      className: (e.className || '').slice(0, 120),
      visible: e.offsetParent !== null,
    }))
  );
  log(`\nMisc controls (${miscInfo.length}):`);
  miscInfo.forEach(m => log(JSON.stringify(m)));

  // 打印所有可见的文字标签
  const allText = await page.$$eval('span, label, div', els =>
    [...new Set(
      els
        .filter(e => e.offsetParent !== null && e.children.length === 0 && e.textContent.trim().length > 0 && e.textContent.trim().length < 30)
        .map(e => e.textContent.trim())
    )].slice(0, 30)
  );
  log(`\nVisible short text labels: ${JSON.stringify(allText)}`);

  // 截图
  await page.screenshot({ path: 'debug_current_page.png' });

  // 等待用户手动完成生图流程
  log('\n\n========================================');
  log('请在浏览器中手动完成：输入 prompt → 选模型 → 生成 → 等出图');
  log('图片出来后，回到终端按 Ctrl+C 或等 60s');
  log('========================================\n');

  await page.waitForTimeout(60000);

  // Step 3: 结果页面
  log('\n--- Step 3: Result Page ---');
  log('URL: ' + page.url());

  const imgInfo = await page.$$eval('img', els =>
    els.slice(0, 25).map((e, i) => ({
      index: i,
      src: (e.src || '').slice(0, 300),
      alt: e.alt || '',
      width: e.naturalWidth,
      height: e.naturalHeight,
      className: (e.className || '').slice(0, 120),
      visible: e.offsetParent !== null,
    }))
  );
  log(`\nImages (${imgInfo.length}):`);
  imgInfo.forEach(i => log(JSON.stringify(i)));

  // 打印所有按钮（找下载）
  const allBtns = await page.$$eval('button, [role="button"], a, [aria-label], [title]', els =>
    els.slice(0, 40).map(e => ({
      tag: e.tagName.toLowerCase(),
      text: (e.textContent || '').slice(0, 100),
      className: (e.className?.baseVal || e.className || '').slice(0, 120),
      aria: e.getAttribute('aria-label') || '',
      title: e.getAttribute('title') || '',
      href: (e.href || '').slice(0, 100),
    }))
  );
  log(`\nAll interactive elements (${allBtns.length}):`);
  allBtns.forEach(b => log(JSON.stringify(b)));

  // 保存
  fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');
  log('\n===== DONE =====');
  log('Output: ' + outFile);

  await browser.close();
})();
