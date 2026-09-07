# 简体中文 OCR 语言包

本项目使用 Tesseract 的 `chi_sim` 简体中文 LSTM 模型，通过 `--tessdata-dir` 指向本目录并显式指定 `-l chi_sim --oem 1`。不使用宿主系统默认英文模型，也不在识别时下载文件。

- 官方仓库：https://github.com/tesseract-ocr/tessdata_fast
- 固定提交：`87416418657359cb625c412a48b6e1d6d41c29bd`
- 文件：`chi_sim.traineddata`
- 大小：2,469,156 字节
- Git blob SHA-1：`388bac276d033d06e5ed5ba7a7ad14ae58f97dab`
- SHA-256：`a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730`
- 许可证：Apache-2.0，原文见本目录 `LICENSE`。

下载使用固定官方版本的 jsDelivr 镜像，并以 GitHub 官方 Git tree 返回的 blob SHA-1 校验一致。模型随项目和 Docker 构建一起分发。

中文图片型 PDF 回归样本：`src/fixtures/chinese-scanned.pdf`。该文件由 `scripts/create-chinese-ocr-fixture.py` 生成，仅含虚构文字且无文字层。

验证：PingFang 印刷体样本中的中文姓名、地点、日期和工资金额均通过；原英文扫描样本继续通过。另测 STHeiti 字体时出现“9月”误识别，说明日期与金额仍需人工核对，测试通过不代表任意字体、模糊扫描或手写内容均能准确识别。
