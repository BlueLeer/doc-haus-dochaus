# 模型接力文档：重庆劳动争议办案平台

更新日期：2026-09-07（Asia/Shanghai）。本文供下一位开发模型直接接手。

> 2026-09-07 晚：① Settings 的 Models/Providers 两个 tab 合并为单页“AI model configuration”，含默认/Fast 槽卡、OpenAI 兼容服务商的添加与编辑表单、Vertex/Bedrock 主机凭据折叠区；② 新增 `updateLocalProvider` / `removeLocalProvider` / `removeProviderKey` 三个 API；截图见 `.workbuddy/artifacts/ai-models-settings-*.png`。

> 2026-09-07 晚修订：项目已纳入 Git（远程 `git@github.com:BlueLeer/doc-haus-dochaus.git`，本地默认分支 `dev`，origin 已跟踪）。"无 .git、别假定可回滚"的旧表述作废，改动前无需手动快照；`.p0-backups/`、`.workbuddy/`、`.zed/` 已加入根 .gitignore，含凭据的备份不会误提交。接手步骤见第 11 节。

这是**已实现状态、历史决策及工程风险记录**，不是新的实施授权。先读取用户最新请求，再决定工作范围。本文不含密钥或真实案件正文。状态依据本次代码检查和前几轮实际测试；不代表所有测试在本文生成时重新执行过。

## 1. 先读这一页

- 项目最初是 doc.haus：基于 OpenCode 真正 fork 的法律智能体平台。现在正在改为**中国大陆劳动争议专属平台，重庆先上线，后续地区可扩展**。
- P0 基线与备份、P1 重庆产品骨架与裁剪、P2 结构化案件工作台已交付。**P3 全国/重庆规则资料库和 P4 确定性计算、专业文书闭环尚未完成**。
- `rulesReady: false` 是有意保留的真实状态，不是需要消除的 UI 报错。不能将重庆选项、劳动技能和提示词称为已经具备经核验的重庆法律规则库。
- 当前 OCR 是**本地 PaddleOCR PP-OCRv6 small**，不是 Tesseract。检索嵌入是 **BGE-M3**，不是 OCR 模型。对话模型当前配置为 `deepseek/deepseek-v4-flash`，以后以实际配置为准。
- 网页上传已经有**后台内存任务与每秒进度查询**，能跨页面继续；**没有服务重启后的断点续作，也没有大卷宗持久化任务队列**。
- 最近交付的是统一「案情整理」与集中确认：已移除独立补充入口；确认摘要会原子同步案件要素/经过、推进案件版本，并在条目显示最近修改版本。律师确认版作为当前办案口径，普通底层记录显示摘要已覆盖，仅冲突、来源变化和关键缺失需逐项处理；详见 `docs/case-summary.md`。
- 项目已纳入 **Git 版本控制（2026-09-07 起）**：远程 `git@github.com:BlueLeer/doc-haus-dochaus.git`（私有），本地默认分支 `dev` 已跟踪 origin/dev，可正常 commit/push/回滚，不再需要手动备份。`.p0-backups/`（含凭据的转型前快照）、`.workbuddy/`、`.zed/`、node_modules、workspace 运行时数据均在 .gitignore 中，不会误提交。
- 用户偏好：中文沟通，直接实施、重视可见效果和回归验证；不要把模拟状态、单一样本成功或提示词框架当成完整能力。

推荐阅读顺序：本文件 → `AGENTS.md` → `docs/chongqing-labor-platform-plan.md` → 对应功能代码与验收文档。旧文档的阶段状态可能过时，以实际代码与本文日期说明为准。

## 2. 产品方向与设计理由

### 已确认方向

