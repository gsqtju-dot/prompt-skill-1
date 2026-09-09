# 郭斯琪-Prompt工具集 — Happy Oyster

AI空间场景创意工具集，包含Prompt Studio和Concept Map两大核心功能。

---

## 快速开始

### 1. 安装依赖

```bash
cd auto-gen
npm install
```

### 2. 启动服务器

```bash
node server.js
```

服务器将在 `http://localhost:3456` 启动。

### 3. 配置 API Key

首次使用需要配置DeepSeek API Key：

1. 在Prompt Studio或Concept Map页面找到API输入框
2. 输入你的DeepSeek API Key（以`sk-`开头）
3. 点击"Connect"按钮
4. 验证通过后即可使用AI功能

API Key会保存在 `auto-gen/.env` 文件中（首次连接后自动生成）。

### 4. 打开浏览器

访问 http://localhost:3456/ 进入首页。

---

## 功能说明

### 首页 (home.html)
引导页面，介绍工具集功能。

### Prompt Studio (index.html)
AI场景Prompt生成器，支持多领域关键词选择和AI Research功能。

### Concept Map (concept-map.html)
概念图工具，可视化探索创意概念及其关联。

---

## 文件结构

```
郭斯琪-Prompt工具集/
├── home.html              # 首页
├── index.html             # Prompt Studio
├── concept-map.html       # Concept Map
├── README.md              # 本文件
└── auto-gen/              # 后端服务
    ├── server.js          # 主服务器
    ├── package.json       # 依赖配置
    └── node_modules/      # npm依赖
```

---

## 系统要求

- Node.js 16+
- 现代浏览器（Chrome/Firefox/Edge）
- DeepSeek API Key

---

## 原始文档

以下为完整的技术文档和使用指南：

---

## 引导页

**页面**：[home.html](home.html) · `http://localhost:3456/`

### 设计
- **黑底白线**线稿风背景：线框立方体、拱门、透视网格、平面图、柱子、交叉排线
- **设计名言** dot-matrix 点阵渲染，Press Start 2P 像素字体，高饱和配色
- **鼠标视差**文字随鼠标轻微偏移
- **点击切换**名言，自动 10s 轮播
- **两个胶囊按钮**底部居中，玻璃质感，点击白闪切换

### 名言列表
| 名言 | 作者 | 颜色 |
|------|------|------|
| Less is more. | Mies van der Rohe | 青 |
| Form follows function. | Louis Sullivan | 橙 |
| God is in the details. | Mies van der Rohe | 黄 |
| Simplicity is the ultimate sophistication. | Leonardo da Vinci | 绿 |
| Less is a bore. | Robert Venturi | 红 |
| Design is how it works. | Steve Jobs | 蓝 |
| Space is the breath of art. | Frank Lloyd Wright | 紫 |

---

## 何时用哪个？

```
你有想法 → 但不知道具体方向？
  → 用 Concept Map，输入关键词，逐级发散找灵感

你有了明确场景描述？
  → 用 AI Prompt Studio，输入描述，自动搜词生成 Prompt

两者可以结合：
  Concept Map 发散 → 找到感兴趣的方向
  → 把词复制到 Prompt Studio → 生成高质量 Prompt
```

---

## 快速开始

### 1. 配置 API Key（唯一配置点）

**整个项目只有一个地方需要配 API Key：`auto-gen/.env`**

```
ANTHROPIC_API_KEY=sk-你的Key
```

