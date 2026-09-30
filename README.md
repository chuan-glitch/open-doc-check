# open-doc-check

轻量 Markdown 文档检查工具：找到失效链接、缺失图片和错误的本地路径，输出易读的中文报告。

面向 README、项目文档和资源列表维护者。无需 API 密钥，无需登录。使用 Node.js 22 或以上。

## 快速开始

下载源码后，在项目目录执行：

```sh
npm ci
node bin/open-doc-check.js ./README.md
node bin/open-doc-check.js /path/to/your/repository --offline
node bin/open-doc-check.js /path/to/your/repository --format html --output reports/doc-check.html
```

Windows 示例：

```powershell
node bin/open-doc-check.js "C:\Users\you\Documents\my-project" --offline
```

需要全局命令时，在源码目录执行 `npm install -g .`，之后使用 `open-doc-check <目录>`。
本项目尚未发布到 npm，请不要直接运行 `npx open-doc-check`，以免获取到同名第三方包。

## 第一版支持

- 扫描 `.md` 和 `.markdown` 文件，忽略代码块和行内代码。
- 解析 Markdown 普通链接、图片、已定义的引用链接及 `<https://example.com>` 自动链接。
- 检查本地文件和目录，包括中文路径、空格和 URL 编码。
- `/` 开头的本地路径相对于扫描根目录；可用 `--root` 指定。
- 网页链接并发检查、重定向、同一 URL 去重；HEAD 出错后尝试 GET。
- 区分失效、待确认和跳过，支持 text、JSON、Markdown、HTML 报告。
- HTML 报告支持搜索，无需联网打开。

## 状态与退出码

| 状态 | 含义 |
| --- | --- |
| 正常 | 本地路径存在，或 HTTP 返回 2xx / 3xx |
| 失效 | 本地路径不存在，或网页返回 404 / 410 |
| 待确认 | 超时、网络错误、登录限制、限流或其他异常响应 |
| 跳过 | 离线模式中的网页链接、锚点、非 HTTP(S) 协议或忽略项 |

退出码 `0`：无失效链接；`1`：存在失效链接；`2`：参数或运行错误。
`--strict` 会让“待确认”也触发退出码 `1`。

## 参数

```text
--offline              不发送网络请求
--format text|json|markdown|html
--output <文件>        保存报告
--root <目录>          指定根路径
--timeout <毫秒>       默认 10000；HEAD 与 GET 共用这段超时
--concurrency <数量>   默认 8，范围 1–64
--exclude <目录名>     按目录名跳过，可重复
--ignore <链接前缀>    按链接前缀跳过，可重复
--strict               将待确认结果视为检查失败
```

默认跳过 `.git`、`node_modules`、`vendor`、`dist`、`build`、`coverage`、`reports`。
不跟随扫描目录里的符号链接。网络模式会请求文档中的 HTTP(S) 地址；检查不可信文档时可先用离线模式。

## GitHub Actions

本项目的 [CI](.github/workflows/ci.yml) 会运行测试和本地文档检查。
在其他仓库使用，复制 [示例工作流](examples/check-docs.yml) 到该仓库的 `.github/workflows/` 目录。
示例使用 `chuan-glitch/open-doc-check`，依赖维护者先创建 `v0.1.0` 标签，不依赖 npm 发布。

## 已知限制

- 不验证 `#标题锚点`；文件存在不意味着锚点存在。
- 不检查原始 HTML 的 `<a>` / `<img>` 标签或没有定义的 Markdown 引用链接。
- 行号一般指链接开始位置；跨行链接、跨行行内代码等复杂结构可能有偏差。
- 200 响应可能是登录页、验证码页或“软 404”，不能保证内容有效。
- 网络结果受检查机器的网络、站点反爬规则和时间影响；待确认结果需要人工查看。
- 第一版没有网页递归爬取、自动修复和链接历史缓存。

## 开发与贡献

```sh
npm ci
npm test
npm run check
```

提交问题请提供最小 Markdown 示例、Node.js 版本、操作系统和预期结果。
贡献前请阅读 [贡献指南](CONTRIBUTING.md)。发现安全问题请参阅 [安全说明](SECURITY.md)。

## 设计参考与许可

本项目受 [lychee](https://github.com/lycheeverse/lychee) 的链接检查用途启发，采用独立的 JavaScript 实现。
Markdown 解析由 markdown-it 完成。本项目使用 [MIT 许可证](LICENSE)。