1. 不再做泛欧美商业合同平台，只聚焦中国劳动争议。
2. 重庆作为第一个地区，未来按地区包扩展，不复制一套系统。
3. 沿用现有设计蓝本：OpenCode 引擎、案件目录隔离、文档检索、工具、技能、工作流、Word 输出。
4. 以律师为主要使用者，案件可记录劳动者侧、单位侧和争议立场；不能预设所有用户都代理劳动者。
5. 首批规划：劳动关系、解除/终止、补偿/赔偿、工资奖金；第二批扩展加班、二倍工资、年休假、竞业限制等。首批“规划覆盖”不等于当前均已具备专业闭环。

### 核心原则

- **事实、规则、计算分离**：模型提取候选事实；承办人核对；规则有来源、版本和适用条件；金额由确定性函数计算。
- **全国与地方不是简单覆盖关系**：`CN-CQ` 继承 `CN`；工作地、单位所在地、履行地、受理地可能不同，不能看用户选了重庆就将一切套重庆标准。
- **双方冲突并列保留**：不要把两种说法自动合成一个“真实事实”，也不要静默覆盖已确认记录。
- **材料引用核验不等于法律效力核验**：能在 PDF 中逐字找到一段话，只证明引用忠实，不证明该规则有效或适用。
- **保留通用能力、裁剪业务默认值**：清理无用欧美资产时保留用户文件、模板和自建内容；隐藏入口不等于权限控制。
- **合并上游优先**：法律业务写在 `dochaus/`、`services/ingest/`、`apps/web/`，不要为中文业务随意修改 OpenCode 核心。

## 3. 阶段地图：什么做完了，什么没有

| 阶段 | 状态 | 内容及边界 |
| --- | --- | --- |
| P0 | 已完成 | 资产盘点、隔离备份恢复演练、上传/检索/引用/Word 基线；历史基线有 7 个既存测试失败，不能误当成现在仍失败 |
| P1 | 已完成 | 产品清单、全国与重庆父级结构、活跃智能体/技能裁剪、默认地区和路由、演示流程调整；不等于法律内容就绪 |
| P2 | 已完成 | 案件概况、时间轴、证据目录、请求关联、来源核验、人工确认、分析版本；详细证据见 P2 验收文档 |
| P3 | 未完成 | 独立规则资料库、官方来源核验、效力/历史版本/过渡条款、按日期查询 |
| P4 | 未完成 | 已核验范围的请求分析、确定性金额计算、专用文书与复核闭环 |
| P5 | 未完成 | 扩大案由、合成第二地区接入测试、完整产品验收 |

P2 后的增量交付：简体中文 OCR → 全文缓存与读取断连修复 → PaddleOCR 替换 → 上传进度后台任务 → 工作台视觉整理 → 手动案情录入与解析预览。

**旧规划文档开头仍写“业务改造尚未开始”，结尾仍写“下一步 P0”**；这些是规划形成时的快照，不能照着重做。该文档中 P1/P2 小节及本文件说明了后续状态。

## 4. 运行环境与数据边界

本机项目位置：`/Users/wangdahong/Desktop/法律人skill/doc-haus-dochaus`。Apple Silicon arm64、macOS；开发中实测 Bun 1.4.0，根声明/原 Docker 基线为 Bun 1.3.14，存在版本差异。

| 进程 | 地址 | 职责 |
| --- | --- | --- |
| OpenCode 引擎 | `http://127.0.0.1:4096` | 会话、模型调用、工具执行 |
| ingest | `http://127.0.0.1:4500` | 案件、上传、解析、索引、工作台持久化 |
| React/Vite | `http://localhost:5173` | 网页界面 |

本地启动（从根目录；已有依赖时）：

```sh
SKIP_INSTALL=1 NO_OPEN=1 ./start.sh
```

