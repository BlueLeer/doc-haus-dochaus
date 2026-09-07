# P0：重庆改造前基线与恢复记录

检查日期：2026-09-05。状态：P0 已完成验收；资产盘点、备份恢复、离线测试和在线核心流程均已建立可复现基线。没有删除任何业务资产，没有迁移任何现有案件。

## 备份与恢复

备份目录：`.p0-backups/2026-09-05T02-20-15.996Z/`，位于已核对的法律资产扫描路径之外。

- 288 个文件，2,562,616 字节；逐文件 SHA-256 位于 `manifest.json`。
- `files/project/` 保存 dochaus、apps/web、services/ingest、原有 docs、启动脚本和选定根配置。排除 node_modules、dist、符号链接及 .env 文件。
- `files/workspace/` 保存现有案件 matter.json 与共享技能、指引、模板、偏好文件。配置可能含凭据，因此备份目录权限为 0700，文件为 0600，不可加入公开版本库。
- 未复制案件原始证据、索引数据库、引擎会话库、模型缓存和全局配置。这是业务改造范围快照，不是整机或完整运行环境备份；P1 不得删除这些未备份数据。
- 已将所有备份文件复制到独立临时目录，并核对 288 个 SHA-256 全部匹配。演练路径和时间见 `restore-check.json`。未覆盖生产文件。
- 根目录没有 `.git`；当前没有 Git 回滚能力。

恢复方法：先停止会写入配置和案件元数据的服务；查看 manifest 选定待恢复路径；将 `files/project/<相对路径>` 恢复到项目对应位置，`files/workspace/<相对路径>` 恢复到确认的 WORKSPACE_ROOT；按 manifest.originalMode 恢复原权限并重新验算散列。只恢复本次改造涉及的文件，避免覆盖备份之后的用户变化。不要将快照中的凭据粘贴进日志或报告。

复用脚本：从项目根运行 `node script/p0-snapshot.mjs`。每次创建独立时间戳目录并做隔离恢复演练。该脚本没有覆盖生产数据或删除操作。P1 真正修改前应刷新快照。

P0 在线验收完成后已刷新 P1 前快照：`.p0-backups/2026-09-05T02-35-38.549Z/`，共 289 个文件、2,572,089 字节，隔离恢复演练 289/289 通过。原始 P0 快照继续保留，未覆盖。

## 当前资产与用户数据

机器可读明细见备份目录的 `inventory.json`。

| 类别 | 结果 |
| --- | --- |
| 司法辖区 | 30 个；无 CN/CN-CQ |
| 智能体文件 | 19 个 |
| 内置技能 | 11 个 |
| 内置指引 | 5 个 |
| 法律工具 | 38 个 |
| 自定义 agent/workflow 注册项 | 均未发现注册项；不能仅凭此证明所有文件都是原厂文件 |
| 默认工作区案件 | 3 个：1 个 EW，2 个 HK |
| 默认工作区共享内容 | .skills 空；.playbooks 5 项；.templates 1 项；.preferences 2 项 |
| MCP 配置名称 | python、courtlistener；未输出连接参数或凭据，配置存在不等于连接可用 |

数据位置为项目根 `workspace/`，与 start.sh 默认一致。本次 shell 未提供 WORKSPACE_ROOT，在线服务未运行，无法证明用户其他启动方式没有使用外部工作区。后续启动必须显式指定数据路径。

5 个工作区指引可能来自内置播种，也可能已有用户修改；P1 必须逐文件比对，不能按同名判断可删。模板和偏好全部按用户数据保留。一个 EW 演示案件绑定了 DPA 指引，需要记录原绑定，不自动改成重庆。

## 依赖清理表

| 对象 | 调用方/加载路径 | P1 处理 |
| --- | --- | --- |
| jurisdiction 下 30 个旧包 | ingest/matter.ts 扫描；lib/jurisdiction.ts；plugin/legal.ts；已有 matter.json | CN 包和旧绑定兼容策略就绪后移出运行目录 |
| 5 个欧美 playbooks | seed.ts → workspace/.playbooks；server.ts 每次启动调用 seedPlaybooks；opencode.json skills.paths | 同时处理播种源和已播种副本，保留修改版及历史绑定 |
| research、case-law、courtlistener | research.md；cite-check、citation-verification；plugin 的非美范围警告；前端注册/路由 | 先替换研究流程，再去除美法工具和无效引用 |
| legal-review | legal-reviewer → playbook-reviewer → assumption-challenger → summarizer | 替换整条劳动争议流程，避免留下缺失子智能体 |
| legal-reviewer | contract-risk-checklist、clause-library、missing-protections、firm-profile、employment-review、legal-research | 中国劳动争议技能完成后替换商业审查基准 |
| drafter、template-builder | drafting、redline-conventions、firm-profile；task 调用 legal-reviewer；plugin 起草后审查 | 保留文书机制，改造模板、术语及复核链 |
| qa、redactor | privilege-review；文档读/检索/引用；redactor 另有脱敏工具 | 保留功能，改造法律职业保密判断，不直接删除其技能 |
| redliner | redline-conventions、修订工具 | 保留 |
| compare、obligations、extract | read-document/search-document；ReviewGrid 使用 extract | 复用底层方法，调整 UI 定位；不能先删除 extract |
| router | 候选智能体名称和示例；apps/web/src/agents.ts；api/opencode.ts | 与引擎注册同步修改并检验自动路由 |
| agent/skill/workflow-builder | create/update/delete/list 工具；ingest 注册与 Markdown 生成；固定工具权限 | 保留维护能力，修正默认输出与中文 label 生成 ID 的限制 |
| 文书及演示数据 | seed.ts、template.ts、dochaus/templates、评测夹具 | 系统示例后续替换，用户模板保留；通用测试仍可用英文合成材料 |

