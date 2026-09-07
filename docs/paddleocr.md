# 本地 PaddleOCR

默认链路：Poppler 转图（长边最多 3508 像素）→ PaddleOCR PP-OCRv6 small
检测及识别 → 原文规范化 → 全文缓存／索引。普通文字层 PDF 不必 OCR。

## 安装

安装 Poppler 和 uv，再运行：

```sh
bash services/ingest/scripts/setup-paddle-ocr.sh
```

独立环境在 `services/ingest/.venv-ocr`，直接依赖版本在
`services/ingest/requirements-ocr.txt`。模型通过 PaddleX 官方模型下载器取得，
复制到 `services/ingest/assets/paddleocr`，检测模型约 9.6 MB、识别模型约 21 MB。
这两个运行时目录不纳入源码；Docker 构建时运行相同安装脚本。

仅安装阶段允许下载。识别时显式指定本地模型目录并关闭模型源探测，
不上传案件、不调用云端 OCR、不回退 Tesseract。缺少环境或模型会报错。
旧 `assets/tessdata` 文件保留但不再被识别链路调用。

每个 PDF 使用一个 Python 进程，模型只加载一次，页面按顺序识别；
CPU 线程数固定为 4。未启用方向分类、去畸变和版面表格重建，旋转扫描件
应先校正方向。返回纯文字，不能把工资表等材料当成已准确还原表格结构。

缓存版本已更新，旧 Tesseract 全文不会复用。历史检索索引不会自动重写，
需要重新上传文件后生成新的索引；引文及已有案件事实仍应人工复核。

## 验证与限制

在 `services/ingest` 执行 `bun test` 和 `bun run typecheck`。
测试包括真实中文／英文图像 PDF、缓存失效、案件引文核验。
模型加载有开销，不承诺比旧引擎更快；仍需对真实材料核验姓名、案号和金额。
本次没有实现 300 页异步任务队列，首次读取仍受服务等待时长限制。

官方资料：https://github.com/PaddlePaddle/PaddleOCR