- 引擎必须使用 `OPENCODE_CONFIG_DIR=<项目>/dochaus`，不要误用上游 `.opencode/` 开发配置。
- `WORKSPACE_ROOT` 默认根目录 `workspace/`，可通过环境变量改写；先确认实际运行目录再操作数据。
- `start.sh` **会终止占用上述端口的进程**，还会在退出时清理子进程；仅“查看状态”不要启动 start.sh（它会抢占端口）。
- **重启策略：能热更新就热更新，热更新不了就正常重启**。前端 Vite 有 HMR（改 `apps/web` 源码即时生效）；ingest 可单独重启（kill 占用 4500 的进程后以相同 env 重跑 `bun run src/server.ts`，不碰引擎/前端）；引擎侧或 `dochaus/` 配置层（agent/skill/jurisdiction/product 等）改动无热更新通道，需要重启整套。重启只会清掉内存中的上传任务和活动会话——确需重启时先确认没有关键进行中任务即可，不要因怕打断而僵着不改。
- 服务是否仍在运行需要现场检查。先前有“上一轮启动成功，下一轮端口已不在监听”的情况，不能凭上次日志保证当前可访问。
- 在受限执行环境，访问端口、绑定端口、引擎写入本机状态库可能需正常本机权限。不要把沙箱拒绝误判为产品故障。
- 引擎曾提示未设 `OPENCODE_SERVER_PASSWORD`；当前只用于本地。上线前需独立做认证、权限、隔离和部署安全设计，不能直接公开监听地址。

### 文件在哪里

| 路径 | 内容 |
| --- | --- |
| `workspace/<案件ID>/matter.json` | 案件元信息 |
| `workspace/<案件ID>/<文件名>` | 用户原始材料，不能当缓存删除 |
| `workspace/<案件ID>/.dochaus/legal.db` | 文档、分块、向量、全文检索和结构索引 |
| `workspace/<案件ID>/.dochaus/casebook.json` | 案件记录、revision、分析历史 |
| `workspace/<案件ID>/.dochaus/text-cache/` | 敏感原文提取缓存，按案件保护 |
| `workspace/.templates`、`.skills`、`.playbooks`、`.preferences` | 工作区共享内容/用户偏好，先查来源再清理 |
| 引擎自己的本机状态目录 | 会话等，不是仅复制 workspace 就完整备份了引擎 |

备份：`.p0-backups/2026-09-05T02-20-15.996Z/`、`.p0-backups/2026-09-05T02-35-38.549Z/`。分别做过 288/288、289/289 文件散列恢复校验。**未包含原始证据、索引、会话库和模型缓存**；配置快照可能含凭据，禁止公开提交或打印。详见 `docs/p0-baseline.md`。

## 5. 接手代码导航

| 功能 | 主要文件 |
| --- | --- |
| 产品启用清单 | `dochaus/product.json` |
| 地区资料/父级解析 | `dochaus/jurisdiction/CN/`、`CN-CQ/`、`dochaus/lib/jurisdiction.ts` |
| 法律上下文注入 | `dochaus/plugin/legal.ts` |
| 劳动主助手与子角色 | `dochaus/agent/labor*.md` |
| 业务技能 | `dochaus/skill/labor-*/SKILL.md` |
| 前端角色及路由 | `apps/web/src/agents.ts`、`apps/web/src/api/opencode.ts` |
| 案件工作台共享模型 | `dochaus/lib/casebook-model.ts` |
| 案件存储与引用校验 | `services/ingest/src/casebook.ts` |
| 模型写入工作台工具 | `dochaus/tool/casebook.ts` |
| 工作台页面/样式 | `apps/web/src/components/CaseWorkbench.tsx`、`case-workbench.css`、`CaseSelect.tsx` |
| 文档提取/索引 | `services/ingest/src/ingest.ts`、`pdf.ts`、`db.ts` |
| 全文缓存 | `services/ingest/src/text-cache.ts` |
| OCR Python 桥接/安装 | `services/ingest/scripts/paddle-ocr.py`、`setup-paddle-ocr.sh`、`requirements-ocr.txt` |
| 上传任务及进度 | `services/ingest/src/upload-jobs.ts`、`progress.ts`、`server.ts` |
| 上传页面与查询 | `apps/web/src/components/DocumentUpload.tsx`、`apps/web/src/api/ingest.ts` |
| 全文读取工具 | `dochaus/tool/read-document.ts` |
| 向量模型两端 | `services/ingest/src/embed.ts`、`dochaus/tool/search-document.ts` |
| 对话流与恢复 | `apps/web/src/components/ChatPanel.tsx`、`pages/MatterDetail.tsx` |
| 中英文界面 | `apps/web/src/i18n.tsx`、`prefs.ts`；工作台现有文案主要为中文 |

