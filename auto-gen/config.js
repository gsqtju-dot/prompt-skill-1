// Done AI 自动化配置 — 根据实际网页调整选择器
// 使用方法: 先运行 node inspect.js 查看页面结构，然后修改下面的选择器

module.exports = {
  // ===== 页面 URL =====
  homeUrl: 'https://done.alibaba-inc.com/done-ai/done-agent/home',

  // ===== 生成参数 =====
  model: 'nano-banana-pro',  // 'nano-banana-pro' | 'gpt-image-2'
  aspectRatio: '16:9',

  // ===== DOM 选择器（按实际页面调整）=====
  selectors: {
    // prompt 输入框 — 可能是 textarea / contenteditable div / input
    promptInput: 'textarea[placeholder*="describe"]',
    promptInputFallback: '[contenteditable="true"]',

    // 模型选择
    modelDropdown: 'select, [role="combobox"]',
    modelOptionNanoBanana: 'text=Nano Banana Pro',
    modelOptionGPTImage: 'text=GPT Image 2',

    // 横画幅 16:9 按钮
    ratioButton: 'text=16:9',

    // 生成按钮
    generateButton: 'button:has-text("Generate")',
    generateButtonFallback: 'button:has-text("生成")',

    // 结果页 — 图片元素
    resultImage: 'img[alt*="generated"]',
    resultImageFallback: '.result-container img',

    // 下载按钮（图片右上角）
    downloadButton: 'button[aria-label*="download"]',
    downloadButtonFallback: '[data-icon="download"]',

    // 图片右键菜单 OR 另存为区域
    imageContainer: '.image-container, .result-panel',
  },

  // ===== 超时配置（毫秒）=====
  timeout: {
    generateWait: 120000,   // 等待生图完成（2 分钟）
    pollInterval: 3000,     // 轮询间隔
    pageLoad: 30000,        // 页面加载
    input: 5000,            // 输入延迟
  },

  // ===== 输出 =====
  outputDir: '../domains/architectural-walkthrough/outputs',
  resultsCsv: './results.csv',
};
