// Done AI 批量生图脚本
// 用法:
//   node generate.js              — 处理全部 prompt
//   node generate.js --dry-run    — 打印计划，不执行
//   node generate.js --style 2    — 只处理流派 2 (Bauhaus)
//   node generate.js --prompt 2-B — 只处理指定 prompt

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { loadPrompts } = require('./prompt-loader');
const config = require('./config');

// ===== 命令行参数解析 =====
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const singlePrompt = args.includes('--prompt') ? args[args.indexOf('--prompt') + 1] : null;
const targetStyle = args.includes('--style') ? parseInt(args[args.indexOf('--style') + 1]) : null;

// ===== 确保输出目录存在 =====
const outputDir = path.resolve(__dirname, config.outputDir);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// ===== 日志 =====
function log(msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] ${msg}`);
}

// ===== 写入 CSV =====
const csvPath = path.resolve(__dirname, config.resultsCsv);
function initCSV() {
  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, 'id,style,label,status,file,error\n', 'utf-8');
  }
}

function recordCSV(prompt, status, filePath, error) {
  const line = `${prompt.id},${prompt.style},${prompt.label},${status},${filePath || ''},${(error || '').replace(/,/g, ';')}\n`;
  fs.appendFileSync(csvPath, line, 'utf-8');
}

// ===== 页面操作辅助 =====
async function findElement(page, selectors) {
  for (const sel of selectors) {
    if (!sel) continue;
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        return el;
      }
    } catch (_) { /* 继续尝试下一个 */ }
  }
  return null;
}

// ===== 主流程 =====
async function generateOne(page, prompt, index, total) {
  log(`[${index + 1}/${total}] ${prompt.id}: ${prompt.label}`);

  try {
    // 1. 回到主页
    await page.goto(config.homeUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout.pageLoad });
    await page.waitForTimeout(2000);

    // 抓一帧截图用于调试
    await page.screenshot({ path: path.join(outputDir, `_debug_step1_home.png`) });

    // 2. 找到输入框并填入 prompt
    const input = await findElement(page, [
      config.selectors.promptInput,
      config.selectors.promptInputFallback,
      'textarea',
      '[contenteditable="true"]',
    ]);

    if (!input) {
      // 最后手段：点击 body 后全选粘贴
      log('  ⚠ 未找到输入框，尝试 Ctrl+V 粘贴');
      await page.click('body');
      await page.keyboard.press('Control+A');
      await page.waitForTimeout(200);
      await page.keyboard.press('Control+V');
    } else {
      await input.click();
      await page.waitForTimeout(300);
      // contenteditable div 用 type，textarea 用 fill
      const tagName = await input.evaluate(el => el.tagName.toLowerCase());
      if (tagName === 'textarea' || tagName === 'input') {
        await input.fill(prompt.text);
      } else {
        // contenteditable: 先清空再逐字输入
        await input.click();
        await page.keyboard.press('Control+A');
        await page.waitForTimeout(100);
        await input.fill(prompt.text);
      }
    }

    await page.waitForTimeout(config.timeout.input);
    log('  ✓ 已填入 prompt');

    // 3. 选择 16:9 横画幅
    const ratioBtn = await findElement(page, [
      config.selectors.ratioButton,
      'button:has-text("16:9")',
      '[role="radio"]:has-text("16:9")',
      'label:has-text("16:9")',
    ]);
    if (ratioBtn) {
      await ratioBtn.click();
      await page.waitForTimeout(500);
      log('  ✓ 已选 16:9');
    }

    // 4. 选择模型（Nano Banana Pro）
    const modelBtn = await findElement(page, [
      config.selectors.modelOptionNanoBanana,
      'label:has-text("Nano Banana")',
      'button:has-text("Nano Banana")',
    ]);
    if (modelBtn) {
      await modelBtn.click();
      await page.waitForTimeout(500);
      log('  ✓ 已选 Nano Banana Pro');
    }

    // 5. 点击生成
    const genBtn = await findElement(page, [
      config.selectors.generateButton,
      config.selectors.generateButtonFallback,
      'button:has-text("Generate")',
      'button:has-text("生成")',
      '[role="button"]:has-text("Generate")',
    ]);

    if (!genBtn) {
      await page.screenshot({ path: path.join(outputDir, `_debug_no_generate_btn.png`) });
      throw new Error('找不到生成按钮 — 检查截图 _debug_no_generate_btn.png');
    }

    await genBtn.click();
    log('  ⏳ 等待生图...');

    // 6. 等待页面跳转或图片出现
    // 可能情况 A: 跳转到结果页 → 等 URL 变化
    // 可能情况 B: 同页动态加载 → 等图片出现
    let imageGenerated = false;
    const startTime = Date.now();

    while (Date.now() - startTime < config.timeout.generateWait) {
      await page.waitForTimeout(config.timeout.pollInterval);

      // 检查是否有图片出现
      const img = await findElement(page, [
        config.selectors.resultImage,
        config.selectors.resultImageFallback,
        'img[src*="generate"]',
        'img[src*="result"]',
        '.image-container img',
        '[class*="result"] img',
      ]);

      if (img) {
        imageGenerated = true;
        break;
      }

      // 检查是否有下载按钮出现
      const dlBtn = await findElement(page, [
        config.selectors.downloadButton,
        config.selectors.downloadButtonFallback,
        'button[aria-label*="download"]',
        '[title*="download" i]',
        'svg[class*="download"]',
      ]);

      if (dlBtn) {
        imageGenerated = true;
        break;
      }

      // 每 15 秒打印进度
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      if (elapsed % 15 === 0) {
        log(`  ...等待中 (${elapsed}s)`);
      }
    }

    if (!imageGenerated) {
      await page.screenshot({ path: path.join(outputDir, `_debug_timeout_${prompt.id}.png`) });
      throw new Error(`生图超时 (${config.timeout.generateWait / 1000}s)`);
    }

    log('  ✓ 图片已生成');

    // 7. 下载图片
    const dlBtn = await findElement(page, [
      config.selectors.downloadButton,
      config.selectors.downloadButtonFallback,
      'button[aria-label*="download"]',
      '[title*="download" i]',
    ]);

    const fileName = `${prompt.id}_${prompt.label.replace(/[^a-zA-Z0-9一-鿿]/g, '_')}.png`;

    if (dlBtn) {
      // 方案 A: 点击下载按钮，用 Playwright 拦截下载
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
        dlBtn.click(),
      ]);

      if (download) {
        const filePath = path.join(outputDir, fileName);
        await download.saveAs(filePath);
        log(`  ✓ 已下载: ${filePath}`);
        recordCSV(prompt, 'OK', filePath, '');
        return;
      }
    }

    // 方案 B: 右键图片 → 另存为
    log('  ⚠ 下载按钮不可用，尝试右键保存');
    const img = await findElement(page, [
      'img[src*="generate"]',
      'img[src*="result"]',
      '.image-container img',
      '[class*="result"] img',
      'img',
    ]);

    if (img) {
      const src = await img.getAttribute('src');
      if (src && src.startsWith('http')) {
        // 直接下载图片 URL
        const response = await page.request.get(src);
        const buffer = await response.body();
        const filePath = path.join(outputDir, fileName);
        fs.writeFileSync(filePath, buffer);
        log(`  ✓ 已下载: ${filePath}`);
        recordCSV(prompt, 'OK', filePath, '');
        return;
      }
    }

    // 方案 C: 截图整个结果区域
    log('  ⚠ 无法获取图片 URL，截取区域截图');
    await page.screenshot({
      path: path.join(outputDir, fileName),
      fullPage: false,
    });
    recordCSV(prompt, 'SCREENSHOT', fileName, '使用区域截图');

  } catch (err) {
    log(`  ✗ 失败: ${err.message}`);
    recordCSV(prompt, 'FAILED', '', err.message);
    await page.screenshot({ path: path.join(outputDir, `_debug_error_${prompt.id}.png`) }).catch(() => {});
  }
}

// ===== 主入口 =====
(async () => {
  const allPrompts = loadPrompts();
  log(`从 prompts.md 加载了 ${allPrompts.length} 组 prompt`);

  // 过滤
  let prompts = allPrompts;
  if (singlePrompt) {
    prompts = prompts.filter(p => p.id === singlePrompt);
    if (prompts.length === 0) {
      console.log(`找不到 prompt "${singlePrompt}"`);
      console.log(`可用的 ID: ${allPrompts.map(p => p.id).join(', ')}`);
      process.exit(1);
    }
  }
  if (targetStyle) {
    const styleName = prompts[0]?.style || '';
    // 过滤特定流派（prompt.id 的前半部分就是流派编号）
    prompts = prompts.filter(p => p.id.startsWith(`${targetStyle}-`));
    if (prompts.length === 0) {
      console.log(`找不到流派 ${targetStyle} 的 prompt`);
      process.exit(1);
    }
  }

  console.log(`\n===== 计划 =====`);
  for (const p of prompts) {
    console.log(`  ${p.id}  ${p.label}`);
  }
  console.log(`共 ${prompts.length} 组\n`);

  if (dryRun) {
    console.log('--dry-run 模式，不执行实际操作');
    process.exit(0);
  }

  initCSV();

  // 启动浏览器（持久化上下文保持登录状态）
  const userDataDir = path.join(__dirname, '.browser-data');
  log('启动浏览器...');
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,  // 让用户能看到操作过程
    channel: 'chromium',
    viewport: { width: 1920, height: 1080 },
  });

  const page = browser.pages()[0] || await browser.newPage();

  try {
    for (let i = 0; i < prompts.length; i++) {
      await generateOne(page, prompts[i], i, prompts.length);
      // 每次生成间隔 2 秒
      await page.waitForTimeout(2000);
    }
    log('===== 全部完成 =====');
    log(`结果: ${csvPath}`);
    log(`图片: ${outputDir}`);
  } catch (err) {
    log(`脚本异常: ${err.message}`);
  } finally {
    await browser.close();
  }
})();
