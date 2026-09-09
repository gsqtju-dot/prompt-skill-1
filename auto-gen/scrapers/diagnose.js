const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('=== 页面诊断工具 v2 ===\n');

  // 连接浏览器
  let browser;
  try {
    const resp = await fetch('http://127.0.0.1:9222/json/version');
    const info = await resp.json();
    browser = await puppeteer.connect({
      browserWSEndpoint: info.webSocketDebuggerUrl,
      defaultViewport: null,
    });
    console.log('✅ 已连接浏览器\n');
  } catch (e) {
    console.log('❌ 请先启动: chrome.exe --remote-debugging-port=9222');
    process.exit(1);
  }

  // 找活动页
  const pages = await browser.pages();
  let page = null;
  for (const p of pages) {
    if (p.url().includes('activity-detail') || p.url().includes('dreamina')) {
      page = p;
      break;
    }
  }
  if (!page) { page = pages[pages.length - 1]; }
  console.log(`目标: ${page.url()}\n`);

  // ============================================================
  // Step 1: 滚动加载所有内容
  // ============================================================
  console.log('━━━ Step 1: 滚动加载 ━━━\n');

  let prevCount = 0;
  let scrollAttempts = 0;
  const maxScrolls = 30;

  // 先找滚动容器
  const scrollInfo = await page.evaluate(() => {
    // 找所有可滚动的容器
    const scrollables = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.scrollHeight > el.clientHeight + 10) {
        scrollables.push({
          tag: el.tagName,
          class: (el.className || '').toString().substring(0, 100),
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          scrollTop: el.scrollTop,
        });
      }
    }
    return scrollables;
  });
  console.log('页面内可滚动容器:');
  scrollInfo.forEach((s) => console.log(`  <${s.tag}> "${s.class}" scrollH=${s.scrollHeight} clientH=${s.clientHeight}`));
  console.log('');

  while (scrollAttempts < maxScrolls) {
    const currentCount = await page.$$eval('[class*="author-"]', (els) => els.length);
    console.log(`  滚动 ${scrollAttempts + 1}: 当前可见 ${currentCount} 个作者`);

    if (currentCount === prevCount && scrollAttempts > 2) {
      // 找加载更多按钮（修复选择器）
      const loadMoreBtn = await page.evaluate(() => {
        const all = document.querySelectorAll('button, span, div, a');
        for (const el of all) {
          const t = (el.textContent || '').trim();
          if ((t.includes('更多') || t.includes('加载') || t.includes('展开')) && el.offsetHeight > 0) {
            el.click();
            return t;
          }
        }
        return null;
      });
      if (loadMoreBtn) {
        console.log(`  点击了: "${loadMoreBtn}"`);
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        console.log('  数量稳定且无加载按钮，可能已全部加载');
        break;
      }
    }

    prevCount = currentCount;

    // 同时滚动 window 和内部滚动容器
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      // 也滚动内部滚动容器
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (el.scrollHeight > el.clientHeight + 10) {
          el.scrollTop = el.scrollHeight;
        }
      }
    });
    await new Promise((r) => setTimeout(r, 1500));

    scrollAttempts++;
  }

  // ============================================================
  // Step 2: 提取所有作者元素
  // ============================================================
  console.log('\n━━━ Step 2: 作者元素分析 ━━━\n');

  const allAuthors = await page.$$eval('[class*="author-"]', (els) =>
    els.map((el, idx) => {
      // 向上找可能的点击目标 / 卡片容器
      let clickTarget = el;
      let card = el;
      for (let i = 0; i < 8; i++) {
        card = card?.parentElement;
        if (!card) break;
        const cls = (card.className || '').toString();
        if (
          cls.includes('card') || cls.includes('Card') ||
          cls.includes('item') || cls.includes('Item') ||
          cls.includes('entry') || cls.includes('work')
        ) break;
      }

      // 在卡片内找链接
      const links = (card || el.parentElement)?.querySelectorAll?.('a[href]') || [];

      return {
        index: idx + 1,
        name: (el.textContent || '').trim(),
        authorClass: el.className?.toString() || '',
        tagName: el.tagName,
        parentTag: el.parentElement?.tagName || '',
        parentClass: el.parentElement?.className?.toString()?.substring(0, 100) || '',
        cardTag: card?.tagName || '',
        cardClass: (card?.className || '').toString()?.substring(0, 120) || '',
        linksInCard: Array.from(links).map((l) => ({
          href: (l.href || '').substring(0, 120),
          text: (l.textContent || '').trim().substring(0, 30),
          class: l.className?.toString()?.substring(0, 80) || '',
        })),
        // 父元素完整 HTML 片段
        parentHTML: el.parentElement?.outerHTML?.substring(0, 300) || '',
      };
    })
  );

  console.log(`总共找到 ${allAuthors.length} 个作者:\n`);
  allAuthors.forEach((a) => {
    console.log(`  [${a.index}] ${a.name}`);
    console.log(`    作者class: "${a.authorClass}"`);
    console.log(`    父元素: <${a.parentTag}> "${a.parentClass}"`);
    console.log(`    卡片: <${a.cardTag}> "${a.cardClass}"`);
    if (a.linksInCard.length > 0) {
      console.log(`    卡片内链接 (${a.linksInCard.length}):`);
      a.linksInCard.forEach((l) => {
        console.log(`      → ${l.text}  |  ${l.href}  |  class="${l.class}"`);
      });
    } else {
      console.log(`    卡片内无链接！父级HTML片段:`);
      console.log(`      ${a.parentHTML}`);
    }
    console.log('');
  });

  // ============================================================
  // Step 3: 点击测试（仅对第一个作者）
  // ============================================================
  console.log('━━━ Step 3: 点击测试 ━━━\n');

  if (allAuthors.length > 0) {
    const firstAuthor = allAuthors[0];
    console.log(`测试点击: "${firstAuthor.name}"\n`);

    // 记录点击前的标签页
    const beforePages = await browser.pages();
    const beforeUrls = beforePages.map((p) => p.url());

    // 点击作者名
    try {
      const authorEl = await page.$('[class*="author-"]');
      if (authorEl) {
        await authorEl.click();
        console.log('  已点击。等待 3 秒...\n');
        await new Promise((r) => setTimeout(r, 3000));

        // 检查变化
        const afterPages = await browser.pages();
        console.log(`  当前标签页数: ${afterPages.length} (之前 ${beforePages.length})`);

        // 列出新 URL
        for (const p of afterPages) {
          const u = p.url();
          if (!beforeUrls.includes(u)) {
            console.log(`  🆕 新标签页: ${u}`);
          }
        }

        // 当前页 URL 是否变了
        const currentUrl = page.url();
        console.log(`  当前页URL: ${currentUrl}`);

        if (currentUrl !== beforeUrls.find((u) => u.includes('activity'))) {
          console.log('  ⚡ 当前页发生了跳转（SPA 路由 or 导航）');
        }
      }
    } catch (e) {
      console.log(`  点击失败: ${e.message}`);
    }
  }

  // ============================================================
  // Bonus: 尝试拦截 API 请求获取原始数据
  // ============================================================
  console.log('\n━━━ Bonus: API 请求拦截 ━━━\n');
  console.log('重新加载页面以捕获 API 请求...\n');

  // 设置拦截
  const apiCalls = [];
  page.on('response', async (response) => {
    const url = response.url();
    // 关注可能是数据接口的请求
    if (
      url.includes('api') ||
      url.includes('activity') ||
      url.includes('list') ||
      url.includes('work') ||
      url.includes('author') ||
      url.includes('participant') ||
      url.includes('entry') ||
      url.includes('contest')
    ) {
      try {
        const ct = response.headers()['content-type'] || '';
        if (ct.includes('json') || ct.includes('text')) {
          const text = await response.text();
          apiCalls.push({
            url: url.substring(0, 200),
            status: response.status(),
            preview: text.substring(0, 500),
            full: text.length < 5000 ? text : text.substring(0, 5000) + '...(truncated)',
          });
        }
      } catch (e) {}
    }
  });

  // 重新加载
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 5000));

  console.log(`捕获到 ${apiCalls.length} 个可能的 API 请求:\n`);
  apiCalls.forEach((call, i) => {
    console.log(`  [${i + 1}] ${call.url}`);
    console.log(`     status: ${call.status}`);
    console.log(`     preview: ${call.preview}`);
    console.log('');
  });

  // 把完整 API 响应保存到文件
  if (apiCalls.length > 0) {
    const dir = path.join(__dirname, 'debug');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'api_responses.json'),
      JSON.stringify(apiCalls, null, 2),
      'utf8'
    );
    console.log('完整 API 响应已保存到 debug/api_responses.json');
  }

  console.log('\n=== 诊断完成 ===');
  console.log('\n请把以上完整输出 + debug/api_responses.json 发给我。');
  await browser.disconnect();
})();
