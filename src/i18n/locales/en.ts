import { TranslationMap } from "../translations.js";

export const en: TranslationMap = {
  "Security warning — please read.": "Security warning — please read.",
  "OpenClaw is a hobby project and still in beta. Expect sharp edges.":
    "OpenClaw is a hobby project and still in beta. Expect sharp edges.",
  "This bot can read files and run actions if tools are enabled.":
    "This bot can read files and run actions if tools are enabled.",
  "A bad prompt can trick it into doing unsafe things.":
    "A bad prompt can trick it into doing unsafe things.",
  "If you\u2019re not comfortable with basic security and access control, don\u2019t run OpenClaw.":
    "If you\u2019re not comfortable with basic security and access control, don\u2019t run OpenClaw.",
  "Ask someone experienced to help before enabling tools or exposing it to the internet.":
    "Ask someone experienced to help before enabling tools or exposing it to the internet.",
  "Recommended baseline:": "Recommended baseline:",
  "- Pairing/allowlists + mention gating.": "- Pairing/allowlists + mention gating.",
  "- Sandbox + least-privilege tools.": "- Sandbox + least-privilege tools.",
  "- Keep secrets out of the agent\u2019s reachable filesystem.":
    "- Keep secrets out of the agent\u2019s reachable filesystem.",
  "- Use the strongest available model for any bot with tools or untrusted inboxes.":
    "- Use the strongest available model for any bot with tools or untrusted inboxes.",
  "Run regularly:": "Run regularly:",
  "openclaw security audit --deep": "openclaw security audit --deep",
  "openclaw security audit --fix": "openclaw security audit --fix",
  "Must read:": "Must read:",
  "I understand this is powerful and inherently risky. Continue?":
    "I understand this is powerful and inherently risky. Continue?",
  "Onboarding mode": "Onboarding mode",
  QuickStart: "QuickStart",
  Manual: "Manual",
  "Existing config detected": "Existing config detected",
  "Workspace:": "Workspace:",
  "Model:": "Model:",
  "gateway.mode:": "gateway.mode:",
  "gateway.port:": "gateway.port:",
  "gateway.bind:": "gateway.bind:",
  "Config handling": "Config handling",
  "Use existing values": "Use existing values",
  "Update values": "Update values",
  Reset: "Reset",
  "Keeping your current gateway settings:": "Keeping your current gateway settings:",
  "Gateway port:": "Gateway port:",
  "Gateway bind:": "Gateway bind:",
  "Loopback (127.0.0.1)": "Loopback (127.0.0.1)",
  "Gateway auth:": "Gateway auth:",
  Password: "Password",
  "Tailscale exposure:": "Tailscale exposure:",
  Off: "Off",
  "Direct to chat channels.": "Direct to chat channels.",
  "Model/authentication provider": "Model/authentication provider",
  Qwen: "Qwen",
  "Qwen auth method": "Qwen auth method",
  "Qwen OAuth": "Qwen OAuth",
  "Launching Qwen OAuth…": "Launching Qwen OAuth…",
  "Open `https://chat.qwen.ai/authorize?user_code=2SSIW_TR&client=qwen-code` to approve access.":
    "Open `https://chat.qwen.ai/authorize?user_code=2SSIW_TR&client=qwen-code` to approve access.",
  "Enter code 2SSIW_TR if prompted.": "Enter code 2SSIW_TR if prompted.",
  "Qwen OAuth complete": "Qwen OAuth complete",
  "Model configured": "Model configured",
  "Default model set to qwen-portal/coder-model": "Default model set to qwen-portal/coder-model",
  "Provider notes": "Provider notes",
  "Qwen OAuth tokens auto-refresh. If refresh fails or access is revoked, re-run login.":
    "Qwen OAuth tokens auto-refresh. If refresh fails or access is revoked, re-run login.",
  "Base URL defaults to `https://portal.qwen.ai/v1.` Override models.providers.qwen-portal.baseUrl if needed.":
    "Base URL defaults to `https://portal.qwen.ai/v1.` Override models.providers.qwen-portal.baseUrl if needed.",
  "Default model": "Default model",
  "Channel status": "Channel status",
  "iMessage: Configured": "iMessage: Configured",
  "imsg: Found (/usr/local/bin/imsg)": "imsg: Found (/usr/local/bin/imsg)",
  "Telegram: Not configured": "Telegram: Not configured",
  "WhatsApp: Not configured": "WhatsApp: Not configured",
  "Discord: Not configured": "Discord: Not configured",
  "Google Chat: Not configured": "Google Chat: Not configured",
  "Slack: Not configured": "Slack: Not configured",
  "Signal: Not configured": "Signal: Not configured",
  "Google Chat: Install plugin to enable": "Google Chat: Install plugin to enable",
  "Nostr: Install plugin to enable": "Nostr: Install plugin to enable",
  "Microsoft Teams: Install plugin to enable": "Microsoft Teams: Install plugin to enable",
  "Mattermost: Install plugin to enable": "Mattermost: Install plugin to enable",
  "Nextcloud Talk: Install plugin to enable": "Nextcloud Talk: Install plugin to enable",
  "Matrix: Install plugin to enable": "Matrix: Install plugin to enable",
  "BlueBubbles: Install plugin to enable": "BlueBubbles: Install plugin to enable",
  "LINE: Install plugin to enable": "LINE: Install plugin to enable",
  "Zalo: Install plugin to enable": "Zalo: Install plugin to enable",
  "Zalo Personal: Install plugin to enable": "Zalo Personal: Install plugin to enable",
  "Tlon: Install plugin to enable": "Tlon: Install plugin to enable",
  "How channels work": "How channels work",
  "DM safety: Defaults to pairing; unknown DMs get a pairing code.":
    "DM safety: Defaults to pairing; unknown DMs get a pairing code.",
  "To approve: openclaw pairing approve <channel> <code>":
    "To approve: openclaw pairing approve <channel> <code>",
  'Public DMs require dmPolicy="open" + allowFrom=["*"].':
    'Public DMs require dmPolicy="open" + allowFrom=["*"].',
  'Multi-user DMs: Set session.dmScope="per-channel-peer" (or "per-account-channel-peer" for multi-account channels) to isolate sessions.':
    'Multi-user DMs: Set session.dmScope="per-channel-peer" (or "per-account-channel-peer" for multi-account channels) to isolate sessions.',
  "Docs: start/pairing": "Docs: start/pairing",
  "Telegram: Easiest to start — use @BotFather to register a bot and go.":
    "Telegram: Easiest to start — use @BotFather to register a bot and go.",
  "WhatsApp: Uses your own number; recommend a separate phone + eSIM.":
    "WhatsApp: Uses your own number; recommend a separate phone + eSIM.",
  "Discord: Well-supported currently.": "Discord: Well-supported currently.",
  "Google Chat: Google Workspace Chat app with HTTP webhook.":
    "Google Chat: Google Workspace Chat app with HTTP webhook.",
  "Slack: Supported (Socket Mode).": "Slack: Supported (Socket Mode).",
  'Signal: signal-cli linked device; more setup needed (David Reagans: "Join Discord.").':
    'Signal: signal-cli linked device; more setup needed (David Reagans: "Join Discord.").',
  "iMessage: This is still being worked on.": "iMessage: This is still being worked on.",
  "Nostr: Decentralized protocol; encrypted DMs via NIP-04.":
    "Nostr: Decentralized protocol; encrypted DMs via NIP-04.",
  "Microsoft Teams: Bot Framework; enterprise support.":
    "Microsoft Teams: Bot Framework; enterprise support.",
  "Mattermost: Self-hosted Slack-like chat; install plugin to enable.":
    "Mattermost: Self-hosted Slack-like chat; install plugin to enable.",
  "Nextcloud Talk: Self-hosted chat via Nextcloud Talk webhook bot.":
    "Nextcloud Talk: Self-hosted chat via Nextcloud Talk webhook bot.",
  "Matrix: Open protocol; install plugin to enable.":
    "Matrix: Open protocol; install plugin to enable.",
  "BlueBubbles: iMessage via BlueBubbles macOS app + REST API.":
    "BlueBubbles: iMessage via BlueBubbles macOS app + REST API.",
  "LINE: LINE messaging API bot for Japan/Taiwan/Thailand markets.":
    "LINE: LINE messaging API bot for Japan/Taiwan/Thailand markets.",
  "Zalo: Vietnam-focused messaging platform with Bot API.":
    "Zalo: Vietnam-focused messaging platform with Bot API.",
  "Zalo Personal: Zalo personal account via QR login.":
    "Zalo Personal: Zalo personal account via QR login.",
  "Tlon: Decentralized messaging on Urbit; install plugin to enable.":
    "Tlon: Decentralized messaging on Urbit; install plugin to enable.",
  "Select channels (QuickStart)": "Select channels (QuickStart)",
  "Skip for now": "Skip for now",
  "Updated ~/.openclaw/openclaw.json": "Updated ~/.openclaw/openclaw.json",
  "Workspace ok: ~/Documents/clawd": "Workspace ok: ~/Documents/clawd",
  "Sessions ok: ~/.openclaw/agents/main/sessions": "Sessions ok: ~/.openclaw/agents/main/sessions",
  "Skills status": "Skills status",
  "Eligible: 6": "Eligible: 6",
  "Missing requirements: 42": "Missing requirements: 42",
  "Blocked by allowlist: 0": "Blocked by allowlist: 0",
  "Configure skills now? (recommended)": "Configure skills now? (recommended)",
  Yes: "Yes",
  "Preferred node manager for skill installs": "Preferred node manager for skill installs",
  pnpm: "pnpm",
  "Install missing skill dependencies": "Install missing skill dependencies",
  "🫐 blucli, 🧩 clawdhub, 📧 himalaya, 📊 model-usage, 🍌 nano-banana-pro, 📄 nano-pdf, 👀 peekaboo, 🎞️ video-frames":
    "🫐 blucli, 🧩 clawdhub, 📧 himalaya, 📊 model-usage, 🍌 nano-banana-pro, 📄 nano-pdf, 👀 peekaboo, 🎞️ video-frames",
  "Install failed:": "Install failed:",
  Hooks: "Hooks",
  "Hooks let you automate actions when agent commands are issued.":
    "Hooks let you automate actions when agent commands are issued.",
  "Example: When you issue /new, save session context to memory.":
    "Example: When you issue /new, save session context to memory.",
  "Learn more: https://docs.openclaw.ai/hooks": "Learn more: https://docs.openclaw.ai/hooks",
  "Enable Hooks?": "Enable Hooks?",
  "Hooks configured": "Hooks configured",
  "3 hooks enabled: session-memory, command-logger, boot-md":
    "3 hooks enabled: session-memory, command-logger, boot-md",
  "You can manage hooks later with:": "You can manage hooks later with:",
  "openclaw hooks list": "openclaw hooks list",
  "openclaw hooks enable <name>": "openclaw hooks enable <name>",
  "openclaw hooks disable <name>": "openclaw hooks disable <name>",
  "Gateway service runtime": "Gateway service runtime",
  "QuickStart uses Node as the Gateway service (stable + supported).":
    "QuickStart uses Node as the Gateway service (stable + supported).",
  "Installing Gateway service…": "Installing Gateway service…",
  "Installed LaunchAgent: /Users/water/Library/LaunchAgents/ai.openclaw.gateway.plist":
    "Installed LaunchAgent: /Users/water/Library/LaunchAgents/ai.openclaw.gateway.plist",
  "Logs: /Users/water/.openclaw/logs/gateway.log": "Logs: /Users/water/.openclaw/logs/gateway.log",
  "Gateway service installed": "Gateway service installed",
  "Agent: main (default)": "Agent: main (default)",
  "Heartbeat interval: 30m (main)": "Heartbeat interval: 30m (main)",
  "Session storage (main): /Users/water/.openclaw/agents/main/sessions/sessions.json (1 entry)":
    "Session storage (main): /Users/water/.openclaw/agents/main/sessions/sessions.json (1 entry)",
  "- agent:main:main (563m ago)": "- agent:main:main (563m ago)",
  "Optional apps": "Optional apps",
  "Add nodes for extra capabilities:": "Add nodes for extra capabilities:",
  "- macOS app (system + notifications)": "- macOS app (system + notifications)",
  "- iOS app (camera/canvas)": "- iOS app (camera/canvas)",
  "- Android app (camera/canvas)": "- Android app (camera/canvas)",
  "Control UI": "Control UI",
  "Web UI: http://127.0.0.1:18789/": "Web UI: http://127.0.0.1:18789/",
  "Gateway WS: ws://127.0.0.1:18789": "Gateway WS: ws://127.0.0.1:18789",
  "Gateway: Reachable": "Gateway: Reachable",
  "Docs: https://docs.openclaw.ai/web/control-ui": "Docs: https://docs.openclaw.ai/web/control-ui",
  "Launch TUI (best choice!)": "Launch TUI (best choice!)",
  "This is a critical step to define your agent\u2019s identity.":
    "This is a critical step to define your agent\u2019s identity.",
  "Please take your time.": "Please take your time.",
  "The more you tell it, the better the experience will be.":
    "The more you tell it, the better the experience will be.",
  'We will send: "Wake up, my friend!"': 'We will send: "Wake up, my friend!"',
  Tokens: "Tokens",
  "Gateway token: Shared auth for Gateway + Control UI.":
    "Gateway token: Shared auth for Gateway + Control UI.",
  "Stored at: ~/.openclaw/openclaw.json (gateway.auth.token) or OPENCLAW_GATEWAY_TOKEN.":
    "Stored at: ~/.openclaw/openclaw.json (gateway.auth.token) or OPENCLAW_GATEWAY_TOKEN.",
  "Web UI stores a copy in this browser\u2019s localStorage (openclaw.control.settings.v1).":
    "Web UI stores a copy in this browser\u2019s localStorage (openclaw.control.settings.v1).",
  "Get token link anytime: openclaw dashboard --no-open":
    "Get token link anytime: openclaw dashboard --no-open",
  "How do you want to hatch your bot?": "How do you want to hatch your bot?",
  "Hatch in TUI (recommended)": "Hatch in TUI (recommended)",
  "Open Web UI": "Open Web UI",
  "Do it later": "Do it later",
  "Dashboard ready": "Dashboard ready",
  "Dashboard link (with token):": "Dashboard link (with token):",
  "http://127.0.0.1:18789/": "http://127.0.0.1:18789/",
  "Opened in your browser. Keep that tab to control OpenClaw.":
    "Opened in your browser. Keep that tab to control OpenClaw.",
  "Workspace backup": "Workspace backup",
  "Back up your agent workspace.": "Back up your agent workspace.",
  "Docs:": "Docs:",
  "https://docs.openclaw.ai/concepts/agent-workspace":
    "https://docs.openclaw.ai/concepts/agent-workspace",
  Security: "Security",
  "Running an agent on your machine carries risks — harden your setup:":
    "Running an agent on your machine carries risks — harden your setup:",
  "https://docs.openclaw.ai/security": "https://docs.openclaw.ai/security",
  "Web search (optional)": "Web search (optional)",
  "If you want your agent to search the web, you need API keys.":
    "If you want your agent to search the web, you need API keys.",
  "OpenClaw uses Brave Search for `web_search` tool. Without a Brave Search API key, web search won\u2019t work.":
    "OpenClaw uses Brave Search for `web_search` tool. Without a Brave Search API key, web search won\u2019t work.",
  "Interactive setup:": "Interactive setup:",
  "Run: openclaw configure --section web": "Run: openclaw configure --section web",
  "Enable web_search and paste your Brave Search API key":
    "Enable web_search and paste your Brave Search API key",
  "Alternative: Set BRAVE_API_KEY in Gateway environment (no config change needed).":
    "Alternative: Set BRAVE_API_KEY in Gateway environment (no config change needed).",
  "Docs: https://docs.openclaw.ai/tools/web": "Docs: https://docs.openclaw.ai/tools/web",
  "What\u2019s next": "What\u2019s next",
  'What\u2019s next: https://openclaw.ai/showcase ("what people are building").':
    'What\u2019s next: https://openclaw.ai/showcase ("what people are building").',
  "Onboarding complete. Dashboard opened with your token; keep that tab to control OpenClaw.":
    "Onboarding complete. Dashboard opened with your token; keep that tab to control OpenClaw.",
  "Gateway start failed: Gateway already running (pid 55434); lock timeout after 5000ms":
    "Gateway start failed: Gateway already running (pid 55434); lock timeout after 5000ms",
  "If Gateway is supervised, use: openclaw gateway stop to stop it":
    "If Gateway is supervised, use: openclaw gateway stop to stop it",
  "Port 18789 already in use.": "Port 18789 already in use.",
  "pid 55434 water: openclaw-gateway (127.0.0.1:18789)":
    "pid 55434 water: openclaw-gateway (127.0.0.1:18789)",
  "Gateway already running locally. Stop it (openclaw gateway stop) or use different port.":
    "Gateway already running locally. Stop it (openclaw gateway stop) or use different port.",
  "Gateway service seems loaded. Please stop it first.":
    "Gateway service seems loaded. Please stop it first.",
  "Hint: openclaw gateway stop": "Hint: openclaw gateway stop",
  "or: launchctl bootout gui/$UID/ai.openclaw.gateway":
    "or: launchctl bootout gui/$UID/ai.openclaw.gateway",
  "ELIFECYCLE Command failed with exit code 1.": "ELIFECYCLE Command failed with exit code 1.",
  "Invalid config": "Invalid config",
  "Config issues": "Config issues",
  "Config invalid. Run `openclaw doctor` to repair it, then re-run onboarding.":
    "Config invalid. Run `openclaw doctor` to repair it, then re-run onboarding.",
  "Invalid --flow (use quickstart, manual, or advanced).":
    "Invalid --flow (use quickstart, manual, or advanced).",
  "What do you want to set up?": "What do you want to set up?",
  "Local gateway (this machine)": "Local gateway (this machine)",
  "Remote gateway (info-only)": "Remote gateway (info-only)",
  "Gateway reachable": "Gateway reachable",
  "No gateway detected": "No gateway detected",
  "No remote URL configured yet": "No remote URL configured yet",
  "Configured but unreachable": "Configured but unreachable",
  "Remote gateway configured.": "Remote gateway configured.",
  "Workspace directory": "Workspace directory",
  "Skipping channel setup.": "Skipping channel setup.",
  "Skipping skills setup.": "Skipping skills setup.",
  "Systemd user service not available. Skipping persistence check and service install.":
    "Systemd user service not available. Skipping persistence check and service install.",
  "Systemd user service not available; skipping service install. Use your container manager or `docker compose up -d`.":
    "Systemd user service not available; skipping service install. Use your container manager or `docker compose up -d`.",
  "Install Gateway service (recommended)": "Install Gateway service (recommended)",
  Restart: "Restart",
  Reinstall: "Reinstall",
  Skip: "Skip",
  "Gateway service restarted.": "Gateway service restarted.",
  "Restarting Gateway service…": "Restarting Gateway service…",
  "Gateway service uninstalled.": "Gateway service uninstalled.",
  "Uninstalling Gateway service…": "Uninstalling Gateway service…",
  "Preparing Gateway service…": "Preparing Gateway service…",
  "Gateway service install failed.": "Gateway service install failed.",
  "Gateway service install failed: ${installError}":
    "Gateway service install failed: ${installError}",
  "Health check help": "Health check help",
  "Web UI: ${links.httpUrl}": "Web UI: ${links.httpUrl}",
  "Web UI (with token): ${authedUrl}": "Web UI (with token): ${authedUrl}",
  "Gateway WS: ${links.wsUrl}": "Gateway WS: ${links.wsUrl}",
  "Gateway: Not detected": "Gateway: Not detected",
  "Web UI started in background. Open later with: openclaw dashboard --no-open":
    "Web UI started in background. Open later with: openclaw dashboard --no-open",
  "Copy/paste this URL in your local browser to control OpenClaw.":
    "Copy/paste this URL in your local browser to control OpenClaw.",
  "When ready: openclaw dashboard --no-open": "When ready: openclaw dashboard --no-open",
  Later: "Later",
  "Skipping Control UI/TUI prompt.": "Skipping Control UI/TUI prompt.",
  "Web search enabled so your agent can find information online when needed.":
    "Web search enabled so your agent can find information online when needed.",
  "API key: Stored in config (tools.web.search.apiKey).":
    "API key: Stored in config (tools.web.search.apiKey).",
  "API key: Provided via BRAVE_API_KEY environment variable (Gateway env).":
    "API key: Provided via BRAVE_API_KEY environment variable (Gateway env).",
  "Onboarding complete. Web UI started in background; open it anytime with the token link above.":
    "Onboarding complete. Web UI started in background; open it anytime with the token link above.",
  "Onboarding complete. Use the token dashboard link above to control OpenClaw.":
    "Onboarding complete. Use the token dashboard link above to control OpenClaw.",
  setupCancelled: "Setup cancelled.",
  "OpenClaw onboarding": "OpenClaw onboarding",
  "Model/auth provider": "Model/auth provider",
};
