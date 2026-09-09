// 全量 DOM 探查 v3 — 针对 iframe 内容 + React 渲染后
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');

(async () => {
  const userDataDir = path.join(__dirname, '.browser-data');
  const outDir = path.join(__dirname, 'dom-output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const logLines = [];
  function log(msg) { console.log(msg); logLines.push(msg); }

  log('===== Full DOM Explorer v3 (iframe aware) =====');

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chromium',
    viewport: { width: 1920, height: 1080 },
  });

  const page = browser.pages()[0] || await browser.newPage();

  // Step 1: 打开主页，等网络空闲 + 额外等待 React 渲染
  await page.goto(config.homeUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(8000);
  log('URL: ' + page.url());

  const frames = page.frames();
  log(`Frames: ${frames.length}`);

  // 递归抓取所有 frame 中的 DOM
  function extractElements(frame, label) {
    return frame.evaluate((lbl) => {
      const res = { label: lbl, textareas: [], inputs: [], buttons: [], selects: [], allClickable: [] };

      document.querySelectorAll('textarea').forEach(e => res.textareas.push({
        placeholder: e.placeholder || '', name: e.name || '', id: e.id || '',
        className: (e.className || '').slice(0, 150),
        visible: e.offsetParent !== null,
        rect: JSON.stringify(e.getBoundingClientRect()),
        innerHTML: (e.innerHTML || '').slice(0, 50),
      }));

      document.querySelectorAll('input:not([type="hidden"])').forEach(e => res.inputs.push({
        type: e.type || '', placeholder: e.placeholder || '', name: e.name || '', id: e.id || '',
        className: (e.className || '').slice(0, 150),
        visible: e.offsetParent !== null,
      }));

      document.querySelectorAll('[contenteditable="true"]').forEach(e => res.inputs.push({
        type: 'contentEditable', tag: e.tagName,
        className: (e.className || '').slice(0, 150),
        visible: e.offsetParent !== null,
      }));

      document.querySelectorAll('button, [role="button"]').forEach(e => res.buttons.push({
        text: (e.textContent || '').trim().slice(0, 120),
        className: (e.className || '').slice(0, 150),
        visible: e.offsetParent !== null,
        rect: JSON.stringify(e.getBoundingClientRect()),
      }));

      document.querySelectorAll('select').forEach(e => res.selects.push({
        name: e.name, id: e.id,
        options: [...e.options].slice(0, 15).map(o => ({ t: o.text, v: o.value })),
      }));

      // 所有带点击事件的可见元素
      document.querySelectorAll('[onclick], [data-action], [class*="clickable"], a[href="#"]').forEach(e => res.allClickable.push({
        tag: e.tagName,
        text: (e.textContent || '').trim().slice(0, 60),
      }));

      return res;
    }, label).catch(err => ({ label, error: err.message }));
  }

  // 遍历所有 frame
  for (let i = 0; i < frames.length; i++) {
    const result = await extractElements(frames[i], `Frame-${i}`);
    fs.writeFileSync(path.join(outDir, `frame-${i}-elements.json`), JSON.stringify(result, null, 2), 'utf-8');
    log(`\n=== ${result.label} (${result.error || ''}) ===`);
    log(`  textareas: ${result.textareas?.length || 0}`);
    (result.textareas || []).forEach(e => log(`    "${e.placeholder}" .${e.className} visible=${e.visible}`));
    log(`  inputs: ${result.inputs?.length || 0}`);
    (result.inputs || []).forEach(e => log(`    type=${e.type} placeholder="${e.placeholder}" .${e.className} visible=${e.visible}`));
    log(`  buttons: ${result.buttons?.length || 0}`);
    (result.buttons || []).forEach(e => log(`    "${e.text}" visible=${e.visible}`));
    log(`  selects: ${result.selects?.length || 0}`);
    (result.selects || []).forEach(s => log(`    options: ${JSON.stringify(s.options)}`));
  }

  // Step 2: 点击"开始创作"
  log('\n--- Clicking "开始创作" ---');
  let clicked = false;
  // 可能在 Frame 0 也可能在 Frame 1
  for (let fi = 0; fi < frames.length && !clicked; fi++) {
    try {
      const frame = frames[fi];
      const el = frame.locator('text=开始创作').first();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        await el.click();
        log(`Clicked "开始创作" in Frame ${fi}`);
        clicked = true;
      }
    } catch (_) {}
  }

  if (!clicked) {
    log('Failed: 未找到"开始创作"按钮');
  }

  // 等 React 重新渲染
  await page.waitForTimeout(8000);
  log('URL after click: ' + page.url());

  // 再次抓取所有 frame
  const frames2 = page.frames();
  log(`\nFrames after click: ${frames2.length}`);
  for (let i = 0; i < frames2.length; i++) {
    const result = await extractElements(frames2[i], `After-Frame-${i}`);
    fs.writeFileSync(path.join(outDir, `after-frame-${i}-elements.json`), JSON.stringify(result, null, 2), 'utf-8');
    log(`\n=== ${result.label} ===`);
    log(`  textareas: ${result.textareas?.length || 0}`);
    (result.textareas || []).forEach(e => log(`    placeholder="${e.placeholder}" .${e.className} visible=${e.visible}`));
    log(`  inputs: ${result.inputs?.length || 0}`);
    (result.inputs || []).forEach(e => log(`    type=${e.type} placeholder="${e.placeholder}" visible=${e.visible}`));
    log(`  buttons: ${result.buttons?.length || 0}`);
    (result.buttons || []).forEach(e => log(`    "${e.text}" visible=${e.visible}`));
    log(`  selects: ${result.selects?.length || 0}`);
    (result.selects || []).forEach(s => log(`    options: ${JSON.stringify(s.options)}`));
  }

  // 截图
  await page.screenshot({ path: path.join(outDir, 'screenshot.png') });

  fs.writeFileSync(path.join(outDir, 'log.txt'), logLines.join('\n'), 'utf-8');
  log('\n===== DONE =====');
  log('All files in: ' + outDir);

  await browser.waitForTimeout(120000);
  await browser.close();
})();
