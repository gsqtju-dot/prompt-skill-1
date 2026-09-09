// Happy Oyster — AI Research Server v2
// DeepSeek API + Playwright scraping (Pinterest + Huaban)
// Dual-path: detailed input → direct search, conceptual input → brainstorm
// Usage: node server.js

const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const PORT = 3456;

// ===== Config =====
let API_KEY = '';
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/ANTHROPIC_API_KEY\s*=\s*(.+)/);
    if (match) API_KEY = match[1].trim();
  }
} catch (e) {}

function detectApiType() {
  if (API_KEY.startsWith('sk-ant-')) return 'anthropic';
  return 'deepseek';
}

// ===== Helpers =====
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, data) {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
}

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch (e) { resolve(null); }
    });
  });
}

function parseJson(text) {
  let cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  // Fix common LLM JSON mistakes
  cleaned = cleaned.replace(/,\s*\]/g, ']');
  cleaned = cleaned.replace(/,\s*\}/g, '}');
  try { return JSON.parse(cleaned); } catch (e) {
    // Try to find a JSON object/array in the text
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0].replace(/,\s*\}/g, '}')); } catch (_) {}
    }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try { return JSON.parse(arrMatch[0].replace(/,\s*\]/g, ']')); } catch (_) {}
    }
    throw new Error('JSON parse failed: ' + e.message.slice(0, 80));
  }
}

// ===== Concept Expansion (for Concept Map) =====
const EXPAND_SYSTEM = `You are a creative visual concept expander for architectural and spatial design. For a given concept, generate 7-8 related visual/spatial concepts that are strongly connected and useful for AI image generation prompt brainstorming.

Rules:
- Concepts should be visually evocative and specific
- Mix of: sub-styles, related spaces, materials, lighting conditions, moods
- Each must have Chinese name and English name
- Return ONLY a valid JSON array, no markdown, no explanation

Format:
[{"cn":"中文","en":"English"},...]`;

async function expandConcept(cn, en) {
  const userPrompt = `Concept: "${cn}" (${en})`;
  const raw = await callDeepseek(EXPAND_SYSTEM, userPrompt, 0.85, 1024);
  return parseConceptJson(raw);
}

function parseConceptJson(raw) {
  let cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (match) cleaned = match[0];
  // Fix common JSON issues from LLM output
  cleaned = cleaned.replace(/,\s*\]/g, ']');  // trailing comma before ]
  cleaned = cleaned.replace(/,\s*}/g, '}');   // trailing comma before }
  try { return JSON.parse(cleaned); } catch (e) {}
  // Last resort: try to extract individual objects
  const items = [];
  const objRe = /\{\s*"cn"\s*:\s*"([^"]*)"\s*,\s*"en"\s*:\s*"([^"]*)"\s*\}/g;
  let m;
  while ((m = objRe.exec(cleaned)) !== null) {
    items.push({ cn: m[1], en: m[2] });
  }
  if (items.length > 0) return items;
  throw new Error('Failed to parse concept JSON');
}

// ===== DeepSeek API =====
async function callDeepseek(systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096) {
  const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + API_KEY
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`DeepSeek ${resp.status}: ${err}`);
  }
  const data = await resp.json();
  return data.choices[0].message.content;
}

// ===== Playwright Browser =====
let browser = null;

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  console.log('Launching browser...');
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  console.log('Browser ready');
  return browser;
}

// ===== Scraping =====
async function scrapePinterest(query) {
  const terms = [];
  const url = `https://www.pinterest.com/search/?q=${encodeURIComponent(query)}`;
  console.log(`  [Pinterest] Searching: ${query}`);

  try {
    const b = await getBrowser();
    const page = await b.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(4000); // Wait for JS hydration

      const extracted = await page.evaluate(() => {
        const results = new Set();

        // Topic chips at top of search results
        document.querySelectorAll('[data-test-id="topic-chip"], [class*="topic"], [class*="chip"], [class*="pill"]').forEach(el => {
          const text = el.textContent.trim();
          if (text && text.length > 2 && text.length < 60) results.add(text);
        });

        // Pin image alt text
        document.querySelectorAll('img[alt]').forEach(el => {
          const alt = el.getAttribute('alt');
          if (alt && alt.length > 5 && alt.length < 150 && !alt.startsWith('http')) {
            results.add(alt);
          }
        });

        // Text content from pin grid items
        document.querySelectorAll('[data-test-id="pin"], [data-grid-item], [class*="grid"] [class*="item"], [class*="Pin"]').forEach(el => {
          const text = el.textContent.trim();
          text.split(/[·•|,/、，。\n]+/).forEach(phrase => {
            const cleaned = phrase.trim();
            if (cleaned.length > 2 && cleaned.length < 80) results.add(cleaned);
          });
        });

        // Fallback: extract all short text nodes
        if (results.size < 10) {
          document.querySelectorAll('h1, h2, h3, h4, span, a, div').forEach(el => {
            if (el.children.length === 0) {
              const text = el.textContent.trim();
              if (text.length > 5 && text.length < 80) results.add(text);
            }
          });
        }

        return [...results].slice(0, 60);
      });

      console.log(`  [Pinterest] Found ${extracted.length} terms for "${query}"`);
      terms.push(...extracted);
    } finally {
      await page.close();
    }
  } catch (e) {
    console.log(`  [Pinterest] Failed for "${query}": ${e.message}`);
  }

  return terms;
}

