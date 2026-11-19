# Antigravity 插件（agy-acp）

把本机已安装、已用 Google 账号登录的 Google Antigravity 命令行（`agy`）作为 Cindy 的任务执行引擎。
插件通过清单的 `harnesses` 字段声明一个 ACP 引擎，Cindy 在模型选择器里显示「Antigravity」，
选中后每个任务启动一个 `agy acp` 进程，用 [Agent Client Protocol](https://agentclientprotocol.com) v1
与它对话。

插件负责「找到 agy、报告能不能用、列出 agy 提供的模型、思考深度与工作模式、在设置页登录 / 退出、
把字节原样转发」。它不安装、不分发 agy，也不接触任何账号凭证：登录由 agy 自己管理。

## 安装与更新

1. 从本仓库的 [Releases](https://github.com/MagicLizi/cindy-antigravity-plugin/releases) 下载最新的
   `agy-acp-<版本>.cindy`，在 Cindy 的插件页导入。安装确认会列出 Node 工作进程（本机权限）和
   「提供执行引擎 Antigravity」两项权限。
2. 之后在插件设置页的宿主区域即可检查并安装新版本：清单里的 `githubRelease` 指向本仓库，
   Cindy 读取 GitHub Release、校验附件摘要后走插件更新确认，启用状态、配置与数据保持不变。
3. 需要支持插件执行引擎的 Cindy，见下方「前提条件」。

## 前提条件

1. 支持插件执行引擎（清单 `harnesses` 字段与 `PUT /harnesses`，含模型的思考深度与 Agent 工作模式）的 Cindy。
   该能力仍在开发中；正式版发布后请把 `ghost.json` 的 `minCindyVersion` 改成第一个包含它的版本号。
2. 安装 Antigravity 命令行（[antigravity.google](https://antigravity.google)）。Windows 上默认装在
   `%LOCALAPPDATA%\agy\bin\agy.exe`，不需要加进 PATH。登录可以在插件设置页完成（见下），也可以在终端运行 `agy`。

## 本地安装（开发）

在 Cindy 的任务里让 Agent 调用 `ghost_forge_pack({ dir: "<本目录绝对路径>" })` 打包，再明确让 Agent 调用
`ghost_forge_install({ dir: "<本目录绝对路径>" })`，或在插件页导入生成的 `agy-acp-<版本>.cindy`。安装确认
会列出 Node 工作进程（本机权限）和「提供执行引擎 Antigravity」两项权限。

## Cindy 启动 agy 的方式

```
agy --settings {"useG1Credits":false} acp --disable-telemetry
```

- `--settings` 只对这次会话生效，不改你的 agy 配置：**订阅额度用完后不会使用付费的 Google AI 积分**，
  任务会报错停下。
- `--disable-telemetry`：Cindy 启动的会话不向 Google 发送遥测。
- 参数都是插件里的常量，不拼接任何用户输入。Windows 上若 agy 是 `.cmd` 包装，常量按 C 运行库规则加引号
  经 `cmd.exe` 传入（常量里没有 cmd.exe 会展开的字符，加载时校验）。

## 模型、思考深度与工作模式

插件在自己的一个探测会话里（不发消息，不会调用模型）读取 agy 的 ACP 配置项，随可用状态发布给 Cindy：

- 模型：`model` 配置项（例如 Gemini 4 Neon / Argon / Hydrogen、Gemini 3.8 Flash、Claude Opus / Sonnet 5.5）。
- 思考深度：逐个模型读取 `thought_level`，只上报 Cindy 认得的档位（agy 1.5.12 为 low / medium / high / xhigh，
  不同模型不同，Orchestrator 与 GPT-OSS 不可调）。
- 工作模式：`mode` 配置项（default / accept-edits / auto / plan）按 Cindy 权限档 id 上报。输入框的权限菜单
  列出这些模式，末尾是 Cindy 的「全部允许」；切换时 Cindy 让 agy 切到对应模式，agy 请求权限时仍由你确认。

打开模型选择器时 Cindy 会请插件刷新（同一插件 10 分钟内最多一次）。agy 没有登录时，引擎显示为不可用，
提示到插件设置页登录。

## 账号：登录与退出

插件设置页的「账号」区域经 ACP 操作 agy 自己的登录（agy 1.5.12 实测）：

- **状态**：打开设置页或点「重新检测」时检查 agy 是否已登录，并显示 agy 报告的订阅档位（例如 Google AI Pro）。
  拿不到登录邮箱：ACP 不提供，插件也不读 agy 的凭证或日志。
- **用 Google 登录**：发 `authenticate`（`oauth-personal`），agy 自己打开浏览器走 Google 登录，完成后返回；
  最多等 5 分钟，等待期间可以「取消登录」（结束这次的 agy 进程）。登录成功后立即恢复引擎并重新读取模型。
- **退出登录**：先在页面上确认，再发 `logout`。agy 的 `logout` 不校验参数、一调用就登出，所以插件只在确认后发送。
  退出后 Cindy 里的 Antigravity 和终端里的 agy 都需要重新登录。

登录信息由 agy 保存在它自己的存储里（Windows 上是系统凭据管理器），插件与 Cindy 都不保存。

| 文件 | 作用 |
| --- | --- |
| `ghost.json` | 清单：`node` 工作进程、额外入口 `agy-acp.js`、`harnesses` 声明、设置页、常驻逻辑页 |
| `main.js` | 逻辑页：检测 agy、读取模型与模式，`PUT /harnesses` 发布可用状态 |
| `worker.js` | Node 工作进程（json-rpc-stdio），提供 `detect`、`listModels`、`account`、`login`、`cancelLogin`、`logout` |
| `resolve-agy.js` | 查找与启动 agy 的共用代码（worker 与 ACP 入口用同一套查找顺序与参数） |
| `agy-client.js` | 插件自用的短时 ACP 连接（启动 agy、`initialize`、调用、停止） |
| `agy-models.js` | 经 ACP 读取模型、每个模型的思考深度、agy 的工作模式与订阅档位 |
| `agy-account.js` | 经 ACP 查询登录状态、用 Google 登录、取消登录、退出登录 |
| `agy-acp.js` | ACP 引擎入口：启动 `agy acp`，双向原样转发 stdio |
| `settings.html` / `settings.js` | 设置页：检测结果、版本、位置、安装提示、账号（登录 / 退出）与「重新检测」 |
| `locales/` | 清单名称与说明的英文、简体中文文案 |
| `test/bridge.test.mjs` | 用假 agy 验证检测、转发、参数与发布（`node --test test/bridge.test.mjs`） |

## 检测规则

查找顺序（取第一个找到的）：`PATH` 中的 `agy` → Windows 的 `%LOCALAPPDATA%\agy\bin`（agy 1.5.12 实测位置）→
`~/.npmrc` 的全局目录与常见全局安装位置（macOS / Linux 含 `~/.agy/bin`、`~/.local/bin`、`/usr/local/bin`、
`/opt/homebrew/bin`）。找到后运行 `agy --version`（10 秒超时）：能运行发布「可用」及版本，找不到发布
`not-installed`，运行失败发布 `not-runnable`；读取模型时 agy 要求登录则发布 `not-signed-in`。发布给 Cindy 的
只有状态、原因、提示、版本、模型与模式，不含路径或命令。

## 发布新版本

1. 修改 `ghost.json` 的 `version`（例如 `0.1.1`）。
2. 在 Cindy 里让 Agent 调用 `ghost_forge_pack` 打包，得到 `agy-acp-<版本>.cindy`。
3. 创建 GitHub Release，标签必须是 `v<版本>`（与清单版本一致），附件为上一步的 `.cindy`：

   ```sh
   gh release create v0.1.1 agy-acp-0.1.1.cindy --title "v0.1.1" --notes "…"
   ```

   草稿不会被检测到；预发布会在设置页标注。

## 测试

不需要真的安装 agy：

```sh
node --test test/bridge.test.mjs
```

## 已知限制

- macOS / Linux 上 agy 的默认安装位置未实机验证；不在上述位置时，请把 `agy` 所在目录加进 PATH。
- 未登录在读取模型（Cindy 启动、打开模型选择器）或打开设置页时发现；在终端里登出后，Cindy 要到下次检查才知道。
- 只提供 Google 个人账号登录；agy 公布的 Gemini Enterprise、Gemini API Key（按量计费）、Agent Platform 登录方式没有接入。
- agy 在任务中自己切换模式时（例如规划结束后），Cindy 的权限菜单不会跟着变。
- Cindy 给插件 Node 进程的环境变量是精简过的，只写在 shell 配置里的代理等变量不会传给 agy。
- 插件图标取自 Antigravity 官网（antigravity.google/assets/image/antigravity-logo.png），标志归 Google 所有。