活跃角色：labor、labor-drafter、labor-research、labor-reviewer、labor-review，以及 router 和四类构建器。活跃技能以 product.json 为准，当前包括引用、受理、争点、证据、程序、补偿、地方规则、起草、修订约定。文件名列表不是运行时权限的充分证明，新增/删减要一起检查发现路径、权限、路由、工作流引用。

## 6. 工作台的真实行为

1. 上传文件先提取并索引，**不会自动生成工作台事实记录**。
2. “从材料整理”跳到对话并**预填**请求，用户还要发送；不是点击就开始自动写入。
3. labor 读取材料后通过 casebook 工具 propose 追加草稿。概况、事实、证据必须带原文来源；未知值写入缺口，不得编造引文。
4. 服务端逐字核验引用，并记录文件指纹。文档改动/删除后标记来源待复核。
5. replace/propose/analysis 带 revision；有冲突应重读，不能强行覆盖。分析保留依据版本，案件变动显示待更新。
6. 人工确认表示承办人核对，不消除当事人之间的争议；改动字段会恢复待确认。

页面美化（2026-09-06）：概览指标、带计数分类导航、记录标题/状态、来源核验区域、统一 42px 控件、自定义下拉菜单、整行复选框及窄屏 CSS。下拉框支持方向键、Home/End、Enter、Escape、Tab、外部点击关闭。**仅页面改造，未改变数据格式**。

对话切页与上传切页要分开看：ChatPanel 卸载会断开事件监听，没有主动调用停止会话接口，但运行状态恢复、首次会话 ID 同步和权限等待仍有体验风险；本次上传后台任务改造**没有同时修复所有对话恢复问题**。工作台也不是持续实时刷新助手写入结果，必要时点“重新加载”。

## 7. OCR、缓存、索引：当前准确状态

### 当前链路

文字层 PDF：markitdown 优先、unpdf 兜底。文本长度每页不足 100 字符时认为疑似扫描件，转入 OCR。

扫描件：Poppler 按页转图（300 DPI、长边上限 3508）→ 一个 Python 进程加载本地 PaddleOCR → 按页输出文字和进度 → 规范化 → 缓存/索引。

依赖固定：paddleocr 3.7.0、paddlepaddle 3.3.1、paddlex 3.7.2。模型为 `PP-OCRv6_small_det`（约 9.6 MB）和 `PP-OCRv6_small_rec`（约 21 MB），不含 Python 依赖体积。CPU 4 线程；未启用方向分类、去畸变或表格结构重建。

安装：先有 Poppler、uv，再运行：

```sh
bash services/ingest/scripts/setup-paddle-ocr.sh
```

环境在 `services/ingest/.venv-ocr`，模型在 `services/ingest/assets/paddleocr`；二者不进源码，Docker 构建会安装。模型下载调用 PaddleX 官方接口，真实 import 位于 `paddlex.inference.utils.official_models`。不要凭旧版本示例猜包路径。

运行时显式使用本地模型，不上传案件，不回退 Tesseract；**这不代表整个应用完全离线**，对话模型仍可走外部提供商，markitdown 缺少安装时的 uvx 路径和首次嵌入模型下载也可能需要网络。旧 tessdata 文件保留但不再调用。Docker 改动已写入，未做实际 Docker 构建验收。

### 全文缓存

- 键包含提取配置版本、扩展名、文件内容 SHA-256；换文件内容自动失效。当前版本 `paddleocr-v6-small-3508-v1`。
- 绝对文件路径才缓存；上传、读取、工作台引文校验使用绝对路径。相对路径工具/测试不会自动落同一份缓存。
- 缓存原始提取文字，调用方仍规范化/扫描；并发相同提取合并，失败不缓存，临时文件原子替换。
- 更换模型/预处理参数要审查是否升级缓存版本。
- **缓存失效不等于重建 legal.db 索引**。旧文件若要统一使用新 OCR 检索，需要重新上传/重新索引；已有工作台引用可能因此需要人工复核。