async function scrapeHuaban(query) {
  const terms = [];
  const url = `https://huaban.com/search?q=${encodeURIComponent(query)}`;
  console.log(`  [Huaban] Searching: ${query}`);

  try {
    const b = await getBrowser();
    const page = await b.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(4000);

      const extracted = await page.evaluate(() => {
        const results = new Set();

        // Pin titles
        document.querySelectorAll('[class*="pin"], [class*="card"], [class*="item"], [class*="work"]').forEach(el => {
          const text = el.textContent.trim();
          text.split(/[·•|,/、，。\n\s]+/).forEach(phrase => {
            const cleaned = phrase.trim();
            if (cleaned.length > 2 && cleaned.length < 50) results.add(cleaned);
          });
        });

        // Image alt text
        document.querySelectorAll('img[alt]').forEach(el => {
          const alt = el.getAttribute('alt');
          if (alt && alt.length > 3 && alt.length < 100) results.add(alt);
        });

        // Tags
        document.querySelectorAll('[class*="tag"], [class*="label"], a[href*="tag"], a[href*="search"]').forEach(el => {
          const text = el.textContent.trim();
          if (text.length > 1 && text.length < 40) results.add(text);
        });

        // Fallback: collect meaningful text
        if (results.size < 10) {
          document.querySelectorAll('h1, h2, h3, a, span').forEach(el => {
            if (el.children.length === 0) {
              const text = el.textContent.trim();
              if (text.length > 3 && text.length < 60) results.add(text);
            }
          });
        }

        return [...results].slice(0, 60);
      });

      console.log(`  [Huaban] Found ${extracted.length} terms for "${query}"`);
      terms.push(...extracted);
    } finally {
      await page.close();
    }
  } catch (e) {
    console.log(`  [Huaban] Failed for "${query}": ${e.message}`);
  }

  return terms;
}

async function scrapeQueries(queries, platform) {
  const scraper = platform === 'pinterest' ? scrapePinterest : scrapeHuaban;
  const allTerms = new Set();

  // Scrape 2 queries max per direction to keep things fast
  const limited = queries.slice(0, 2);
  for (const q of limited) {
    const terms = await scraper(q);
    terms.forEach(t => allTerms.add(t));
  }

  // Deduplicate and sort roughly by length (longer = more specific = more useful)
  return [...allTerms]
    .filter(t => t.length > 2 && t.length < 100)
    .sort((a, b) => b.length - a.length)
    .slice(0, 40);
}

// ===== AI Pipeline Steps =====

