# 🦞 Moltbot — 个人 AI 助手

<p align="center">
<img src="[https://raw.githubusercontent.com/moltbot/moltbot/main/docs/whatsapp-clawd.jpg](https://raw.githubusercontent.com/moltbot/moltbot/main/docs/whatsapp-clawd.jpg)" alt="Clawdbot" width="400">
</p>

<p align="center">
<strong>脱壳进化！脱壳进化！</strong>
</p>

<p align="center">
<a href="[https://github.com/moltbot/moltbot/actions/workflows/ci.yml?branch=main](https://github.com/moltbot/moltbot/actions/workflows/ci.yml?branch=main)"><img src="[https://img.shields.io/github/actions/workflow/status/moltbot/moltbot/ci.yml?branch=main&style=for-the-badge](https://img.shields.io/github/actions/workflow/status/moltbot/moltbot/ci.yml?branch=main&style=for-the-badge)" alt="CI status"></a>
<a href="[https://github.com/moltbot/moltbot/releases](https://github.com/moltbot/moltbot/releases)"><img src="[https://img.shields.io/github/v/release/moltbot/moltbot?include_prereleases&style=for-the-badge](https://img.shields.io/github/v/release/moltbot/moltbot?include_prereleases&style=for-the-badge)" alt="GitHub release"></a>
<a href="[https://deepwiki.com/moltbot/moltbot](https://deepwiki.com/moltbot/moltbot)"><img src="[https://img.shields.io/badge/DeepWiki-moltbot-111111?style=for-the-badge](https://img.shields.io/badge/DeepWiki-moltbot-111111?style=for-the-badge)" alt="DeepWiki"></a>
<a href="[https://discord.gg/clawd](https://discord.gg/clawd)"><img src="[https://img.shields.io/discord/1456350064065904867?label=Discord&logo=discord&logoColor=white&color=5865F2&style=for-the-badge](https://img.shields.io/discord/1456350064065904867?label=Discord&logo=discord&logoColor=white&color=5865F2&style=for-the-badge)" alt="Discord"></a>
<a href="LICENSE"><img src="[https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)" alt="MIT License"></a>
</p>

**Moltbot** 是一款运行在你自有设备上的 *个人 AI 助手*。
它可以在你已有的社交频道中回复你（WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, Microsoft Teams, WebChat），并支持通过 BlueBubbles, Matrix, Zalo, 和 Zalo Personal 等扩展渠道。它可以在 macOS/iOS/Android 上进行语音对话，并能渲染一个由你控制的实时画布（Canvas）。网关（Gateway）仅仅是控制平面 —— 助手本身才是核心产品。

如果你想要一个私密的、单用户使用的、感觉像是在本地运行且响应极快、永远在线的助手，那么这就是你的选择。

