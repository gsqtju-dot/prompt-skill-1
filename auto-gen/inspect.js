// 页面探查工具 — 打开 Done AI，截图并打印 DOM 结构，帮助确定选择器
// 用法: node inspect.js
// 在打开的浏览器中手动操作到关键步骤，终端按 Enter 截图分析

const { chromium } = require('playwright');
const path = require('path');
const readline = require('readline');
const config = require('./config');

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(q, ans => { rl.close(); resolve(ans); }));
}

(async () => {
  const userDataDir = path.join(__dirname, '.browser-data');

  console.log('启动浏览器...\n');
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chromium',
    viewport: { width: 1920, height: 1080 },
  });

  const page = browser.pages()[0] || await browser.newPage();

  // 打开主页
  console.log('1. 导航到 Done AI 主页');
  await page.goto(config.homeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 截图 + 提取关键 DOM
  await page.screenshot({ path: 'inspect_01_home.png' });
  console.log('   → 截图: inspect_01_home.png');

  // 打印所有 button / textarea / input
  const buttons = await page.$$eval('button', els => els.slice(0, 20).map(e => ({
    text: e.textContent.slice(0, 60),
    class: e.className.slice(0, 60),
    visible: e.offsetParent !== null,
  })));
  console.log('\n  === Buttons ===');
  buttons.forEach(b => console.log(`  "${b.text}" | .${b.class} | visible=${b.visible}`));

  const inputs = await page.$$eval('textarea, input, [contenteditable="true"]', els =>
    els.slice(0, 10).map(e => ({
      tag: e.tagName,
      placeholder: e.placeholder || '',
      class: e.className?.slice(0, 60) || '',
      visible: e.offsetParent !== null,
    }))
  );
  console.log('\n  === Inputs ===');
  inputs.forEach(i => console.log(`  <${i.tag}> placeholder="${i.placeholder}" | .${i.class} | visible=${i.visible}`));

  const selects = await page.$$eval('select, [role="listbox"], [role="combobox"]', els =>
    els.slice(0, 10).map(e => ({
      tag: e.tagName,
      class: e.className?.slice(0, 60) || '',
      options: e.options ? Array.from(e.options).slice(0, 10).map(o => o.text) : [],
    }))
  );
  console.log('\n  === Selects/Dropdowns ===');
  selects.forEach(s => console.log(`  <${s.tag}> .${s.class} options=${s.options.join('|')}`));

  console.log('\n---');
  console.log('请在浏览器中手动操作：填入 prompt，选择参数，点击生成，等待出图。');
  console.log('完成每个关键步骤后按 Enter 截图分析。');
  console.log('输入 q 退出。\n');

  let step = 2;
  while (true) {
    const ans = await ask(`步骤 ${step} (Enter=截图 q=退出): `);
    if (ans.toLowerCase() === 'q') break;

    const fname = `inspect_0${step}_step.png`;
    await page.screenshot({ path: fname });
    console.log(`  → 截图: ${fname}`);
    console.log(`  当前 URL: ${page.url()}`);

    // 打印新出现的按钮
    const newBtns = await page.$$eval('button', els => els.slice(0, 15).map(e => ({
      text: e.textContent.slice(0, 60),
    })));
    console.log(`  可见按钮: ${newBtns.map(b => `"${b.text}"`).join(' | ')}`);

    step++;
  }

  await browser.close();
  console.log('浏览器已关闭，截图文件在当前目录');
})();