// System prompt for Step 1: Judge path + classify + generate plan
const STEP1_SYSTEM = `You are a design research AI specialized in architectural and spatial concept analysis for AI image generation. Your task is to analyze a user's scene concept and create a research plan.

## Output Format
Return ONLY raw JSON (no markdown, no explanation):

{
  "path": "detailed",          // "detailed" or "brainstorm"
  "pathReason": "...",         // brief reason for path choice
  "domain": "...",             // 建筑空间 / 室内设计 / 景观 / 城市设计 / 其他
  "dimensions": ["..."],       // applicable dimension tags: 概念流派 / 空间类型 / 本体构成 / 材质 / 光线 / 氛围 / 尺度 / 时间
  "academicRefs": ["..."],     // relevant architects, movements, or design concepts (if any)
  "directions": [
    {
      "name": "...",           // scene direction name (Chinese), descriptive and visual
      "concept": "...",        // associative combination: concept × typology × material × light × mood
      "sceneDescription": "...", // 2-3 sentence scene description in Chinese
      "searchQueries": {
        "pinterest": ["..."],  // 3-5 specific English search queries for Pinterest
        "huaban": ["..."]      // 3-5 specific Chinese search queries for Huaban
      }
    }
  ]
}

## Path Selection
- "detailed": User gives rich description with concrete elements, location, time, mood → 1-3 focused directions
- "brainstorm": User gives a concept, term, or vague idea → 4-6 divergent directions exploring different spatial interpretations

## Dimension Tags
- 概念流派: conceptual/architectural movement (Brutalism, Metabolism, Wabi-sabi, etc.)
- 空间类型: spatial typology (atrium, corridor, plaza, pavilion, capsule, etc.)
- 本体构成: ontological composition (megastructure, unit, block, cluster, street, etc.)
- 材质: material (concrete, wood, steel, rammed earth, glass, bamboo, etc.)
- 光线: lighting (daylight, golden hour, overcast, candlelight, neon, moonlight, etc.)
- 氛围: atmosphere (solemn, warm, lonely, futuristic, sacred, nostalgic, etc.)
- 尺度: scale (monumental, human-scale, intimate, infinite)
- 时间: time (dawn, noon, dusk, night, winter, summer rain)

## Direction Rules
- Each direction MUST combine at least 3 different dimensions
- Directions should be visually distinct from each other
- For "brainstorm" path, generate 4-6 diverse directions
- For "detailed" path, generate 1-3 focused directions
- Search queries should be SPECIFIC and SEARCHABLE (terms people actually use on Pinterest/花瓣)
- Pinterest queries in English, Huaban queries in Chinese`;

// Step 2: Filter vocabulary + generate prompts
const STEP2_SYSTEM = `You are a design prompt engineer specialized in AI image generation prompts. Your task is to filter scraped vocabulary and generate high-quality image prompts.

## Output Format
Return ONLY raw JSON (no markdown, no explanation):

{
  "tags": {
    "pinterest": ["..."],    // 8-15 most relevant terms from Pinterest scrape
    "huaban": ["..."]        // 8-15 most relevant terms from Huaban scrape
  },
  "prompts": [
    {
      "text": "...",        // complete prompt text, ≤536 characters including --ar and --style
      "length": 523
    }
  ]
}

## Tag Selection Rules
- Select ONLY terms that are: visually concrete, scene-relevant, prompt-compatible
- Terms should be distinct and complementary (no near-duplicates)
- Include English AND Chinese terms as appropriate
- Prefer specific over generic (e.g., "board-formed concrete wall" > "wall")

## Prompt Generation Rules

### Structure
Horizontal [interior/exterior] photo, [AR]. [scene content]. [atmosphere]. [color palette]. --ar [AR] --style raw

### CRITICAL Light Rules
Natural light sources ONLY — use only light that would actually exist in this scene:
- Outdoor: daylight, golden hour, overcast, dusk, moonlight
- Indoor: window light, skylight, door light, candlelight, lamp light, fireplace
- Urban night: street lamp, window glow, neon sign glow, car headlight

### LIGHT RULES — STRICTLY FORBIDDEN:
DO NOT use these terms or concepts under any circumstances:
- lens flare, overexposed, blown highlights, yellow glare, intense glare
- volumetric god rays (unless fog/smoke/steam is explicitly part of the scene)
- rim light, hair light, backlight halo (unless there is a clearly defined backlight source)
- magical light, fantasy glow, ethereal glow from nowhere
- unnatural colored light without a physical source

### Quality Standards
- ≤536 characters total
- Specific material descriptions (not "wood" but "oil-finished hinoki cypress slats")
- Desaturated color palette preferred
- Matte finish, natural material tactility
- Include visual anchor — a specific focal point or spatial feature
- Competition-grade architectural visualization quality`;