[官方网站](https://molt.bot) · [文档](https://docs.molt.bot) · [入门指南](https://docs.molt.bot/start/getting-started) · [更新说明](https://docs.molt.bot/install/updating) · [案例展示](https://docs.molt.bot/start/showcase) · [常见问题](https://docs.molt.bot/start/faq) · [配置向导](https://docs.molt.bot/start/wizard) · [Nix](https://github.com/moltbot/nix-clawdbot) · [Docker](https://docs.molt.bot/install/docker) · [Discord](https://discord.gg/clawd)

推荐安装方式：运行初始化向导 (`moltbot onboard`)。它会引导你设置网关、工作区、频道和技能。CLI 向导是官方推荐的路径，支持 **macOS, Linux, 和 Windows (通过 WSL2; 强烈推荐)**。
支持使用 npm, pnpm, 或 bun。
新用户安装？从这里开始：[入门指南](https://docs.molt.bot/start/getting-started)

**订阅 (OAuth):**

* **[Anthropic](https://www.anthropic.com/)** (Claude Pro/Max)
* **[OpenAI](https://openai.com/)** (ChatGPT/Codex)

模型说明：虽然支持任何模型，但我强烈建议使用 **Anthropic Pro/Max (100/200) + Opus 4.5**，因为它具备更强的长文本处理能力和更好的提示词注入防御。详见 [入门向导](https://docs.molt.bot/start/onboarding)。

## 模型 (选择 + 认证)

* 模型配置 + 命令行：[模型概念](https://docs.molt.bot/concepts/models)
* 认证配置文件轮换 (OAuth vs API keys) + 备选方案：[模型故障转移](https://docs.molt.bot/concepts/model-failover)

## 安装 (推荐)

运行环境：**Node ≥22**。

```bash
npm install -g moltbot@latest
# 或: pnpm add -g moltbot@latest

moltbot onboard --install-daemon

```

向导会安装网关守护进程（launchd/systemd 用户服务）以保持其后台运行。
历史备注：`clawdbot` 命令作为兼容垫片（shim）依然可用。

## 快速开始 (简易版)

运行环境：**Node ≥22**。

完整的初学者指南（认证、配对、频道）：[入门指南](https://docs.molt.bot/start/getting-started)

```bash
moltbot onboard --install-daemon

moltbot gateway --port 18789 --verbose

# 发送一条消息
moltbot message send --to +1234567890 --message "来自 Moltbot 的问候"

# 与助手对话（可选将结果发送回任何已连接的频道：WhatsApp/Telegram/Slack/Discord/Google Chat/Signal/iMessage/BlueBubbles/Microsoft Teams/Matrix/Zalo/Zalo Personal/WebChat）
moltbot agent --message "发送清单" --thinking high

```

升级中？[更新指南](https://docs.molt.bot/install/updating)（并运行 `moltbot doctor`）。

## 开发频道

* **stable (稳定版)**：带有标签的发布版本 (`vYYYY.M.D` 或 `vYYYY.M.D-<patch>`)，npm 标记为 `latest`。
* **beta (测试版)**：预发布标签 (`vYYYY.M.D-beta.N`)，npm 标记为 `beta`（可能缺少 macOS 应用）。
* **dev (开发版)**：`main` 分支的最前沿，npm 标记为 `dev`。

切换频道 (git + npm)：`moltbot update --channel stable|beta|dev`。
详情见：[开发频道说明](https://docs.molt.bot/install/development-channels)。

## 源码安装 (开发用)

从源码构建推荐使用 `pnpm`。直接运行 TypeScript 时 Bun 是可选的。

```bash
git clone https://github.com/moltbot/moltbot.git
cd moltbot

pnpm install
pnpm ui:build # 首次运行时自动安装 UI 依赖
pnpm build

pnpm moltbot onboard --install-daemon

# 开发循环（修改 TS 后自动重载）
pnpm gateway:watch

```

注意：`pnpm moltbot ...` 直接通过 `tsx` 运行 TypeScript。`pnpm build` 会生成 `dist/` 目录，用于通过 Node 或打包后的 `moltbot` 二进制文件运行。

## 安全默认设置 (私聊访问)

Moltbot 连接到真实的通讯平台。请将所有接收到的私聊消息视为 **不可信输入**。

完整的安全指南：[安全](https://docs.molt.bot/gateway/security)

在 Telegram/WhatsApp/Signal/iMessage/Microsoft Teams/Discord/Google Chat/Slack 上的默认行为：

* **私聊配对** (`dmPolicy="pairing"`)：未知的发送者会收到一个简短的配对码，助手不会处理他们的消息。
* 批准方式：执行 `moltbot pairing approve <channel> <code>`（之后该发送者将被添加到本地允许列表中）。
* 公开接收私聊：需要明确开启，设置 `dmPolicy="open"` 并在允许列表 (`allowFrom`) 中包含 `"*"`。

运行 `moltbot doctor` 以发现风险项或配置错误的私聊策略。

## 亮点功能

* **[本地优先网关](https://docs.molt.bot/gateway)** — 会话、频道、工具和事件的统一控制平面。
* **[多频道收件箱](https://docs.molt.bot/channels)** — 支持 WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, BlueBubbles, Microsoft Teams, Matrix, Zalo, Zalo Personal, WebChat, macOS, iOS/Android。
* **[多代理路由](https://docs.molt.bot/gateway/configuration)** — 将接收的频道/账户路由到独立的代理（工作区 + 独立会话）。
* **[语音唤醒](https://docs.molt.bot/nodes/voicewake) + [通话模式**](https://docs.molt.bot/nodes/talk) — 适用于 macOS/iOS/Android 的全天候语音，配合 ElevenLabs。
* **[实时画布 (Live Canvas)](https://docs.molt.bot/platforms/mac/canvas)** — 代理驱动的可视化工作区，集成 [A2UI](https://docs.molt.bot/platforms/mac/canvas#canvas-a2ui)。
* **[一流的工具链](https://docs.molt.bot/tools)** — 浏览器、画布、节点、定时任务 (Cron)、会话，以及 Discord/Slack 动作。
* **[伴侣应用](https://docs.molt.bot/platforms/macos)** — macOS 菜单栏应用 + iOS/Android [节点应用](https://docs.molt.bot/nodes)。
* **[新手引导](https://docs.molt.bot/start/wizard) + [技能系统**](https://docs.molt.bot/tools/skills) — 向导驱动的设置，包含内置、托管和工作区技能。

## Star 增长历史

## 目前已构建的所有功能

### 核心平台

* [网关 WS 控制平面](https://docs.molt.bot/gateway)：包含会话、在线状态、配置、定时任务、Webhooks、[控制 UI](https://docs.molt.bot/web) 以及 [画布主机](https://docs.molt.bot/platforms/mac/canvas#canvas-a2ui)。
* [命令行界面](https://docs.molt.bot/tools/agent-send)：网关控制、代理对话、发送消息、[向导](https://docs.molt.bot/start/wizard) 和 [医生自检](https://docs.molt.bot/gateway/doctor)。
* [Pi 代理运行时](https://docs.molt.bot/concepts/agent)：支持 RPC 模式，具备工具流式传输和块流传输。
* [会话模型](https://docs.molt.bot/concepts/session)：支持 `main` 直接聊天、群组隔离、激活模式、队列模式、自动回复。群组规则参见：[群组](https://docs.molt.bot/concepts/groups)。
* [媒体流水线](https://docs.molt.bot/nodes/images)：处理图片/音频/视频，支持转录钩子、大小限制、临时文件生命周期管理。音频详情：[音频](https://docs.molt.bot/nodes/audio)。

### 频道支持

* [频道](https://docs.molt.bot/channels)：[WhatsApp](https://docs.molt.bot/channels/whatsapp) (Baileys), [Telegram](https://docs.molt.bot/channels/telegram) (grammY), [Slack](https://docs.molt.bot/channels/slack) (Bolt), [Discord](https://docs.molt.bot/channels/discord) (discord.js), [Google Chat](https://docs.molt.bot/channels/googlechat) (Chat API), [Signal](https://docs.molt.bot/channels/signal) (signal-cli), [iMessage](https://docs.molt.bot/channels/imessage) (imsg), [BlueBubbles](https://docs.molt.bot/channels/bluebubbles), [Microsoft Teams](https://docs.molt.bot/channels/msteams), [Matrix](https://docs.molt.bot/channels/matrix), [Zalo](https://docs.molt.bot/channels/zalo), [Zalo Personal](https://docs.molt.bot/channels/zalouser), [WebChat](https://docs.molt.bot/web/webchat)。
* [群组路由](https://docs.molt.bot/concepts/group-messages)：提及触发、回复标签、分频道分块和路由。频道规则见：[频道](https://docs.molt.bot/channels)。

### 应用 + 节点

* [macOS 应用](https://docs.molt.bot/platforms/macos)：菜单栏控制平面、[语音唤醒](https://docs.molt.bot/nodes/voicewake)/PTT、[通话模式](https://docs.molt.bot/nodes/talk) 悬浮层、[WebChat](https://docs.molt.bot/web/webchat)、调试工具、[远程网关](https://docs.molt.bot/gateway/remote) 控制。
* [iOS 节点](https://docs.molt.bot/platforms/ios)：支持 [画布](https://docs.molt.bot/platforms/mac/canvas)、[语音唤醒](https://docs.molt.bot/nodes/voicewake)、[通话模式](https://docs.molt.bot/nodes/talk)、摄像头、屏幕录制、Bonjour 自动配对。
* [Android 节点](https://docs.molt.bot/platforms/android)：[画布](https://docs.molt.bot/platforms/mac/canvas)、[通话模式](https://docs.molt.bot/nodes/talk)、摄像头、屏幕录制、可选的短信支持。
* [macOS 节点模式](https://docs.molt.bot/nodes)：系统命令运行/通知 + 画布/摄像头开放。

### 工具 + 自动化

* [浏览器控制](https://docs.molt.bot/tools/browser)：专用 moltbot Chrome/Chromium，支持快照、操作、上传、配置文件管理。
* [画布 (Canvas)](https://docs.molt.bot/platforms/mac/canvas)：[A2UI](https://docs.molt.bot/platforms/mac/canvas#canvas-a2ui) 推送/重置、代码执行、快照。
* [节点工具](https://docs.molt.bot/nodes)：摄像头抓拍/剪辑、屏幕记录、[位置获取](https://docs.molt.bot/nodes/location-command)、通知。
* [Cron + 唤醒](https://docs.molt.bot/automation/cron-jobs)；[Webhooks](https://docs.molt.bot/automation/webhook)；[Gmail 消息推送](https://docs.molt.bot/automation/gmail-pubsub)。
* [技能平台](https://docs.molt.bot/tools/skills)：内置、托管和工作区技能，具备安装门禁和 UI。

### 运行时 + 安全

* [频道路由](https://docs.molt.bot/concepts/channel-routing)、[重试策略](https://docs.molt.bot/concepts/retry) 以及 [流式分块](https://docs.molt.bot/concepts/streaming)。
* [在线状态](https://docs.molt.bot/concepts/presence)、[输入状态指示器](https://docs.molt.bot/concepts/typing-indicators) 和 [使用情况跟踪](https://docs.molt.bot/concepts/usage-tracking)。
* [模型管理](https://docs.molt.bot/concepts/models)、[模型故障转移](https://docs.molt.bot/concepts/model-failover) 和 [会话清理](https://docs.molt.bot/concepts/session-pruning)。
* [安全指南](https://docs.molt.bot/gateway/security) 和 [故障排除](https://docs.molt.bot/channels/troubleshooting)。

### 运维 + 打包

* [控制 UI](https://docs.molt.bot/web) + [WebChat](https://docs.molt.bot/web/webchat) 直接由网关提供服务。
* [Tailscale Serve/Funnel](https://docs.molt.bot/gateway/tailscale) 或 [SSH 隧道](https://docs.molt.bot/gateway/remote)，支持 Token/密码认证。
* 用于声明式配置的 [Nix 模式](https://docs.molt.bot/install/nix)；基于 [Docker](https://docs.molt.bot/install/docker) 的安装。
* [医生 (Doctor)](https://docs.molt.bot/gateway/doctor) 迁移工具，[日志管理](https://docs.molt.bot/logging)。

## 工作原理 (简述)

```
WhatsApp / Telegram / Slack / Discord / Google Chat / Signal / iMessage / BlueBubbles / Microsoft Teams / Matrix / Zalo / Zalo Personal / WebChat
               │
               ▼
┌───────────────────────────────┐
│            网关 (Gateway)      │
│           (控制平面)           │
│      ws://127.0.0.1:18789     │
└──────────────┬────────────────┘
               │
               ├─ Pi 代理 (RPC)
               ├─ 命令行工具 (moltbot …)
               ├─ WebChat 界面
               ├─ macOS 应用
               └─ iOS / Android 节点

```

## 核心子系统

* **[网关 WebSocket 网络](https://docs.molt.bot/concepts/architecture)** — 用于客户端、工具和事件的统一 WS 控制平面（及运维：[网关运行手册](https://docs.molt.bot/gateway)）。
* **[Tailscale 暴露](https://docs.molt.bot/gateway/tailscale)** — 为网关仪表盘 + WS 提供内网穿透（远程访问：[远程连接](https://docs.molt.bot/gateway/remote)）。
* **[浏览器控制](https://docs.molt.bot/tools/browser)** — 由 moltbot 管理的 Chrome/Chromium，具备 CDP 控制能力。
* **[画布 + A2UI](https://docs.molt.bot/platforms/mac/canvas)** — 代理驱动的可视化工作区。
* **[语音唤醒](https://docs.molt.bot/nodes/voicewake) + [通话模式**](https://docs.molt.bot/nodes/talk) — 始终在线的语音和连续对话支持。
* **[节点 (Nodes)](https://docs.molt.bot/nodes)** — 提供画布、摄像头快拍、屏幕记录、位置获取、通知，以及 macOS 专有的系统命令执行。

## Tailscale 访问 (网关仪表盘)

Moltbot 可以自动配置 Tailscale **Serve**（仅限 tailnet）或 **Funnel**（公开），而网关保持绑定在本地回环地址。配置 `gateway.tailscale.mode`：

* `off`: 不开启 Tailscale 自动化（默认）。
* `serve`: 通过 `tailscale serve` 仅限 tailnet 内部的 HTTPS 访问。
* `funnel`: 通过 `tailscale funnel` 进行公开 HTTPS 访问（需要密码认证）。

注意：

* 当启用 Serve/Funnel 时，`gateway.bind` 必须保持为 `loopback`。
* Serve 可以通过设置认证模式为 `password` 来强制要求密码。
* Funnel 除非设置了密码认证，否则拒绝启动。

详情见：[Tailscale 指南](https://docs.molt.bot/gateway/tailscale) · [Web 界面](https://docs.molt.bot/web)

## 远程网关 (推荐使用 Linux)

在小型 Linux 实例上运行网关是非常理想的选择。客户端（macOS 应用、CLI、WebChat）可以通过 **Tailscale** 或 **SSH 隧道**连接，你仍然可以在需要时配对设备节点（macOS/iOS/Android）来执行设备本地操作。

* **网关主机** 默认运行执行工具和频道连接。
* **设备节点** 通过 `node.invoke` 运行设备本地操作（系统命令、摄像头、屏幕记录、通知）。
简而言之：复杂执行发生在网关所在地；设备操作发生在设备所在地。

详情见：[远程访问](https://docs.molt.bot/gateway/remote) · [节点](https://docs.molt.bot/nodes) · [安全](https://docs.molt.bot/gateway/security)

## 通过网关协议的 macOS 权限

macOS 应用可以以 **节点模式** 运行，并通过网关 WebSocket 宣告其能力和权限映射。客户端可以执行本地操作：

* `system.run` 运行本地命令；如果需要屏幕录制权限，设置 `needsScreenRecording: true`。
* `system.notify` 发送通知。
* `canvas.*`, `camera.*`, `screen.record` 等通过 `node.invoke` 路由，并遵循 TCC 权限状态。

提权的 bash（主机权限）与 macOS TCC 是分开的：

* 使用 `/elevated on|off` 在启用且允许的情况下切换每个会话的提权访问。

详情见：[节点](https://docs.molt.bot/nodes) · [macOS 应用](https://docs.molt.bot/platforms/macos) · [网关协议](https://docs.molt.bot/concepts/architecture)

## 代理对代理 (sessions_* 工具)

* 用于在不同会话之间协调工作，无需手动切换聊天界面。
* `sessions_list` — 发现活动会话及其元数据。
* `sessions_history` — 获取会话的历史记录。
* `sessions_send` — 向另一个会话发送消息。

详情见：[会话工具](https://docs.molt.bot/concepts/session-tool)

## 技能注册表 (ClawdHub)

ClawdHub 是一个极简的技能注册表。启用后，代理可以自动搜索并根据需要引入新技能。

[ClawdHub 官网](https://ClawdHub.com)

## 聊天命令

在 WhatsApp/Telegram/Slack 等频道中发送（群组命令仅限所有者）：

* `/status` — 会话状态简报（模型、Token、成本）
* `/new` 或 `/reset` — 重置会话
* `/compact` — 压缩会话上下文（生成摘要）
* `/think <level>` — 设置思考深度：off|minimal|low|medium|high|xhigh
* `/verbose on|off` — 详细模式开关
* `/usage off|tokens|full` — 响应后的用量页脚
* `/restart` — 重启网关
* `/activation mention|always` — 群组激活切换

## 可选应用

网关本身即可提供极佳体验。所有应用均为可选，用于增加额外功能。

### macOS 应用 (Moltbot.app) (可选)

* 菜单栏控制网关和健康状态。
* 语音唤醒 + PTT 悬浮层。
* 远程 SSH 控制网关。

### iOS 节点 (可选)

* 充当画布表面，支持语音触发。
* 通过 `moltbot nodes …` 控制。

运行手册：[iOS 连接](https://docs.molt.bot/platforms/ios)。

### Android 节点 (可选)

* 提供画布、摄像头和屏幕捕获命令。
* 运行手册：[Android 连接](https://docs.molt.bot/platforms/android)。

## 代理工作区与技能

* 工作区根目录：`~/clawd`。
* 注入的提示词文件：`AGENTS.md`, `SOUL.md`, `TOOLS.md`。
* 技能路径：`~/clawd/skills/<skill>/SKILL.md`。

## 配置

最简 `~/.clawdbot/moltbot.json` 示例：

```json5
{
  "agent": {
    "model": "anthropic/claude-opus-4-5"
  }
}

```

[完整配置参考（所有键名和示例）。](https://docs.molt.bot/gateway/configuration)

## 安全模型 (重要)

* **默认设置**：工具在 **main** 会话的主机上运行，助手拥有完整访问权限。
* **群组/频道安全**：将非主会话设置为在 Docker 沙盒中运行，以隔离执行环境。

详情见：[安全指南](https://docs.molt.bot/gateway/security) · [Docker 与沙箱](https://docs.molt.bot/install/docker)

---

## 运维与故障排除

* [健康检查](https://docs.molt.bot/gateway/health)
* [日志管理](https://docs.molt.bot/logging)
* [故障排除指南](https://docs.molt.bot/channels/troubleshooting)

## Molty

Moltbot 是为 **Molty** 构建的，它是一只太空龙虾 AI 助手。 🦞
由 Peter Steinberger 及社区共同开发。

* [官网 clawd.me](https://clawd.me)
* [推特 @moltbot](https://x.com/moltbot)

## 社区

查看 [CONTRIBUTING.md](https://www.google.com/search?q=CONTRIBUTING.md) 获取贡献指南。欢迎提交各种 PR！🤖

---

*(贡献者列表略)*