### 嵌入

两端必须一致：`onnx-community/bge-m3-ONNX`、q8、1024 维、CLS pooling、normalize=true。文档块向量包含文件名/章节前缀，数据库原文不改写。

Transformers.js 使用显式 `env.remoteHost`；仅设置 HF_ENDPOINT 不会自动生效，所以代码主动取该环境变量，默认使用 hf-mirror.com。换模型需同步索引端、查询端和元数据/迁移，不能混用向量。迁移目前可能一次并发嵌入很多块，大数据量需审查资源压力。

## 8. 上传进度与大文件边界

- 网页调用 `POST /matters/:id/documents?async=true`，接收文件后返回 202 和任务 ID；旧同步接口保留。
- `GET /matters/:id/uploads` 每秒查询：extracting → rendering → ocr → preparing → indexing → complete；失败另有 status/error。
- 转图/OCR 按页，索引按块计数；**百分比是阶段比例，不是全流程比例，也不是剩余耗时估算**。未知阶段不编造百分比。
- 临时查询断网显示重连，不将仍在后台的处理错误地报告为失败；切回文档页重新查询任务。
- 同案件同名文件并行上传被拒绝；不同文件未加全局限流。完成历史有限保留。
- 任务保存在内存 Map，**进程重启丢状态**；尚无持久化队列、暂停、取消、恢复、全局并发上限。
- 仍先完成所有页转图再进入 OCR，并非一页识别完立即删除一页。大文件磁盘与内存管理尚待优化。
- 同步全文读取仍设 `idleTimeout: 255`；网页后台上传已绕开长处理请求等待，但文件传输、同步调用方和首次全文读取仍需单独评估。

300 页的历史估算来自 Tesseract 版本一份 12 页文件 146 秒，线性约 61 分钟，曾建议预留 40–120 分钟。**不是 PaddleOCR 的 300 页实测，不可作为性能承诺**。当前未通过 300 页稳定性验收。

## 9. 踩坑记录：不要重蹈覆辙