// ===== Main Pipeline =====
async function runResearch(data, onProgress) {
  const { nameCn, nameEn, desc } = data;
  const p = (step, percent, message) => {
    console.log(`  [${percent}%] ${step}: ${message}`);
    if (onProgress) onProgress({ step, percent, message });
  };

  // --- Step 1: Classify + Plan ---
  p('classify', 5, 'AI analyzing concept & classifying dimensions...');

  const step1User = `User Input:
Theme (CN): ${nameCn}
Theme (EN): ${nameEn}
Scene Description: ${desc}

Analyze this concept and generate the research plan.`;

  const step1Raw = await callDeepseek(STEP1_SYSTEM, step1User, 0.7);
  const plan = parseJson(step1Raw);
  p('classified', 15, `Path: ${plan.path} · ${plan.directions.length} directions planned`);

  // --- Step 2: Scrape + Generate for each direction ---
  const totalDirs = plan.directions.length;
  const results = [];
  for (let i = 0; i < totalDirs; i++) {
    const dir = plan.directions[i];
    const basePercent = 15 + Math.floor((i / totalDirs) * 55); // 15% → 70% for scraping
    p('scraping', basePercent, `Searching Pinterest & Huaban: ${dir.name}`);

    // Scrape Pinterest + Huaban in parallel
    const [pinterestTerms, huabanTerms] = await Promise.all([
      scrapeQueries(dir.searchQueries.pinterest || [], 'pinterest'),
      scrapeQueries(dir.searchQueries.huaban || [], 'huaban')
    ]);

    console.log(`    Scraped: ${pinterestTerms.length} Pinterest + ${huabanTerms.length} Huaban terms`);

    // If no terms scraped, use AI fallback (AI generates terms from training knowledge)
    const hasScrapedData = pinterestTerms.length > 0 || huabanTerms.length > 0;

    let step2User;
    if (hasScrapedData) {
      step2User = `Scene Direction: ${dir.name}
Concept: ${dir.concept}
Scene Description: ${dir.sceneDescription || desc}

Scraped Pinterest terms (${pinterestTerms.length}):
${pinterestTerms.join('\n')}

Scraped Huaban terms (${huabanTerms.length}):
${huabanTerms.join('\n')}

Filter these terms for strong relevance and generate 1-2 prompts (≤536 chars each).`;
    } else {
      // AI fallback: generate terms from training data
      step2User = `Scene Direction: ${dir.name}
Concept: ${dir.concept}
Scene Description: ${dir.sceneDescription || desc}

No scraped terms available. Draw from your training knowledge to suggest relevant visual vocabulary and generate 1-2 prompts (≤536 chars each).

IMPORTANT: Still return the "tags" field with your best suggested search terms for Pinterest and Huaban — these should be terms the user COULD search on those platforms.`;
    }

    try {
      const filterPercent = 70 + Math.floor(((i + 1) / totalDirs) * 25); // 70% → 95%
      p('generating', filterPercent, `AI filtering vocabulary & generating prompts for: ${dir.name}`);
      const step2Raw = await callDeepseek(STEP2_SYSTEM, step2User, 0.5, 4096);
      const gen = parseJson(step2Raw);

      results.push({
        name: dir.name,
        concept: dir.concept,
        sceneDescription: dir.sceneDescription || desc,
        tags: {
          pinterest: gen.tags?.pinterest || [],
          huaban: gen.tags?.huaban || pinterestTerms.slice(0, 15)
        },
        prompts: (gen.prompts || []).map(p => ({
          text: p.text,
          length: p.length || p.text.length,
          ok: (p.length || p.text.length) <= 536
        }))
      });

      console.log(`    Tags: ${gen.tags?.pinterest?.length || 0} Pinterest + ${gen.tags?.huaban?.length || 0} Huaban`);
      console.log(`    Prompts: ${gen.prompts?.length || 0}`);
    } catch (e) {
      console.log(`    Error generating for "${dir.name}": ${e.message}`);
      results.push({
        name: dir.name,
        concept: dir.concept,
        sceneDescription: dir.sceneDescription || desc,
        tags: { pinterest: pinterestTerms.slice(0, 15), huaban: huabanTerms.slice(0, 15) },
        prompts: [],
        error: e.message
      });
    }
  }

  p('complete', 100, `Done — ${results.length} directions with prompts`);
  return {
    nameCn,
    nameEn,
    path: plan.path,
    pathReason: plan.pathReason,
    domain: plan.domain,
    dimensions: plan.dimensions || [],
    academicRefs: plan.academicRefs || [],
    directions: results
  };
}