| 说明 | 内容 |
|------|------|
| **Key 来源** | [platform.deepseek.com](https://platform.deepseek.com) 免费注册获取（`sk-` 开头） |
| **备选** | Anthropic Key（`sk-ant-` 开头），server 自动识别前缀切换 API |
| **生效范围** | AI Prompt Studio + Concept Map 共享同一个 Key |
| **Key 失效** | 前端报 `⚠ Server error 400` → Key 过期或额度用完，换新 Key 即可 |

> **没有其他配置点。** server.js 统一从 `.env` 读取，前端页面不直接持有 Key。

### 2. 启动服务

```bash
cd auto-gen
npm install
node server.js
```

### 3. 浏览器打开

```
http://localhost:3456/                   # 引导页 Home
http://localhost:3456/index.html         # AI Prompt Studio
http://localhost:3456/concept-map.html   # Concept Map
```

---

## AI Prompt Studio

**页面**：[index.html](index.html)

### 核心目标

**本质**：用户输入概念 → AI 判断归类 → 灵感平台搜索 → 提取关联词汇 → 生成可用于头脑风暴和实际生图的高质量 Prompt。

**解决的问题**：
- 用户想法有限，不知道用什么词汇描述场景
- 手动从 Pinterest/花瓣网搜素材再提炼词汇太费时
- 生成的 Prompt 容易包含不切实际的光源描述（过曝、眩光、虚假光源）
- 前期头脑风暴阶段，用户只有模糊概念，需要 AI 帮助发散和具象化

---

## 需求分析：从参考图到词库

### 痛点

生成一个空间场景时，用户常遇到两个核心问题：一是找不到合适的设计参考图——手动在 Pinterest/花瓣网搜索耗时且结果参差不齐；二是找到的参考图与原场景过于相似，缺乏启发性和多样性，难以激发新的创意方向。

根本原因在于：现有流程只提取了平台上的文本标签（标题、alt 文本、tag），没有真正"看到"图片本身。文字标签往往是上传者随手写的泛化描述（"beautiful design"、"灵感"），无法反映图片的真实视觉特征——构图、色调、材质细节、空间关系。

### 解决方案：图片拆解管线

在现有爬取流程中增加**图片视觉分析**环节：爬取 Pinterest/花瓣网 Top 20 相关图片，对每张图进行 AI 视觉拆解，提取结构化视觉特征，最终生成词库和风格概念。

```
Pinterest / 花瓣网搜索
    ↓
爬取 Top 20 图片（URL + 上下文文本）
    ↓
AI 视觉拆解每张图片
    ├── 场景 (Scene)：空间类型、功能、场所特征
    ├── 构图 (Composition)：视角、景深、对称性、框架
    ├── 元素 (Elements)：核心物体、材质、家具、植被
    ├── 色调 (Color Tone)：主色、辅色、色温、饱和度
    ├── 风格 (Style)：建筑流派、设计语言、时代感
    └── 交互 (Interaction)：人与空间的关系（如有）
    ↓
汇总 20 张图片的拆解结果
    ↓
生成词库 (Vocabulary Library)
  · 按维度分类：场景 / 构图 / 元素 / 材质 / 色调 / 风格
  · 去重 + 去噪 + 频率统计
  · 标注来源图片数量（高频词权重更高）
    ↓
生成风格概念 (Style Concepts)
  · 从 20 张图中提炼 3-5 个风格方向
  · 每个方向包含：风格名 + 核心特征词 + 代表图片索引
    ↓
输入下一步：词汇筛选 + Prompt 生成
  · 词库作为额外词汇来源，补充原有文本爬取结果
  · 风格概念帮助 AI 更精准地控制 Prompt 风格倾向
```

### 图片拆解的 Prompt 模板

对每张图片调用 AI 视觉能力，使用以下结构化 Prompt：

```
Analyze this architectural/interior design image and extract:

1. Scene: What type of space? (atrium, corridor, chapel, plaza, etc.)
2. Composition: Camera angle, depth, symmetry, framing technique
3. Elements: Key objects, materials, furniture, vegetation, people
4. Color Tone: Dominant colors, color temperature (warm/cool/neutral), saturation level
5. Style: Architectural movement or design language (Brutalism, Wabi-sabi, Minimalism, etc.)
6. Interaction: How do people relate to this space? (if people are present)

Return as JSON:
{
  "scene": "...",
  "composition": "...",
  "elements": ["...", "..."],
  "colorTone": { "dominant": "...", "temperature": "...", "saturation": "..." },
  "style": "...",
  "interaction": "..." | null
}
```

### 词库结构

```
Vocabulary Library
├── scene: ["atrium", "nave", "cloister", "下沉广场", "空中连廊", ...]
├── composition: ["one-point perspective", "low angle", "frame within frame", ...]
├── elements: ["board-formed concrete wall", "hinoki cypress slats", "weathering steel", ...]
├── material: ["rough-cast concrete", "oil-finished wood", "patina copper", ...]
├── colorTone: ["desaturated warm grey", "cool blue-green", "earth tone palette", ...]
├── style: ["Brutalism", "Wabi-sabi", "Metabolism", "New Vernacular", ...]
└── interaction: ["solitary contemplation", "group gathering", "processional movement", ...]
```

### 风格概念输出

```
Style Concept 1: "粗野主义神圣感"
  核心词: board-formed concrete, zenithal light, monolithic, solemn
  代表图片: #3, #7, #12

Style Concept 2: "温暖日常感"
  核心词: warm wood, diffused daylight, human-scale, lived-in
  代表图片: #1, #5, #9, #15

Style Concept 3: "机械诗意"
  核心词: steel frame, industrial palette, modular, rhythmic repetition
  代表图片: #2, #8, #14
```

### 与现有管线的整合

图片拆解作为新的 Step 2.5 插入现有流程，不改变原有步骤：

```
原流程：① 判断归类 → ② 搜索词生成 → ③ 爬取 + 文本提取 → ④ 词汇筛选 → ⑤ Prompt 生成
                                                                       ↑
新流程：① 判断归类 → ② 搜索词生成 → ③ 爬取（文本 + 图片 URL）
                                        → ③.5 图片视觉拆解 → 词库 + 风格概念
                                        → ④ 词汇筛选（文本词 + 图片词库合并）
                                        → ⑤ Prompt 生成（参考风格概念控制倾向）
```

词库和风格概念会作为额外上下文注入 Step ④ 和 Step ⑤ 的 AI 调用中，让词汇筛选更精准、Prompt 风格更可控。

---

## 用户输入的双路径模型

工具接受两种不同深度的输入，AI 自动判断并走不同处理路径：

### 路径 A：清晰方向（Detailed Input）

用户已有明确的场景想象，描述具体、细节丰富。

| 特征 | 示例 |
|------|------|
| 包含具体地点、时间、元素 | "黄昏时分的废弃游乐园，生锈的旋转木马静止不动，杂草从地砖缝隙长出，暖黄夕阳透过破损顶棚洒落，胶片质感，安静而怀旧" |
| ≥ 3 个场景要素 | 时间=黄昏，地点=废弃游乐园，元素=旋转木马/杂草，氛围=怀旧安静 |
| 方向明确，不需要发散 | 直接搜词生成 Prompt 即可 |

```
用户输入丰富描述
    ↓
有效性校验（≥20字符 + 含场景要素）→ 通过
    ↓
DeepSeek 直接生成搜索词 → Pinterest + 花瓣网爬取
    ↓
AI 筛选强相关词汇 → 去噪去重
    ↓
生成 1-3 组高质量 Prompt（≤536字符）
```

### 路径 B：前期头脑风暴（Conceptual Input）

用户只有模糊概念/一个词/一个短语，需要 AI 帮助发散和具象化。这类输入可以是：

| 类型 | 示例 | 说明 |
|------|------|------|
| **学术概念** | "新陈代谢派"、"粗野主义"、"解构主义" | 有明确学术定义，可展开为具体空间场景 |
| **设计理念** | "山水建筑"、"城市更新"、"插件城市"、"负建筑" | 概念性强，需要解读和空间化转译 |
| **空间类型** | "礼堂"、"地下空间"、"空中连廊" | 本体明确，需要填充氛围和材质 |
| **本体构成** | "街区"、"单体"、"聚落"、"巨构" | 需要与其他维度交叉组合 |
| **材质/氛围** | "夯土"、"镜面"、"废墟感"、"神圣空间" | 单一维度，需要扩展到完整场景 |
| **模糊灵感** | "赛博朋克茶馆"、"北欧风菜市场" | 跨域组合，需要 AI 拆解并重新组合 |

```
用户输入模糊概念（一个词/短语）
    ↓
AI 判断：输入较泛 → 进入头脑风暴模式
    ↓
┌─────────────────────────────────────────────────────┐
│ 第一步：归类与维度拆解                                  │
│                                                       │
│ · 领域判断：建筑空间 / 室内 / 景观 / 城市 / 其他        │
│ · 维度标签：概念/流派 | 空间类型 | 本体构成 | 材质       │
│             | 光线 | 氛围 | 尺度                      │
│ · 学术关联：是否有已知的建筑/设计流派与此相关            │
└─────────────────┬───────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────┐
│ 第二步：关联组合生成                                    │
│                                                       │
│ 将用户概念与其他维度进行交叉组合，生成多个具体场景方向：   │
│                                                       │
│ 例如输入"插件城市"（新陈代谢派概念）：                   │
│   · 插件城市 × 胶囊单元 × 暖色光 × 私密感               │
│     → "胶囊居室内部，圆窗透出暖光，紧凑而安宁"           │
│   · 插件城市 × 巨型结构 × 天光 × 悬浮感                 │
│     → "空中连廊，透明结构外是雾中都市，乌托邦尺度"       │
│   · 插件城市 × 街区 × 黄昏光 × 日常感                   │
│     → "插件社区傍晚，胶囊单元亮起暖灯，生活气息"         │
│   · 插件城市 × 节点广场 × 阴天散射光 × 金属质感          │
│     → "核心筒广场，预制混凝土与钢铁，冷静的机械诗意"     │
│                                                       │
│ 例如输入"礼堂与光线"（本体 × 光线组合）：                │
│   · 礼堂 × 天顶光 × 仪式感 × 混凝土                     │
│     → "粗野主义礼堂，顶光裂缝划破黑暗，神圣肃穆"         │
│   · 礼堂 × 侧窗光 × 木构 × 温暖                         │
│     → "木结构礼堂，午后侧光穿过格栅，温暖而宁静"         │
│   · 礼堂 × 烛光 × 石构 × 中世纪                         │
│     → "石砌小礼拜堂，烛光摇曳，厚重的罗马式穹顶"         │
└─────────────────┬───────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────┐
│ 第三步：每组方向生成搜索词 → Pinterest + 花瓣网爬取      │
│         每组独立提取强相关词汇                          │
└─────────────────┬───────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────┐
│ 第四步：每组生成 1-2 个 Prompt（≤536字符）              │
│         返回 4-8 组 Prompt，按方向分类                  │
└─────────────────────────────────────────────────────┘
```

### AI 如何判断走哪条路径

```
输入分析：
  1. 字符数 < 30 且无标点分段 → 大概率是 B（概念输入）
  2. 包含具体时间词（黄昏/清晨/正午）+ 地点词 + 物体词 → A（清晰输入）
  3. 仅含名词短语/学术术语 → B
  4. 无法确定 → 走 B，但保留原始描述优先生成一组

输出：
  路径 A：1-3 组 Prompt
  路径 B：4-8 组 Prompt，按关联组合分组
```

---

---

## Concept Map

**页面**：[concept-map.html](concept-map.html)

### 核心目标

快速概念发散工具：输入一个词 → DeepSeek 生成 7-8 个强关联词 → 辐射状展开 → 可逐级点击继续发散。

### 交互方式

| 操作 | 效果 |
|------|------|
| 输入词 + Enter | 词出现在画布中心，作为根节点 |
| 点击节点 | 调用 DeepSeek 生成 7-8 个关联词，辐射展开 |
| 继续点击子节点 | 继续发散下一级关联词 |
| 右键节点 | 选中/取消选中（黄色高亮） |
| 有选中词时输入新词 | 新词与所有选中词连线 |
| 右上角历史面板 | 查看/恢复之前的搜索 |

### 视觉风格

- 黑色背景 + 玻璃质感(Glassmorphism)圆形节点
- 白色/蓝色配色，选中词黄色高亮
- SVG 贝塞尔曲线连接父子节点
- 节点大小随层级递减（根 130px → 1级 100px → 2级 84px）
- 中英文双行显示，自动折行

### API

调用 `POST /api/expand-concept`（server.js 内置端点），由 DeepSeek 生成关联词列表。

---

## 完整架构

```
┌── home.html (引导页) ──────────────┐
│ 设计名言 · 线稿背景 · 点阵文字       │
│   ↓                                │
│ 两个胶囊按钮                         │
│   ├──→ index.html                  │
│   └──→ concept-map.html            │
└────────────────────────────────────┘

┌── index.html (AI Prompt Studio) ──┐
│ 用户输入概念描述                    │
│   ↓                                │
│ DeepSeek API ── 判断路径 + 归类    │
│   ↓                                │
│ server.js ── Playwright 爬取       │
│   ├── Pinterest 公开搜索页          │
│   │   └── 文本 + 图片 URL          │
│   └── 花瓣网 公开搜索页              │
│       └── 文本 + 图片 URL          │
│   ↓                                │
│ AI Vision ── 图片视觉拆解           │
│   ├── Top 20 图片逐张分析           │
│   ├── 提取：场景/构图/元素/色调/风格 │
│   ├── 生成词库 (Vocabulary Library) │
│   └── 生成风格概念 (Style Concepts) │
│   ↓                                │
│ DeepSeek API ── 词汇筛选 + 生成     │
│   （文本词 + 图片词库合并筛选）       │
│   （风格概念注入 Prompt 生成）       │
│   ↓                                │
│ 返回 Prompt（≤536字符）             │
└────────────────────────────────────┘

┌── concept-map.html (Concept Map) ──┐
│ 用户输入概念词                       │
│   ↓                                │
│ server.js ── DeepSeek API          │
│   ↓                                │
│ 返回 7-8 个关联词                    │
│   ↓                                │
│ 辐射状散开展示                       │
│   ↓                                │
│ 点击继续逐级发散                     │
└────────────────────────────────────┘

共享：
  auto-gen/server.js (端口 3456)
  DeepSeek API (同一个 key)
```

### 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 前端 | 纯 HTML/JS（两个 SPA） | Prompt Studio + Concept Map，无需构建工具 |
| 后端 | Node.js + Playwright | 统一服务：API 路由 + 爬虫 + 静态文件，端口 3456 |
| AI 引擎 | DeepSeek API (`deepseek-chat`) | Prompt Studio 5 次调用 / Concept Map 每次展开 1 次 |
| AI Vision | DeepSeek Vision / 专用 Vision 模型 | 图片视觉拆解：场景/构图/元素/色调/风格/交互 |
| 搜索源 | Pinterest + 花瓣网 | 公开搜索，无需登录（提取文本 + 图片 URL） |
| 存储 | localStorage | 用户 domain + Concept Map 历史记录 |

---

## 安装与启动

### 前提条件

- Node.js ≥ 18
- DeepSeek API Key（[platform.deepseek.com](https://platform.deepseek.com)）

### 1. 配置 API Key

```bash
cd auto-gen
# 编辑 .env 文件，填入 DeepSeek API Key
```

`.env` 示例：
```
ANTHROPIC_API_KEY=sk-2ec38e2b3d41455b95263715538c2ab1
```

> **Key 格式说明**：服务器自动识别 key 类型。`sk-ant-` 开头走 Anthropic API，其他走 DeepSeek API。变量名保持 `ANTHROPIC_API_KEY` 以兼容两种服务。

### 2. 安装依赖

```bash
cd auto-gen
npm install
```

### 3. 启动

```bash
# 终端 1 —— 启动爬虫服务器
cd auto-gen
node server.js
# → http://localhost:3456

# 终端 2 —— 打开前端
# 浏览器直接打开 index.html
```

### 4. 验证

浏览器访问 `http://localhost:3456/api/health`：
```json
{
  "ok": true,
  "hasKey": true,
  "apiType": "deepseek"
}
```

---

## API 调用链

### DeepSeek 配置

| 配置项 | 值 |
|-------|---|
| Endpoint | `https://api.deepseek.com/v1/chat/completions` |
| Model | `deepseek-chat` |
| Max Tokens | 2048 |
| Temperature | 路径 A: 0.5（收敛）/ 路径 B: 0.8（发散） |

### 5 次 API 调用

| 调用 | 输入 | 输出 | 路径 A | 路径 B |
|------|------|------|--------|--------|
| ① 判断 + 归类 | 用户输入 | 路径判定 + 领域/维度标签 | ✅ | ✅ |
| ② 关联组合 + 搜索词 | 标签 + 原始输入 | 场景方向 + 搜索词列表 | ✅（1-3组） | ✅（4-8组） |
| ③ 词汇筛选 + 去噪 | 爬取结果 + 场景描述 | 强相关 tags（分类） | ✅ | ✅（每组独立） |
| ③.5 图片视觉拆解 | Top 20 图片 URL | 词库 + 风格概念 | ✅ | ✅（每组独立） |
| ④ Prompt 生成 | 精选词汇 + 词库 + 风格概念 | ≤536 字符 Prompt | ✅ | ✅（每组独立） |

> **③.5 说明**：图片拆解调用 AI 视觉能力（DeepSeek 或专用 Vision 模型），对每张图提取场景/构图/元素/色调/风格/交互，汇总后生成词库和 3-5 个风格概念。结果注入 ④ 的 Prompt 生成环节。

### 路径 B 的关联组合逻辑

AI 生成关联组合时，遵循以下原则：

```
输入概念 × 以下维度的排列组合：

  空间类型：大厅/中庭/走廊/楼梯间/广场/庭院/房间/连廊/平台/下沉空间
  材质体系：混凝土/木/钢/玻璃/石材/夯土/砖/金属网/水磨石/竹
  光线策略：天顶光/侧窗光/漫射光/黄昏光/阴天光/烛光/路灯/月光/缝隙光
  氛围基调：肃穆/温暖/孤寂/未来感/日常感/神圣/机械诗意/废墟感/宁静
  尺度层面：巨构/人体尺度/私密/无限/压缩与释放
  时间维度：清晨/正午/黄昏/深夜/阴天/雨后/冬日/初秋

规则：
  1. 每组组合必须包含 ≥3 个维度
  2. 每组必须有明确的视觉锚点（能形成画面的核心元素）
  3. 组与组之间应有一定差异（避免生成雷同的场景）
  4. 优先选择与输入概念学术关联最强的方向
```

---

## 搜索爬取逻辑

### Pinterest 爬取

```
URL: https://www.pinterest.com/search/?q=<query>
提取内容:
  - Pin 标题
  - Board / Section 名称
  - 关联 Topic / tag（搜索页顶部的推荐 topic）
  - 图片 alt 文本
  - 图片 URL（src / data-src / srcset，用于后续视觉拆解）
  - 每搜索词取前 20 条有效结果
```

### 花瓣网爬取

```
URL: https://huaban.com/search?q=<query>
提取内容:
  - 画板标题
  - 采集 tag（每条 pin 下方的标签）
  - 相关推荐词（搜索页的相关搜索）
  - 图片 URL（img src，用于后续视觉拆解）
  - 每搜索词取前 20 条有效结果
```

### 图片视觉拆解（Step ③.5）

爬取完成后，对每个场景方向收集到的 Top 20 图片进行 AI 视觉分析：

```
图片 URL 列表（每方向最多 20 张）
    ↓
逐张调用 AI Vision API
    ↓
提取 6 维结构化特征：
  · 场景：空间类型、功能、场所特征
  · 构图：视角、景深、对称性、框架手法
  · 元素：核心物体、材质、家具、植被、人物
  · 色调：主色、辅色、色温、饱和度
  · 风格：建筑流派、设计语言、时代感
  · 交互：人与空间的关系（如有）
    ↓
汇总 → 词库（Vocabulary Library）
  · 按维度分类聚合
  · 去重 + 去噪 + 频率统计
  · 高频词（出现在 ≥3 张图中）自动提权
    ↓
汇总 → 风格概念（Style Concepts）
  · 从 20 张图中提炼 3-5 个风格方向
  · 每个方向：风格名 + 核心特征词 + 代表图片索引
```

> **性能考虑**：20 张图片的视觉拆解约需 20-40 秒。可并行调用（每批 4-5 张）缩短至 8-15 秒。若图片 URL 无效或加载超时，跳过该张继续处理。

### 词汇筛选规则

```
原始词汇（两个来源合并）
  ├── 文本爬取词：标题、alt 文本、tag、推荐词
  └── 图片词库：AI 视觉拆解提取的场景/构图/元素/材质/色调/风格词
    ↓
去重：同义词合并（英文/中文对应合并）
    ↓
去噪：过滤过宽词（"设计"、"灵感"、"好看"、平台通用词）
    ↓
AI 强相关性判断：
  · 该词汇是否与场景方向有直接视觉关联？
  · 该词汇是否能用于 Prompt 描述？
  · 该词汇在 Pinterest/花瓣网的出现频率高吗？
  · 该词汇是否在多张图片中重复出现？（图片词库高频词优先）
    ↓
分类输出：场景 / 构图 / 元素 / 材质 / 光线 / 色调 / 氛围 / 风格
```

---

## Prompt 生成规则

### 结构模板

```
Horizontal [interior/exterior] photo, [AR]. [内容]. --ar [AR] --style raw
```

### 核心规则

| 规则 | 说明 |
|------|------|
| **长度限制** | ≤ 536 英文字符（含空格和参数，Done AI 等模型的输入上限） |
| **光线真实性** | 光源必须符合场景实际，来自真实存在的自然光或人造光源，避免过于强烈的黄光|
| **视觉锚点** | 每个 Prompt 必须有明确的视觉核心（一个具体的场景） |
| **材质具体化** | 不要只说"木头"，要说"带木纹的油面柏木" / "粗切石灰石" |
| **色调控制** | 以去饱和、哑光质感为主，避免过于鲜艳的色彩描述 |
| **风格后缀** | 统一使用 `--ar [比例] --style raw` |

### 图片词库与风格概念的注入

Prompt 生成阶段会接收来自 Step ③.5 的词库和风格概念作为额外上下文：

```
Prompt 生成输入：
  ├── 原有输入：精选词汇 + 场景方向描述
  ├── 图片词库：按维度分类的视觉词汇（构图/材质/色调/风格）
  └── 风格概念：3-5 个风格方向 + 核心特征词

AI 在生成 Prompt 时：
  · 优先使用图片词库中出现频率高的具体材质和构图描述
  · 参考风格概念控制整体风格倾向（而非泛化的"beautiful design"）
  · 色调描述来自实际图片分析结果，而非 AI 想象
```

### 光线规则（路径 A 和 B 均适用）

#### ✅ 允许的光源

| 类型 | 适用场景 | Prompt 片段示例 |
|------|---------|-----------------|
| 日间天光 | 室内外日景 | `soft diffused daylight from ribbon windows` |
| 黄金时刻 | 日出日落 | `warm golden hour light, long shadows across the floor` |
| 阴天漫射 | 室外 | `overcast diffused light, no harsh shadows, even illumination` |
| 单窗侧光 | 室内 | `daylight from a single tall window, falling diagonally` |
| 天顶/天窗 | 中庭/大厅 | `zenithal light through a narrow slit above, sharp shaft of light` |
| 缝隙光 | 窄空间 | `thin line of light between wall and ceiling, revealing texture` |
| 路灯/钨丝灯 | 夜景街道 | `warm tungsten street lamp glow, pools of light on wet pavement` |
| 室内吊灯 | 室内 | `warm incandescent light from a single pendant lamp` |
| 烛光 | 暗光室内 | `soft warm candlelight, intimate glow, subtle flicker` |
| 月光 | 夜景 | `cool moonlight through a window, soft blue cast on the floor` |
| 霓虹/灯箱 | 街道/商业 | `dim neon sign glow reflecting on wet asphalt` |
| 结构间隙光 | 框架结构 | `daylight filtering through structural frame, lattice of shadows` |

#### ❌ 禁止的光源描述

```
禁止项及原因：

  ❌ lens flare — 镜头缺陷，非真实场景
  ❌ overexposed / blown highlights — 技术缺陷描述
  ❌ yellow glare / intense glare — 不合理眩光
  ❌ dramatic volumetric god rays — 除非场景明确有雾/尘/烟作为光源散射介质
  ❌ rim light / hair light — 摄影棚术语，非自然空间光线
  ❌ neon glow without a neon source in scene — 无源发光
  ❌ magical / fantasy light — 除非场景明确是奇幻主题
  ❌ unrealistic light beams from nowhere — 无来由的光束
  ❌ strong yellow light — 除非要求这么做了
```

---

## 使用指南

### 路径 A：清晰方向

1. 打开 `index.html`，点击 **"+ 新领域"**
2. 填写 Theme Keyword（中/英文）+ 详细的 Scene Description
3. 描述应包含：**地点 + 时间 + 元素 + 氛围**，≥ 30 字符
4. 点击 **"AI Research"**
5. 等待 15-30 秒，自动返回：
   - 强相关 tags（Pinterest + 花瓣网，点击复制）
   - 1-3 组最终 Prompt（一键复制）
6. 复制 Prompt 直接用于生图

### 路径 B：头脑风暴

1. 打开 `index.html`，点击 **"+ 新领域"**
2. 填入概念/术语作为 Theme Keyword
3. Scene Description 可以简短（如只写一个词），也可以留空让 AI 自由发散
4. 点击 **"AI Research"**
5. AI 自动判断为头脑风暴模式，返回：
   - 概念的领域归类 + 维度标签
   - 4-8 组关联组合场景方向
   - 每组对应的强相关 tags
   - 每组 1-2 个最终 Prompt
6. 结果按场景方向分组展示，可逐组查看和复制

### 场景描述写作指南（路径 A）

五点法：**地点 × 时间 × 元素 × 氛围 × 参考**

| 要素 | 问题 | 示例 |
|------|------|------|
| 地点 | 在什么空间里？ | 废弃工厂车间 / 雨后石板街道 / 山顶茶室 |
| 时间 | 什么季节/时刻？ | 冬日清晨 / 黄昏时分 / 深夜雨后 |
| 元素 | 有什么物体/人物？ | 生锈机床 / 积水倒影 / 旧木桌上一杯茶 |
| 氛围 | 什么情绪？ | 安静而怀旧 / 清冷孤寂 / 温暖的日常感 |
| 参考 | 像什么风格？ | 爱德华·霍普光影 / 王家卫色彩 / 杉本博司海景 |

### 概念输入示例（路径 B）

| 用户输入 | AI 判断 | 拆解结果 |
|---------|---------|---------|
| `山水建筑` | 设计理念 | 建筑/景观领域 × 地形融合 × 东方自然观 × 材料表达 → 6 组方向 |
| `插件城市` | 学术概念（新陈代谢派） | 城市/建筑领域 × 巨型结构 × 胶囊单元 × 代谢循环 → 6 组方向 |
| `礼堂与光线` | 本体 × 光线交叉 | 建筑/仪式空间 × 光源类型 × 材质 × 尺度 → 5 组方向 |
| `赛博朋克茶馆` | 跨域混合概念 | 室内/氛围 × 传统茶空间元素 × 科幻材质 × 霓虹光源 → 4 组方向 |
| `夯土` | 单一材质 | 材质 × 空间类型 × 地域 × 光线 → 5 组方向 |

---

## 与前端的集成

### Research 结果展示（改造后）

```
┌─ Research Results ─────────────────────────────────────┐
│                                                         │
│  [路径标识] 🧠 头脑风暴模式 · 已生成 6 组场景方向       │
│                                                         │
│  ┌─ 方向 1：胶囊居室内部 ──────────────────────────┐   │
│  │ Tags: capsule interior | warm amber light | ... │   │
│  │ Pinterest: 8 tags  花瓣网: 6 tags              │   │
│  │ Prompt (523 chars): Horizontal interior photo, │   │
│  │   16:9. Intimate metabolist capsule interior,  │   │
│  │   ... --ar 16:9 --style raw              [Copy]│   │
│  └────────────────────────────────────────────────┘   │
│  ┌─ 方向 2：空中连廊 ────────────────────────────┐   │
│  │ ...                                              │   │
│  └────────────────────────────────────────────────┘   │
│  ...（共 6 组）                                        │
│                                                         │
│  [Copy All Prompts]  [Save to My Domains]               │
└─────────────────────────────────────────────────────────┘
```

### Tags 展示

Pinterest 和花瓣网只返回 tags（不返回 URL），点击 tag 复制到剪贴板，用于快速浏览和挑选词汇。

---

## 文件结构

```
├── index.html              # AI Prompt Studio（主工具）
├── concept-map.html        # Concept Map（概念发散工具）
├── README.md               # 本文档
├── auto-gen/
│   ├── server.js           # 统一后端服务（API + 静态文件 + 爬虫）
│   ├── config.js           # Done AI 生图自动化配置
│   ├── generate.js         # Done AI 批量生图脚本
│   ├── inspect.js          # 页面 DOM 探查工具
│   ├── prompt-loader.js    # prompts.md 解析器
│   ├── .env                # API Key 配置
│   └── .env.example        # 配置模板
├── domains/
│   └── architectural-walkthrough/
│       ├── domain.md
│       ├── prompts.md
│       └── reference/      # 13 个建筑风格参考文档
├── memory-bank/
│   └── skill.md
└── templates/
```

---

## 设计决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| 搜索源 | Pinterest + 花瓣网 | 公开可搜、视觉内容质量高、中英文互补、反爬门槛低 |
| 不用小红书 | ❌ | 需登录、反爬严格、公开内容极少 |
| AI 引擎 | DeepSeek | 用户已有 key、成本低、中文理解强 |
| 双路径模型 | 清晰 / 头脑风暴 | 用户输入深度差异大，单一路径无法兼顾 |
| 光线规则 | 严格禁止过曝/眩光 | 这些词汇在 Prompt 中会产生不自然的结果 |
| 字符限制 | 536 字符 | Done AI 等主流生图模型的输入上限 |
| Tags 不返回 URL | 仅 tags 可复制 | 用户需要的是词汇灵感，链接去平台手动搜即可 |
| 图片视觉拆解 | Top 20 图片 AI 分析 | 文本标签无法反映真实视觉特征，图片拆解补充构图/色调/风格维度 |
| 词库 + 风格概念 | 从图片中提取结构化词库 | 让 Prompt 生成有据可依，而非纯靠 AI 训练数据想象 |