技能发现还包括引擎配置目录的 `{skill,skills}/**/SKILL.md`、skills.paths、skills.urls，以及未禁用时的主目录/项目 `.claude` 和 `.agents` 外部技能。P1 必须验证最终可用技能列表；只清理 dochaus/skill 或隐藏 UI 不足以限定产品能力。本次未读取全局个人技能内容。

## 启动方式与运行状态

start.sh 从项目根启动三进程：引擎 4096、ingest 4500、Vite 5173，配置目录指向 dochaus，默认数据在根 workspace。默认执行依赖安装；SKIP_INSTALL 可跳过；--demo 会写入示例。

脚本还会终止占用指定端口的进程。在线验收使用 `SKIP_INSTALL=1 NO_OPEN=1` 启动，不执行安装、演示播种或浏览器自动打开，并将 `WORKSPACE_ROOT` 显式固定为项目根 `workspace/`。

首次在受限执行环境内启动时，网页端口被阻止且引擎状态库只读；在正常本机权限下启动后，引擎 `127.0.0.1:4096`、ingest `127.0.0.1:4500`、Vite `localhost:5173` 均正常监听并返回 HTTP 200。该差异属于验证环境权限，不是产品启动故障。

## 在线核心流程基线

使用项目自带的合成 `services/ingest/src/fixtures/text-layer.pdf` 创建临时案件 `P0-VALIDATION-20260905`，未使用真实客户材料。验收完成后已删除两个测试会话和整个临时案件，工作区恢复为原有 3 个案件。

| 流程 | 结果 |
| --- | --- |
| 三服务启动 | 通过；引擎、ingest、web 均可访问 |
| 上传与文本提取 | 通过；PDF 在约 12 秒内完成，得到 4 个章节、4 个检索块 |
| BGE-M3 索引 | 通过；`embedding_model` 为 `onnx-community/bge-m3-ONNX`，每条向量 4096 字节（1024 维 Float32），FTS 与向量块数量一致 |
| AI 问答与检索 | 通过；DeepSeek `deepseek-v4-flash` 实际调用 `search-document`、`get-section`、`verify-quote`、`cite`，正确回答提前 30 天书面通知 |
| 引用 | 通过；引用元数据定位到 `text-layer.pdf` 第 7.2 条，逐字引文验证成功 |
| Word 文书输出 | 通过；生成 `P0-合同摘要.docx`，自动重新索引并通过 `read-document` 读回核对；测试后随临时案件删除 |
| 数据隔离与清理 | 通过；临时案件只出现于指定 `WORKSPACE_ROOT`，删除后原有 3 个案件 ID 未变化 |

## 检查结果

运行环境：Bun 1.4.0；根 packageManager 声明 Bun 1.3.14，存在版本差异。

| 检查 | 结果 |
| --- | --- |
| ingest：bun typecheck | 通过 |
| web：bun run build | 通过，原有 JS 包大小警告 |
| ingest：matter.test.ts | 4 通过 |
| ingest：skill.test.ts | 13 通过 |
| ingest：agent.test.ts | 9 通过，1 失败 |
| ingest：workflow.test.ts | 10 通过，6 失败 |
| dochaus：markdown.test.ts、optional.test.ts | 9 通过 |
| 备份恢复 | 288/288 文件散列一致 |
| 在线启动、上传索引、AI 问答、引用、生成文书 | 通过（合成材料，详见“在线核心流程基线”） |

合计选定测试 45 通过、7 失败；在线验收后复跑结果一致。每个 ingest 测试文件单独运行，避免测试修改环境变量造成跨文件污染。测试使用临时目录。

失败记录：agent.test.ts:90 和 workflow.test.ts:104 期待生成文本含有 `No edge case handling, ever.`，当前实现没有该句；workflow 测试临时目录没有可用子智能体导致创建/更新失败，并引起后续删除失败；未知工作流更新期望 404，实际先校验步骤返回 400。以上为修改业务代码前发现的基线，未为使测试变绿而修改实现。

## P1 前的行动项

1. 判定工作流夹具和文本断言哪些过时，单独修复并记录；当前测试不是全绿，7 个失败是 P0 前已存在的基线问题。
2. 逐项核对已播种指引与源包差异，以及模板来源；给出最终删除名单。
3. 增加有效地区与有效技能的运行时检查，再启动 CN/CN-CQ 替换。

P0 已达到“选定备份可恢复、系统与用户数据边界清楚、核心流程基线可复现”的验收条件，可以进入 P1。既有 7 个测试失败作为改造前缺陷保留，不误记为重庆改造引入的回归。