// ===== HTTP Server =====
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, hasKey: !!API_KEY, apiType: detectApiType() });
    return;
  }

  // Verify API key — test with a minimal DeepSeek call
  if (req.method === 'POST' && url.pathname === '/api/verify-key') {
    const data = await readBody(req);
    if (!data || !data.key) {
      sendJson(res, 400, { error: 'Missing key' });
      return;
    }

    const testKey = data.key.trim();
    const apiType = testKey.startsWith('sk-ant-') ? 'anthropic' : 'deepseek';
    console.log(`[verify-key] Testing ${apiType} key...`);

    try {
      let response, result;

      if (apiType === 'deepseek') {
        response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${testKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5
          })
        });
        result = await response.json();
      } else {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': testKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5
          })
        });
        result = await response.json();
      }

      if (response.ok && !result.error) {
        // Key is valid — save it
        API_KEY = testKey;
        const envPath = path.join(__dirname, '.env');
        fs.writeFileSync(envPath, `ANTHROPIC_API_KEY=${testKey}\n`);
        console.log('[verify-key] Key verified and saved');
        sendJson(res, 200, { ok: true, apiType });
      } else {
        const errMsg = result.error?.message || 'Invalid key';
        console.log('[verify-key] Failed:', errMsg);
        sendJson(res, 401, { ok: false, error: errMsg });
      }
    } catch (e) {
      console.log('[verify-key] Network error:', e.message);
      sendJson(res, 500, { ok: false, error: 'Network error: ' + e.message });
    }
    return;
  }

  // Full research pipeline
  if (req.method === 'POST' && url.pathname === '/api/research') {
    if (!API_KEY) {
      console.log('[research] No API key');
      sendJson(res, 401, { error: 'No API key set. Create auto-gen/.env with ANTHROPIC_API_KEY=...' });
      return;
    }

    const data = await readBody(req);
    console.log('[research] Received:', JSON.stringify(data).slice(0, 120));
    if (!data || !data.nameCn || !data.nameEn || !data.desc) {
      console.log('[research] 400: Missing fields');
      sendJson(res, 400, {
        error: 'Missing required fields',
        required: { nameCn: 'string', nameEn: 'string', desc: 'string' }
      });
      return;
    }

    // Validate input quality
    if (data.desc.length < 4) {
      console.log('[research] 400: Desc too short (' + data.desc.length + ' chars)');
      sendJson(res, 400, {
        error: 'Description too short (' + data.desc.length + ' chars)',
        message: '请提供更详细的场景描述（≥4字符），包含场景要素（地点/时间/元素/氛围）'
      });
      return;
    }

    // SSE mode: stream progress events + final result
    setCors(res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Research request: ${data.nameCn} / ${data.nameEn}`);
      const startTime = Date.now();

      const result = await runResearch(data, (progress) => {
        sendSSE(res, 'progress', progress);
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n=== Complete: ${result.directions.length} directions in ${elapsed}s ===`);
      sendSSE(res, 'result', result);
      res.end();
    } catch (e) {
      console.error('Research error:', e.message);
      sendSSE(res, 'error', { error: e.message });
      res.end();
    }
    return;
  }

  // Concept expansion (for Concept Map)
  if (req.method === 'POST' && url.pathname === '/api/expand-concept') {
    const body = await readBody(req);
    if (!body || !body.cn || !body.en) {
      sendJson(res, 400, { error: 'Missing cn/en fields' });
      return;
    }
    try {
      const words = await expandConcept(body.cn, body.en);
      sendJson(res, 200, { words });
    } catch (e) {
      console.error('Expand error:', e.message);
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  // Static file serving (for index.html, concept-map.html, etc.)
  if (req.method === 'GET') {
    const rootDir = path.resolve(__dirname, '..');
    let filePath = path.join(rootDir, url.pathname === '/' ? 'home.html' : url.pathname);
    // Security: prevent directory traversal
    if (!filePath.startsWith(rootDir)) {
      sendJson(res, 403, { error: 'Forbidden' });
      return;
    }
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.md': 'text/markdown; charset=utf-8',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        setCors(res);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(fs.readFileSync(filePath));
        return;
      }
    } catch (e) {}
  }

  sendJson(res, 404, { error: 'Not found' });
});

// ===== Startup =====
server.listen(PORT, () => {
  console.log('═══════════════════════════════════════');
  console.log('  Happy Oyster Research Server v2');
  console.log('  http://localhost:' + PORT);
  console.log('  API Type: ' + detectApiType());
  console.log('  API Key: ' + (API_KEY ? 'configured (' + API_KEY.substring(0, 10) + '...)' : 'NOT SET'));
  console.log('═══════════════════════════════════════');
  console.log('');
  console.log('  POST /api/research  — full research pipeline');
  console.log('  GET  /api/health    — status check');
  console.log('  GET  /              — Happy Oyster (index.html)');
  console.log('  GET  /concept-map.html — Concept Map');
  console.log('');
  if (!API_KEY) {
    console.log('  ⚠ NO API KEY — create auto-gen/.env with ANTHROPIC_API_KEY=...');
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  if (browser) {
    await browser.close();
    console.log('Browser closed');
  }
  process.exit(0);
});
