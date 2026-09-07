# Word 编辑小范围验证

更新日期：2026-09-07。状态：Docker 安装修复完成，官方编辑器镜像下载受网络阻塞，实际编辑验证尚未开始。

## 范围

用户授权先做小范围验证，不是正式替换预览器。候选为独立部署的 ONLYOFFICE Docs。只使用新建的虚构 DOCX，不上传真实案件到第三方，不覆盖案件原件，不修改现有修订链路。

## 初始环境诊断（已修复）

- 主机为 macOS arm64。
- `/usr/local/bin/docker` 指向不存在的 `/Applications/Docker.app/Contents/Resources/bin/docker`。
- `/Applications/Docker/Contents/Resources/bin/docker` 客户端仍可运行，版本 20.10.10（2021 年构建）。
- 默认 socket 与显式指定的用户 Docker socket 均无法连接服务；显式 socket 已在非沙箱权限下复核。
- 尝试通过应用接口启动现有 `/Applications/Docker` 未成功，返回无法找到运行中的应用。
- 没有安装或升级 Docker，没有启动编辑器服务，没有完成真实 DOCX 编辑、保存或排版验证。不能将当前状态表述为验证通过。

## 2026-09-07 安装修复结果与当前阻塞

- 用户已明确允许修复或安装 Docker Desktop。
- 从官方 `https://desktop.docker.com/mac/main/arm64/Docker.dmg` 下载 Apple Silicon 安装包（约 556 MiB）。下载器保留 TLS 校验，未使用第三方镜像。
- 沙箱内 codesign 报错，经非沙箱系统权限复核：`valid on disk`、`satisfies its Designated Requirement`；spctl 显示 `accepted / Notarized Developer ID`，通过后才安装。
- 安装到 `/Applications/Docker.app`，版本 4.89.0；最低 macOS 14.0，与本机 14.8.1 兼容。保留 `/Applications/Docker` 旧目录及已有用户数据。
- Docker Engine 与客户端均为 29.7.2，服务端 linux/arm64，`desktop-linux` 上下文已连通；原 `/usr/local/bin/docker` 链接恢复可用。
- 应用界面读取超时，但 CLI 已实际确认服务可用；没有代替用户点击协议、输入密码，也未使用接受协议的安装参数。
- 两次拉取 `onlyoffice/documentserver:latest` 均因访问 `registry-1.docker.io` 超时失败；宿主机 curl 同一端口也连接超时，不能误判为镜像名错误。当前无缓存镜像可复用。
- `scutil --proxy` 返回空配置。未擅自配置代理、未改用来源不明的镜像、未开放外网端口。
- 安装后剩余磁盘约 32 GiB；下载包保留在 `/private/tmp/dochaus-docker.wSKL6w/Docker.dmg`。

下一步需要可访问 Docker Hub 的网络/用户提供的代理地址，或获授权的私有 ONLYOFFICE 测试服务。本轮没有部署编辑器、创建测试 DOCX、启动验证页或完成编辑保存测试；现有案件服务未重启，真实案件未修改。

## 环境就绪后的验收顺序

1. 独立服务、仅本机访问、开启鉴权；不复用生产案件或将本地端口公开到互联网。
2. 构造带中文正文、表格、编号、页眉页脚的虚构 DOCX，保留原件哈希。
3. 独立验证页嵌入编辑器，正文和表格分别编辑。
4. 保存回调只写入新副本；验证鉴权、下载来源限制及版本匹配。
5. 下载副本，用 Word 打开检查中文字体、分页、表格、编号及内容；核对原件未变。
6. 在独立测试案件中索引副本并检索修改后的内容；与旧文档区分。
7. 记录成功项、失败项和部署/授权成本，再决定是否集成正式文档页面。

参考：ONLYOFFICE 官方 ARM64 Docker 安装说明 https://helpcenter.onlyoffice.com/docs/installation/docs-community-install-docker-arm64.aspx