| 现象/坑 | 原因或证据 | 已做处理 / 仍需注意 |
| --- | --- | --- |
| 默认凭据 Could not load default credentials | 早期默认 Google Vertex，需要 ADC | 后续改用可配置提供商；目前 DeepSeek，不要仅照 AGENTS 的历史 runtime 描述强迫用户登录 Google |
| 中文材料检索差、模型下载失败 | 原嵌入方案及 HuggingFace 网络问题 | 更换 BGE-M3，显式设置下载地址；首次加载仍需核查缓存及网络 |
| 上传“处理中”但不知成败 | 早期只有长同步请求和通用文案 | 现为后台任务、分阶段进度与明确错误；不是所有历史请求都会恢复 |
| 文件显示在列表，工作台却空 | 文字索引与结构化案件整理是两步；一次失败记录明确拒绝无原文事实 | 先查 casebook revision/rows/analysis，再查文档正文；不要判断成单纯 UI 隐藏 |
| read-document socket unexpectedly closed | 实测约 9.6 秒连接被关闭；接口每次重跑提取/OCR | 复用全文缓存、延长空闲等待；截图里后续工具变绿不证明全文调用已成功 |
| 12 页扫描转图耗时极长 | 手机 PDF 声明页面 1718×2461 pt，300 DPI 生成约万像素图；旧请求还留转图子进程 | 限长边 3508、停止明确识别的旧进程；不能无差别杀所有 OCR 进程 |
| 一次完整读取 146 秒，再读 0.019 秒 | 修复后真实 12 页样本 HTTP 200，缓存命中内容一致 | 这是当时 Tesseract 缓存链路成绩，不是换 Paddle 后同文件速度 |
| 换了中文语言包不代表 OCR 无误 | 早期 STHeiti 样本“9月”被误识别；PingFang 样本通过 | 保留样本局限说明，不能为了测试绿而放松姓名、金额、日期核验 |
| 更换 Paddle 后单页变慢 | 新模型加载和推理有成本；回归单页约 11–12 秒 | 不宣传必然更快；按真实卷宗测准确率、转图、初始化、识别、索引分项耗时 |
| 只删除 agent 文件引出新错误 | ReviewGrid 仍调用旧 extract，工作流/路由也有引用 | P2 已修 ReviewGrid 为 labor；以后删角色必须核全链路 |
| 初次模型整理漏 revision、工资字段混用 | 工具约束/字段定义不清 | 版本必填、结构化字段、登记规则；别依赖“模型应该懂” |
| 选项和主体样式不一致 | 原生 select 弹层由系统控制，难保证一致 | 工作台使用 CaseSelect；键盘访问必须一起实现 |
| 输入框比下拉框矮，checkbox 与字错位 | 全局 input:not(...) 选择器优先级更高；标签原为普通块布局 | 工作台限定作用域和高度，checkbox 固定尺寸+flex；不要全局乱加样式影响别的页面 |
| 切页像停止了 | 事件订阅卸载、状态没恢复、工作台不自动刷新；权限确认也会等待 | 上传已单独改善；聊天运行状态仍需独立做端到端验证 |
| “构建成功”被当成类型/业务测试全过 | Vite 不等于 TypeScript 检查，更不等于模型实际行为 | 包级 typecheck、单测、真实接口、浏览器交互分别记录 |
| 中文文件名下载 500 | Content-Disposition 直接放裸中文，Bun 抛 Header invalid value（server.ts） | 已加 `contentDisposition()`（RFC 5987：ASCII 回退 + `filename*=UTF-8''`）；以后新增下载端点必须走该函数，不要裸拼文件名 |
| 测试误报“PaddleOCR 环境未就绪” | 测试 shell 的 PATH 缺 `/opt/homebrew/bin`，`Bun.which("pdftoppm")` 找不到；`.venv-ocr` 与 poppler 实际完好 | 跑 ingest 测试前 `export PATH="/opt/homebrew/bin:$PATH"`；这是测试环境问题，非产品故障（服务运行时 PATH 完整） |

额外待审查风险（尚未认定为用户已遇到的故障）：扫描件判断仅按文字长度，乱码但字数够会绕过 OCR；OCR 更换后文件指纹未变但提取文字可能改变；索引写入原子性和失败后文档可见性；大文件 migration 并发；内存任务与删除案件/服务关闭的协调。

## 10. 验证记录与复现命令

历史验证分开看：

- P2：ingest 87 项、dochaus/lib 7 项，真实模型材料整理/审查提取和浏览器操作通过，见 `docs/p2-verification.md`。
- 中文 Tesseract：88 项；全文缓存后 90 项。
- PaddleOCR 替换：90 项、276 assertions，约 48 秒；中英文扫描样本与类型检查通过。
- 上传进度：93 项、287 assertions，前后端类型检查、网页构建通过；实际一页/三页虚构中文 PDF 上传和切页结果恢复通过。
- 最近 UI 整理：web 类型检查、生产构建、浏览器截图和交互验证；方向键+回车切换下拉选项、Home 恢复、点击 checkbox 文本切换并恢复。**UI 轮没有重跑全量后端测试**。
- 网页构建一直有单 bundle 超过 500 kB 警告，未在本次任务顺手做拆包。

从相应目录运行，不在根目录跑全仓测试，不直接调用 tsc：

```sh
# services/ingest
bun test
bun run typecheck

# dochaus/lib
bun test

# apps/web
bun run typecheck
bun run build
```

