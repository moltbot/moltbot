import { TranslationMap } from "../translations.js";

export const zh_CN: TranslationMap = {
  "Security warning — please read.": "安全警告 — 请务必阅读。",
  "OpenClaw is a hobby project and still in beta. Expect sharp edges.":
    "OpenClaw 是一个个人兴趣项目，仍处于测试阶段。可能存在不完善之处，请谨慎使用。",
  "This bot can read files and run actions if tools are enabled.":
    "如果启用工具，此机器人可以读取文件并执行操作。",
  "A bad prompt can trick it into doing unsafe things.":
    "恶意提示可能会诱导机器人执行不安全的操作。",
  "If you\u2019re not comfortable with basic security and access control, don\u2019t run OpenClaw.":
    "如果您不熟悉基本的安全和访问控制，请不要运行 OpenClaw。",
  "Ask someone experienced to help before enabling tools or exposing it to the internet.":
    "在启用工具或将其暴露到互联网之前，请咨询有经验的人士。",
  "Recommended baseline:": "推荐的基准配置：",
  "- Pairing/allowlists + mention gating.": "- 配对/白名单 + 提及门控。",
  "- Sandbox + least-privilege tools.": "- 沙箱 + 最小权限工具。",
  "- Keep secrets out of the agent\u2019s reachable filesystem.":
    "- 严禁将机密信息放在代理可访问的文件系统内。",
  "- Use the strongest available model for any bot with tools or untrusted inboxes.":
    "- 对于任何带有工具或处理不受信任信息的机器人，请使用最强模型。",
  "Run regularly:": "定期运行：",
  "openclaw security audit --deep": "openclaw security audit --deep",
  "openclaw security audit --fix": "openclaw security audit --fix",
  "Must read:": "必读说明：",
  "I understand this is powerful and inherently risky. Continue?":
    "我理解此功能强大且具有潜在风险。是否继续？",
  "Onboarding mode": "配置引导模式",
  QuickStart: "快速启动",
  Manual: "手动",
  "Existing config detected": "检测到现有配置",
  "Workspace:": "工作区：",
  "Model:": "模型：",
  "gateway.mode:": "Gateway模式：",
  "gateway.port:": "Gateway端口：",
  "gateway.bind:": "Gateway绑定：",
  "Config handling": "配置处理",
  "Use existing values": "使用当前配置",
  "Update values": "设置更新配置",
  Reset: "重置",
  "Keeping your current gateway settings:": "保留当前Gateway设置：",
  "Gateway port:": "Gateway端口：",
  "Gateway bind:": "Gateway绑定：",
  "Loopback (127.0.0.1)": "本地回环 (127.0.0.1)",
  "Gateway auth:": "Gateway认证：",
  Password: "密码",
  "Tailscale exposure:": "Tailscale 暴露：",
  Off: "关闭",
  "Direct to chat channels.": "直接连接聊天通道。",
  "Model/authentication provider": "模型/认证提供商",
  Qwen: "通义千问",
  "Qwen auth method": "通义千问认证方式",
  "Qwen OAuth": "通义千问 OAuth",
  "Launching Qwen OAuth…": "正在启动通义千问 OAuth…",
  "Open `https://chat.qwen.ai/authorize?user_code=2SSIW_TR&client=qwen-code` to approve access.":
    "请访问 `https://chat.qwen.ai/authorize?user_code=2SSIW_TR&client=qwen-code` 以批准访问。",
  "Enter code 2SSIW_TR if prompted.": "如果系统提示，请输入代码：2SSIW_TR。",
  "Qwen OAuth complete": "通义千问 OAuth 授权完成",
  "Model configured": "模型配置成功",
  "Default model set to qwen-portal/coder-model": "默认模型已设置为 qwen-portal/coder-model",
  "Provider notes": "提供商说明",
  "Qwen OAuth tokens auto-refresh. If refresh fails or access is revoked, re-run login.":
    "通义千问 OAuth 令牌将自动刷新。如果刷新失败或访问权限被撤销，请重新运行登录。",
  "Base URL defaults to `https://portal.qwen.ai/v1.` Override models.providers.qwen-portal.baseUrl if needed.":
    "Base URL 默认值为 `https://portal.qwen.ai/v1.`。如有需要，请覆盖 models.providers.qwen-portal.baseUrl。",
  "Default model": "默认模型",
  "Channel status": "通道状态",
  "iMessage: Configured": "iMessage：已配置",
  "imsg: Found (/usr/local/bin/imsg)": "imsg：已找到 (/usr/local/bin/imsg)",
  "Telegram: Not configured": "Telegram：未配置",
  "WhatsApp: Not configured": "WhatsApp：未配置",
  "Discord: Not configured": "Discord：未配置",
  "Google Chat: Not configured": "Google Chat：未配置",
  "Slack: Not configured": "Slack：未配置",
  "Signal: Not configured": "Signal：未配置",
  "Google Chat: Install plugin to enable": "Google Chat：请安装插件以启用",
  "Nostr: Install plugin to enable": "Nostr：请安装插件以启用",
  "Microsoft Teams: Install plugin to enable": "Microsoft Teams：请安装插件以启用",
  "Mattermost: Install plugin to enable": "Mattermost：请安装插件以启用",
  "Nextcloud Talk: Install plugin to enable": "Nextcloud Talk：请安装插件以启用",
  "Matrix: Install plugin to enable": "Matrix：请安装插件以启用",
  "BlueBubbles: Install plugin to enable": "BlueBubbles：请安装插件以启用",
  "LINE: Install plugin to enable": "LINE：请安装插件以启用",
  "Zalo: Install plugin to enable": "Zalo：请安装插件以启用",
  "Zalo Personal: Install plugin to enable": "Zalo Personal：请安装插件以启用",
  "Tlon: Install plugin to enable": "Tlon：请安装插件以启用",
  "How channels work": "通道工作原理",
  "DM safety: Defaults to pairing; unknown DMs get a pairing code.":
    "私信安全：默认为配对模式；未知私信会获得配对码。",
  "To approve: openclaw pairing approve <channel> <code>":
    "批准方式：执行 openclaw pairing approve <channel> <code>",
  'Public DMs require dmPolicy="open" + allowFrom=["*"].':
    '公开私信需要设置 dmPolicy="open" + allowFrom=["*"]。',
  'Multi-user DMs: Set session.dmScope="per-channel-peer" (or "per-account-channel-peer" for multi-account channels) to isolate sessions.':
    '多用户私信：设置 session.dmScope="per-channel-peer" 以隔离会话。',
  "Docs: start/pairing": "文档：start/pairing",
  "Telegram: Easiest to start — use @BotFather to register a bot and go.":
    "Telegram：最简单的开始方式 — 使用 @BotFather 注册机器人即可。",
  "WhatsApp: Uses your own number; recommend a separate phone + eSIM.":
    "WhatsApp：使用您自己的号码；建议准备单独的手机 + eSIM。",
  "Discord: Well-supported currently.": "Discord：目前支持良好。",
  "Google Chat: Google Workspace Chat app with HTTP webhook.":
    "Google Chat：带有 HTTP webhook 的 Google Workspace 聊天应用。",
  "Slack: Supported (Socket Mode).": "Slack：已支持 (Socket 模式)。",
  'Signal: signal-cli linked device; more setup needed (David Reagans: "Join Discord.").':
    "Signal：需通过 signal-cli 链接设备；需要更多设置（建议加入 Discord 咨询）。",
  "iMessage: This is still being worked on.": "iMessage：该功能仍在开发中。",
  "Nostr: Decentralized protocol; encrypted DMs via NIP-04.":
    "Nostr：去中心化协议；通过 NIP-04 加密私信。",
  "Microsoft Teams: Bot Framework; enterprise support.":
    "Microsoft Teams：Bot Framework 企业级支持。",
  "Mattermost: Self-hosted Slack-like chat; install plugin to enable.":
    "Mattermost：类 Slack 的自托管聊天；安装插件以启用。",
  "Nextcloud Talk: Self-hosted chat via Nextcloud Talk webhook bot.":
    "Nextcloud Talk：通过 Webhook 机器人的自托管聊天。",
  "Matrix: Open protocol; install plugin to enable.": "Matrix：开放协议；安装插件以启用。",
  "BlueBubbles: iMessage via BlueBubbles macOS app + REST API.":
    "BlueBubbles：通过 BlueBubbles macOS 应用和 REST API 使用 iMessage。",
  "LINE: LINE messaging API bot for Japan/Taiwan/Thailand markets.":
    "LINE：面向日本/台湾/泰国市场的消息 API 机器人。",
  "Zalo: Vietnam-focused messaging platform with Bot API.": "Zalo：专注于越南市场的消息平台。",
  "Zalo Personal: Zalo personal account via QR login.": "Zalo 个人版：通过二维码登录个人账户。",
  "Tlon: Decentralized messaging on Urbit; install plugin to enable.":
    "Tlon：Urbit 上的去中心化消息系统。",
  "Select channels (QuickStart)": "选择通道（快速启动）",
  "Skip for now": "暂时跳过",
  "Updated ~/.openclaw/openclaw.json": "已更新 ~/.openclaw/openclaw.json",
  "Workspace ok: ~/Documents/clawd": "工作区正常：~/Documents/clawd",
  "Sessions ok: ~/.openclaw/agents/main/sessions": "会话正常：~/.openclaw/agents/main/sessions",
  "Skills status": "skill状态",
  "Eligible: 6": "符合条件：6",
  "Missing requirements: 42": "缺失依赖：42",
  "Blocked by allowlist: 0": "被白名单阻止：0",
  "Configure skills now? (recommended)": "现在配置skill？（推荐）",
  Yes: "是",
  "Preferred node manager for skill installs": "skill安装的首选 Node 管理器",
  pnpm: "pnpm",
  "Install missing skill dependencies": "安装缺失的skill依赖",
  "🫐 blucli, 🧩 clawdhub, 📧 himalaya, 📊 model-usage, 🍌 nano-banana-pro, 📄 nano-pdf, 👀 peekaboo, 🎞️ video-frames":
    "🫐 blucli, 🧩 clawdhub, 📧 himalaya, 📊 model-usage, 🍌 nano-banana-pro, 📄 nano-pdf, 👀 peekaboo, 🎞️ video-frames",
  "Install failed:": "安装失败：",
  Hooks: "钩子 (Hooks)",
  "Hooks let you automate actions when agent commands are issued.":
    "Hooks 允许你在执行指令时自动触发特定操作。",
  "Example: When you issue /new, save session context to memory.":
    "示例：当执行 /new 命令时，自动将会话上下文保存到记忆库。",
  "Learn more: https://docs.openclaw.ai/hooks": "了解更多：https://docs.openclaw.ai/hooks",
  "Enable Hooks?": "是否启用 Hooks？",
  "Enable hooks?": "是否启用 hooks？",
  "Hooks configured": "Hooks 已配置",
  "3 hooks enabled: session-memory, command-logger, boot-md":
    "已启用 3 个 hooks：session-memory, command-logger, boot-md",
  "You can manage hooks later with:": "您可以稍后使用以下命令管理 hooks：",
  "openclaw hooks list": "openclaw hooks list",
  "openclaw hooks enable <name>": "openclaw hooks enable <name>",
  "openclaw hooks disable <name>": "openclaw hooks disable <name>",
  "Gateway service runtime": "Gateway服务运行时",
  "QuickStart uses Node as the Gateway service (stable + supported).":
    "快速启动使用 Node 作为Gateway服务（稳定且受支持）。",
  "Installing Gateway service…": "正在安装Gateway服务…",
  "Installed LaunchAgent: /Users/water/Library/LaunchAgents/ai.openclaw.gateway.plist":
    "已安装 LaunchAgent：/Users/water/Library/LaunchAgents/ai.openclaw.gateway.plist",
  "Logs: /Users/water/.openclaw/logs/gateway.log":
    "日志路径：/Users/water/.openclaw/logs/gateway.log",
  "Gateway service installed": "Gateway服务安装成功",
  "Agent: main (default)": "代理：main（默认）",
  "Heartbeat interval: 30m (main)": "心跳间隔：30m (main)",
  "Session storage (main): /Users/water/.openclaw/agents/main/sessions/sessions.json (1 entry)":
    "会话存储 (main)：/Users/water/.openclaw/agents/main/sessions/sessions.json (1 个条目)",
  "- agent:main:main (563m ago)": "- agent:main:main (563m 前)",
  "Optional apps": "可选应用",
  "Add nodes for extra capabilities:": "添加节点以增强功能：",
  "- macOS app (system + notifications)": "- macOS 应用（支持系统控制和通知）",
  "- iOS app (camera/canvas)": "- iOS 应用（支持相机/画布）",
  "- Android app (camera/canvas)": "- Android 应用（支持相机/画布）",
  "Control UI": "控制界面 (UI)",
  "Web UI: http://127.0.0.1:18789/": "Web UI 地址：http://127.0.0.1:18789/",
  "Gateway WS: ws://127.0.0.1:18789": "Gateway WebSocket：ws://127.0.0.1:18789",
  "Gateway: Reachable": "Gateway状态：可达",
  "Docs: https://docs.openclaw.ai/web/control-ui": "文档：https://docs.openclaw.ai/web/control-ui",
  "Launch TUI (best choice!)": "启动终端界面 (TUI) [最佳体验]",
  "This is a critical step to define your agent\u2019s identity.": "这是定义您代理身份的关键步骤。",
  "Please take your time.": "请耐心完成。",
  "The more you tell it, the better the experience will be.":
    "您提供的细节越多，交互体验就会越好。",
  'We will send: "Wake up, my friend!"': '我们将发送："醒醒，我的朋友！"',
  Tokens: "令牌 (Tokens)",
  "Gateway token: Shared auth for Gateway + Control UI.":
    "Gateway令牌：用于Gateway和控制界面的共享认证。",
  "Stored at: ~/.openclaw/openclaw.json (gateway.auth.token) or OPENCLAW_GATEWAY_TOKEN.":
    "存储在：~/.openclaw/openclaw.json 或环境变量 OPENCLAW_GATEWAY_TOKEN 中。",
  "Web UI stores a copy in this browser\u2019s localStorage (openclaw.control.settings.v1).":
    "Web UI 会在浏览器本地存储中保存一份副本。",
  "Get token link anytime: openclaw dashboard --no-open":
    "随时获取令牌链接：openclaw dashboard --no-open",
  "How do you want to hatch your bot?": "您想如何“孵化”您的机器人？",
  "Hatch in TUI (recommended)": "在 TUI 中孵化（推荐）",
  "Open Web UI": "打开网页版 Web UI",
  "Do it later": "稍后再说",
  "Dashboard ready": "仪表板就绪",
  "Dashboard link (with token):": "仪表板链接（含令牌）：",
  "http://127.0.0.1:18789/": "http://127.0.0.1:18789/",
  "Opened in your browser. Keep that tab to control OpenClaw.":
    "已在浏览器中打开。请保留该标签页以控制 OpenClaw。",
  "Workspace backup": "工作区备份",
  "Back up your agent workspace.": "备份您的代理工作区。",
  "Docs:": "文档：",
  "https://docs.openclaw.ai/concepts/agent-workspace":
    "https://docs.openclaw.ai/concepts/agent-workspace",
  Security: "安全",
  "Running an agent on your machine carries risks — harden your setup:":
    "在本地运行代理存在风险 — 请加强您的安全设置：",
  "https://docs.openclaw.ai/security": "https://docs.openclaw.ai/security",
  "Web search (optional)": "网络搜索（可选）",
  "If you want your agent to search the web, you need API keys.":
    "如果您希望代理能够搜索网页，需要配置 API 密钥。",
  "OpenClaw uses Brave Search for `web_search` tool. Without a Brave Search API key, web search won\u2019t work.":
    "OpenClaw 使用 Brave Search。若无 API 密钥，搜索功能将无法使用。",
  "Interactive setup:": "交互式设置：",
  "Run: openclaw configure --section web": "运行：openclaw configure --section web",
  "Enable web_search and paste your Brave Search API key":
    "启用 web_search 并粘贴您的 Brave Search API 密钥",
  "Alternative: Set BRAVE_API_KEY in Gateway environment (no config change needed).":
    "替代方案：在Gateway环境变量中设置 BRAVE_API_KEY。",
  "Docs: https://docs.openclaw.ai/tools/web": "文档：https://docs.openclaw.ai/tools/web",
  "What\u2019s next": "后续操作",
  'What\u2019s next: https://openclaw.ai/showcase ("what people are building").':
    "后续：查看 https://openclaw.ai/showcase 了解大家都在构建什么。",
  "Onboarding complete. Dashboard opened with your token; keep that tab to control OpenClaw.":
    "配置引导完成。仪表板已打开；请保留该标签页。",
  "Gateway start failed: Gateway already running (pid 55434); lock timeout after 5000ms":
    "Gateway启动失败：Gateway已在运行 (PID 55434)；5秒后锁定超时",
  "If Gateway is supervised, use: openclaw gateway stop to stop it":
    "如果Gateway受监控运行，请执行：openclaw gateway stop 停止它",
  "Port 18789 already in use.": "端口 18789 已被占用。",
  "pid 55434 water: openclaw-gateway (127.0.0.1:18789)":
    "pid 55434 water: openclaw-gateway (127.0.0.1:18789)",
  "Gateway already running locally. Stop it (openclaw gateway stop) or use different port.":
    "Gateway已在本地运行。请停止它或更换端口。",
  "Gateway service seems loaded. Please stop it first.": "Gateway服务似乎已加载。请先停止服务。",
  "Hint: openclaw gateway stop": "提示：openclaw gateway stop",
  "or: launchctl bootout gui/$UID/ai.openclaw.gateway":
    "或：launchctl bootout gui/$UID/ai.openclaw.gateway",
  "ELIFECYCLE Command failed with exit code 1.": "ELIFECYCLE 命令失败，退出代码 1。",
  "Invalid config": "无效配置",
  "Config issues": "配置异常",
  "Config invalid. Run `openclaw doctor` to repair it, then re-run onboarding.":
    "配置无效。请运行 `openclaw doctor` 修复，然后重新启动引导。",
  "Invalid --flow (use quickstart, manual, or advanced).":
    "无效的 --flow（请使用 quickstart, manual 或 advanced）。",
  "What do you want to set up?": "您想设置什么？",
  "Local gateway (this machine)": "本地Gateway（此机器）",
  "Remote gateway (info-only)": "远程Gateway（仅信息）",
  "Gateway reachable": "Gateway可达",
  "No gateway detected": "未检测到Gateway",
  "No remote URL configured yet": "尚未配置远程 URL",
  "Configured but unreachable": "已配置但不可达",
  "Remote gateway configured.": "远程Gateway已配置。",
  "Workspace directory": "工作区目录",
  "Skipping channel setup.": "跳过通道设置。",
  "Skipping skills setup.": "跳过skill设置。",
  "Systemd user service not available. Skipping persistence check and service install.":
    "Systemd 用户服务不可用。跳过持久化检查和服务安装。",
  "Systemd user service not available; skipping service install. Use your container manager or `docker compose up -d`.":
    "Systemd 不可用；请使用容器管理器或 `docker compose up -d`。",
  "Install Gateway service (recommended)": "安装Gateway服务（推荐）",
  Restart: "重启",
  Reinstall: "重新安装",
  Skip: "跳过",
  "Gateway service restarted.": "Gateway服务已重启。",
  "Restarting Gateway service…": "正在重启Gateway服务…",
  "Gateway service uninstalled.": "Gateway服务已卸载。",
  "Uninstalling Gateway service…": "正在卸载Gateway服务…",
  "Preparing Gateway service…": "正在准备Gateway服务…",
  "Gateway service install failed.": "Gateway服务安装失败。",
  "Gateway service install failed: ${installError}": "Gateway服务安装失败：${installError}",
  "Health check help": "健康检查帮助",
  "Web UI: ${links.httpUrl}": "Web UI：${links.httpUrl}",
  "Web UI (with token): ${authedUrl}": "Web UI（含令牌）：${authedUrl}",
  "Gateway WS: ${links.wsUrl}": "Gateway WS：${links.wsUrl}",
  "Gateway: Not detected": "Gateway：未检测到",
  "Web UI started in background. Open later with: openclaw dashboard --no-open":
    "Web UI 已在后台启动。稍后可通过命令：openclaw dashboard --no-open 打开",
  "Copy/paste this URL in your local browser to control OpenClaw.":
    "在浏览器中粘贴此 URL 以控制 OpenClaw。",
  "When ready: openclaw dashboard --no-open": "就绪后请执行：openclaw dashboard --no-open",
  Later: "稍后",
  "Skipping Control UI/TUI prompt.": "跳过控制台 UI/TUI 提示。",
  "Web search enabled so your agent can find information online when needed.":
    "网络搜索已启用，代理可以在需要时在线查找信息。",
  "API key: Stored in config (tools.web.search.apiKey).": "API 密钥：已存入配置。",
  "API key: Provided via BRAVE_API_KEY environment variable (Gateway env).":
    "API 密钥：通过 BRAVE_API_KEY 环境变量提供。",
  "Onboarding complete. Web UI started in background; open it anytime with the token link above.":
    "引导完成。Web UI 已在后台启动；可随时通过上方链接访问。",
  "Onboarding complete. Use the token dashboard link above to control OpenClaw.":
    "引导完成。请使用上方的仪表板链接控制 OpenClaw。",
  setupCancelled: "设置已取消。",
  "OpenClaw onboarding": "OpenClaw 配置引导",
  "Model/auth provider": "模型/认证提供商",
  "Many skill dependencies are shipped via Homebrew.": "许多skill依赖项通过 Homebrew 提供。",
  "Without brew, you'll need to build from source or download releases manually.":
    "如果没有 Homebrew，您需要从源码构建或手动下载。",
  "Homebrew recommended": "推荐使用 Homebrew",
  "Show Homebrew install command?": "是否显示 Homebrew 安装命令？",
  "Run:": "运行：",
  "Homebrew install": "安装 Homebrew",
  "BluOS CLI (blu) for discovery, playback, grouping, and volume.":
    "BluOS CLI (blu) 用于播放控制、分组和音量调节。",
  "Install blucli (go)": "安装 blucli (go)",
  install: "安装",
  "Example: Save session context to memory when you issue /new.":
    "示例：当执行 /new 时，自动将会话上下文保存到记忆库。",
  "No eligible hooks found. You can configure hooks later in your config.":
    "未找到符合条件的 hooks。您稍后可在配置中手动添加。",
  "No Hooks Available": "无可用 Hooks",
  "Hooks Configured": "Hooks 已配置",
  "Local (this machine)": "本地（此机器）",
  "Remote (info-only)": "远程（仅信息）",
  "Where will the Gateway run?": "Gateway将在何处运行？",
  "Capture and automate macOS UI with the Peekaboo CLI.":
    "使用 Peekaboo CLI 捕获并自动化控制 macOS 界面。",
  "Install Peekaboo (brew)": "安装 Peekaboo (brew)",
  "Best practices for using the oracle CLI (prompt + file bundling, engines, sessions, and file attachment patterns).":
    "使用 oracle CLI 的最佳实践（包含提示词包装、引擎和附件管理）。",
  "Foodora-only CLI for checking past orders and active order status (Deliveroo WIP).":
    "用于检查 Foodora 订单状态的工具（Deliveroo 适配中）。",
  "ElevenLabs text-to-speech with mac-style say UX.":
    "ElevenLabs 文本转语音，具备 macOS 风格的交互体验。",
  "Search and analyze your own session logs (older/parent conversations) using jq.":
    "使用 jq 搜索并分析您的历史会话日志。",
  "Local text-to-speech via sherpa-onnx (offline, no cloud)":
    "通过 sherpa-onnx 实现本地文本转语音（离线、无云端）。",
  "Create or update AgentSkills. Use when designing, structuring, or packaging skills with scripts, references, and assets.":
    "创建或更新代理skill（AgentSkills）。",
  "Use when you need to control Slack from OpenClaw via the slack tool, including reacting to messages or pinning/unpinning items in Slack channels or DMs.":
    "用于控制 Slack，包括回复消息、固定/取消固定项目等操作。",
  "Generate spectrograms and feature-panel visualizations from audio with the songsee CLI.":
    "使用 songsee CLI 从音频生成频谱图和可视化分析。",
  "Control Sonos speakers (discover/status/play/volume/group).":
    "控制 Sonos 扬声器（发现、播放、音量、分组）。",
  "Terminal Spotify playback/search via spogo (preferred) or spotify_player.":
    "在终端通过 spogo 或 spotify_player 播放/搜索 Spotify。",
  'Summarize or extract text/transcripts from URLs, podcasts, and local files (great fallback for "transcribe this YouTube/video").':
    "从 URL、播客或本地文件中提取文本/转录（视频转文字的绝佳方案）。",
  "Summarize or extract text/transcripts from URLs, podcasts, and local files (great fallback for \u201ctranscribe this YouTube/video\u201d).":
    "从 URL、播客或本地文件中提取文本/转录（视频转文字的绝佳方案）。",

  "Manage Things 3 via the `things` CLI on macOS (add/update projects+todos via URL scheme; read/search/list from the local Things database). Use when a user asks OpenClaw to add a task to Things, list inbox/today/upcoming, search tasks, or inspect projects/areas/tags.":
    "在 macOS 上通过 `things` CLI 管理 Things 3（通过 URL scheme 添加/更新项目+待办事项；从本地 Things 数据库读取/搜索/列出）。当用户要求 OpenClaw 向 Things 添加任务、列出收件箱/今日/即将到来的任务、搜索任务或检查项目/区域/标签时使用。",

  "Remote-control tmux sessions for interactive CLIs by sending keystrokes and scraping pane output.":
    "通过发送按键和抓取窗格输出远程控制 tmux 会话。",
  "Manage Trello boards, lists, and cards via the Trello REST API.":
    "通过 Trello API 管理看板和卡片。",
  "Extract frames or short clips from videos using ffmpeg.": "使用 ffmpeg 从视频中提取帧或短片。",
  "Start voice calls via the OpenClaw voice-call plugin.": "通过语音通话插件发起通话。",
  "Send WhatsApp messages to other people or search/sync WhatsApp history via the wacli CLI (not for normal user chats).":
    "通过 wacli 发送 WhatsApp 消息或同步历史记录。",
  "Get current weather and forecasts (no API key required).":
    "获取当前天气和预报（无需 API 密钥）。",
  "Set up and use 1Password CLI (op). Use when installing the CLI, enabling desktop app integration, signing in (single or multi-account), or reading/injecting/running secrets via op.":
    "设置并使用 1Password CLI (op) 管理机密信息。",
  "Manage Apple Notes via the `memo` CLI on macOS (create, view, edit, delete, search, move, and export notes). Use when a user asks OpenClaw to add a note, list notes, search notes, or manage note folders.":
    "在 macOS 上通过 `memo` CLI 管理苹果备忘录（创建、查看、编辑、删除、搜索、移动和导出笔记）。当用户要求 OpenClaw 添加笔记、列出笔记、搜索笔记或管理笔记文件夹时使用。",
  "Manage Apple Reminders via the `remindctl` CLI on macOS (list, add, edit, complete, delete). Supports lists, date filters, and JSON/plain output.":
    "在 macOS 上通过 `remindctl` CLI 管理提醒事项（列出、添加、编辑、完成、删除）。支持列表、日期过滤器和 JSON/纯文本输出。",
  "Create, search, and manage Bear notes via grizzly CLI.": "通过 grizzly CLI 管理 Bear 笔记。",
  "X/Twitter CLI for reading, searching, posting, and engagement via cookies.":
    "通过 cookie 进行阅读、搜索和互动的 X/Twitter CLI。",
  "Monitor blogs and RSS/Atom feeds for updates using the blogwatcher CLI.":
    "使用 blogwatcher 监控博客和 RSS 更新。",
  "Query Google Places API (New) via the goplaces CLI for text search, place details, resolve, and reviews. Use for human-friendly place lookup or JSON output for scripts.":
    "通过 goplaces CLI 查询 Google Places API（新）进行文本搜索、地点详情、解析和评论。用于人性化的地点查找或脚本的 JSON 输出。",
  "Build or update the BlueBubbles external channel plugin for OpenClaw (extension package, REST send/probe, webhook inbound).":
    "构建或更新 BlueBubbles 外部通道插件。",
  "Capture frames or clips from RTSP/ONVIF cameras.": "从 RTSP/ONVIF 摄像头捕获画面。",
  "Use the ClawdHub CLI to search, install, update, and publish agent skills from clawdhub.com.":
    "使用 ClawdHub CLI 搜索并安装代理skill。",
  "Run Codex CLI, Claude Code, OpenCode, or Pi Coding Agent via background process for programmatic control.":
    "在后台运行各类编程代理进行程序化控制。",
  "Control Eight Sleep pods (status, temperature, alarms, schedules).":
    "控制 Eight Sleep 睡眠舱（温度、闹钟、日程）。",
  "Reorder Foodora orders + track ETA/status with ordercli. Never confirm without explicit user approval.":
    "重新订购 Foodora 并跟踪配送状态。未经显式批准绝不执行。",
  "Gemini CLI for one-shot Q&A, summaries, and generation.": "用于问答、摘要和生成的 Gemini CLI。",
  "Search GIF providers with CLI/TUI, download results, and extract stills/sheets.":
    "在终端搜索、下载并处理 GIF 动图。",
  "Interact with GitHub using the `gh` CLI.": "使用 `gh` CLI 与 GitHub 交互（Issues, PRs, CI）。",
  "Google Workspace CLI for Gmail, Calendar, Drive, Contacts, Sheets, and Docs.":
    "用于 Google 全家桶的 Workspace CLI。",
  "Query Google Places API (New) via the goplaces CLI...":
    "通过 goplaces CLI 查询 Google 地点详情。",
  "CLI to manage emails via IMAP/SMTP. Use `himalaya` to list, read, write, reply, forward, search, and organize emails from the terminal.":
    "通过终端管理电子邮件的 CLI 工具 (himalaya)。",
  "iMessage/SMS CLI for listing chats, history, watch, and sending.":
    "用于管理 iMessage/SMS 聊天的 CLI。",
  "Search for places (restaurants, cafes, etc.) via Google Places API proxy on localhost.":
    "在本地通过代理搜索餐厅、咖啡馆等地点。",
  "Use the mcporter CLI to list, configure, auth, and call MCP servers/tools directly (HTTP or stdio), including ad-hoc servers, config edits, and CLI/type generation.":
    "使用 mcporter CLI 直接列出、配置、认证和调用 MCP 服务器/工具（HTTP 或 stdio），包括临时服务器、配置编辑和 CLI/类型生成。",

  "Use CodexBar CLI local cost usage to summarize per-model usage for Codex or Claude, including the current (most recent) model or a full model breakdown. Trigger when asked for model-level usage/cost data from codexbar, or when you need a scriptable per-model summary from codexbar cost JSON.":
    "使用 CodexBar CLI 本地成本使用情况总结 Codex 或 Claude 的每个模型使用情况，包括当前（最近）模型或完整的模型细分。当被要求提供 codexbar 的模型级使用/成本数据时，或当您需要从 codexbar 成本 JSON 中获取可脚本化的每个模型摘要时触发。",

  "Generate or edit images via Gemini 3 Pro Image (Nano Banana Pro).":
    "通过 Nano Banana Pro (Gemini 3 Pro Image) 生成或编辑图像。",
  "Edit PDFs with natural-language instructions using the nano-pdf CLI.":
    "使用自然语言指令通过 nano-pdf 编辑 PDF 文件。",
  "Notion API for creating and managing pages, databases, and blocks.":
    "用于管理 Notion 页面、数据库和区块的 API。",
  "Work with Obsidian vaults (plain Markdown notes) and automate via obsidian-cli.":
    "管理 Obsidian 保险库并实现自动化操作。",
  "Batch-generate images via OpenAI Images API. Random prompt sampler + `index.html` gallery.":
    "批量生成图像并创建画廊预览。",
  "Local speech-to-text with the Whisper CLI (no API key).":
    "使用 Whisper 进行本地语音转文字（无需 API 密钥）。",
  "Transcribe audio via OpenAI Audio Transcriptions API (Whisper).":
    "通过 OpenAI API 转录音频 (Whisper)。",
  "Control Philips Hue lights/scenes via the OpenHue CLI.": "通过 OpenHue CLI 控制飞利浦智能灯光。",
  "Please select at least one option.": "请至少选择一个选项。",
  "Swap SOUL.md with SOUL_EVIL.md during a purge window or by random chance":
    "在清理周期内或随机触发时，交换 SOUL.md 与 SOUL_EVIL.md",
  "Save session context to memory when /new command is issued":
    "执行 /new 命令时，将会话上下文保存到记忆库",
  "Log all command events to a centralized audit file": "将所有命令事件记录到统一审计文件",
  "Run BOOT.md on gateway startup": "Gateway启动时执行 BOOT.md",
  "Reset scope": "重置范围",
  "Config only": "仅配置",
  "Config + creds + sessions": "配置 + 凭证 + 会话",
  "Full reset (config + creds + sessions + workspace)": "完全重置（配置 + 凭证 + 会话 + 工作区）",
  "No auth methods available for that provider.": "该提供商没有可用的认证方法。",
  "Model/auth choice": "模型/认证选择",
  Back: "返回",
  "Default model (blank to keep)": "默认模型（留空保持不变）",
  "provider/model": "提供商/模型",
  Required: "必填",
  "Keep current (qwen-portal/coder-model)": "保持当前（qwen-portal/coder-model）",
  "Enter model manually": "手动输入模型",
  "qwen-portal/coder-model": "qwen-portal/coder-model",
  "qwen-portal/vision-model": "qwen-portal/vision-model",
};