完整合成业务回归：服务运行后，在 services/ingest 执行 `bun scripts/p2-smoke.ts`。
模型回归有真实模型用量：`bun scripts/p2-agent-smoke.ts <合成案件ID>` 和 `bun scripts/p2-review-smoke.ts <合成案件ID>`；不要默认拿真实案件跑写入测试。

可用测试材料/案件：

- `services/ingest/src/fixtures/chinese-scanned.pdf`：虚构中文图像 PDF；生成脚本 `scripts/create-chinese-ocr-fixture.py`，macOS 默认 PingFang 字体。
- `p2-71db6f`：“P2回归验收（虚构材料）”，含结构化记录，可做 UI 检查。
- `matter-7361b4`：“上传进度回归（虚构材料）”，保留一页/三页中文测试材料。
- `matter-9cd03e`：“劳动争议案件测试”名称虽然有“测试”，**里面是用户上传的裁决书，不能视作可删除的合成夹具**。

UI 测试优先使用专门测试页或合成案件；选择项临时改动后恢复原值，不点保存；不要动用户已经打开的未保存表单。不可为验收方便上传真实法律材料到第三方。

## 11. 下一位模型建议如何开始

### 第一步：现场核对，再决定热更新还是重启

1. 读取用户本轮要求、本文件和 AGENTS。确认当前目录、git 状态（本地分支 dev、有无未提交改动——有则先审阅提交）和正在监听的端口。
2. 检查正在执行的上传/会话（重启会清掉内存任务）；按第 4 节重启策略决定：可热更新/单进程重启的先局部处理，确需整套重启时在确认无关键进行中任务后正常重启。用户仅要求评估时不要改配置或启动付费模型测试。
3. 只读取需要的配置，不打印 API key、凭据、备份配置全文或用户证件信息。
4. 改动前记录可恢复副本；P0 快照不保护后续工作台、OCR、上传进度、UI 新改动。

### 建议优先级（待用户授权，不自动实施）

1. **工程稳定性**：持久化上传任务、后台执行器、重启中断状态/恢复、单页流水线、并发上限、取消和失败重试；先做 30 页再 300 页实测。
2. **全文与索引一致性**：重新索引入口、提取版本与索引版本关联、原子索引更新、提取错误和坏文字层识别；避免用户只能删除重传。
3. **案件整理体验**：任务标识跨页恢复、待权限提示、运行中/成功/失败统一展示、工作台安全刷新（不覆盖未保存修改）。
4. **P3 规则库**：延续原规划，先选首批主题，建立来源与版本字段、官方来源清单、人工核验流程；不要靠提示词写死地方标准。
5. **P4 计算与文书**：在 P3 规则和确认事实足够后做确定性工具，保留可复算输入、公式、规则版本及引用。

针对 300 页的验收建议：任务入队快速返回；页数/块数进度真实；刷新不丢；重启能识别中断且按设计恢复；取消能终止子进程；同名重复不会破坏索引；磁盘与内存有上限；全卷页序不乱；姓名、日期、金额有抽样人工标注；将转图/OCR/索引分别计时。不能仅看“最终有文字”就判定生产可用。

## 12. 文档索引与历史优先级

- `docs/chongqing-labor-platform-plan.md`：原始产品蓝图，含过时的开头/结尾状态。
- `docs/p0-baseline.md`：备份边界、资产清理依赖、历史失败与恢复方法。
- `docs/p2-verification.md`：工作台数据语义和真实模型回归。
- `docs/ocr-read-fix.md`：读取断连修复历史；其中同步等待边界需结合后续上传任务看。
- `docs/paddleocr.md`：当前 OCR 安装与限制；其“先所有页转图再 OCR”仍成立，转图现为逐页调用。
- `docs/upload-progress.md`：最新上传阶段与内存任务边界。
- `docs/case-workbench-design.md`：最新 UI 设计及验证。
- `docs/architecture.md`、`docs/providers.md`、`docs/threat-model.md`：基础架构资料，阅读时核对后续变更。

接力底线：**保留已有工作，不把历史状态当现在，不把讨论方案当已经实现，不把模型输出当经核验法律结论。**
