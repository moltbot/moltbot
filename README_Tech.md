# Moltbot Technical Documentation

## Format Guidelines for Contributors

**Style:** Concise, technical, action-oriented.
**Brevity:** One sentence per command/concept. Use bullet points, not paragraphs.
**Problem Log:** Keep entries short—problem → symptom → solution. Add date and who fixed it if known.
**Commands:** Always include the command first, explanation after (e.g., `systemctl restart moltbot-gateway` # Restarts the gateway service).
**Sections:** Group by topic. Use `##` for major sections, `###` for subsections.
**Updates:** When adding new problems/solutions, add to the end of the Problem Log section with date.

---

## Process Architecture

### Core Components

1. **Moltbot Gateway** (`moltbot-gateway`)
   - Service: `/etc/systemd/system/moltbot-gateway.service`
   - Runs: `/usr/bin/node dist/entry.js gateway --port 18789`
   - Manager: `systemd` (isolated from PM2)
   - Handles: Telegram integration, message routing, model selection

2. **Supporting Processes**
   - **Dashboard** (si_project/dashboard) - PM2 managed, separate from bot
   - **AI Product Visualizer** (ai_product_visualizer) - PM2 managed, separate from bot
   - **Telegram Relay** - Embedded in gateway (grammY framework)
   - **Task-Type Router** - Compiled TypeScript module in gateway

3. **Configuration Files**
   - Global: `/root/.clawdbot/moltbot.json`
   - Agent-specific: `/root/.clawdbot/agents/main/config.json`
   - Environment: `/root/.clawdbot/.env`

---

## Process Management

### Moltbot Gateway (Systemd)

```bash
# Check status
systemctl status moltbot-gateway

# Restart (reloads config + code)
systemctl restart moltbot-gateway

# Stop gracefully
systemctl stop moltbot-gateway

# Start if stopped
systemctl start moltbot-gateway

# View live logs
journalctl -u moltbot-gateway -f

# View last 100 lines
journalctl -u moltbot-gateway -n 100
```

**Auto-restart:** Enabled. If process crashes, systemd restarts it within 5 seconds.
**Boot persistence:** Enabled. Starts automatically on system reboot.

### From Telegram Chat

Send `/restart` command in Telegram to restart the bot gracefully without terminal access.

### Dashboard (PM2)

```bash
# Check status
pm2 list

# Restart
pm2 restart dashboard

# Logs
pm2 logs dashboard

# Stop
pm2 stop dashboard
```

**Isolation:** Runs in separate PM2 daemon. Does not interfere with Moltbot.

### Logs Location

```bash
# Moltbot systemd logs
journalctl -u moltbot-gateway -n 200

# Moltbot app logs (most detailed)
tail -f /var/log/moltbot-gateway.log

# Application debug logs
tail -f /tmp/moltbot/moltbot-*.log
```

---

## Problem Log & Solutions

### 1. **Duplicate Telegram Responses** (Jan 28, 2026)

**Problem:** Bot sending same message 2-3 times.

**Root Cause:** `streamMode: "partial"` in Telegram config caused responses to stream as chunks, each sent separately.

**Solution:** Changed `streamMode` from `"partial"` to `"block"` in `/root/.clawdbot/moltbot.json`.

```json
"telegram": {
  "streamMode": "block"  // Single unified message
}
```

**Status:** ✅ Fixed. Single responses now.

---

### 2. **Unknown Model Error** (Jan 28, 2026)

**Problem:** Error: `Unknown model: openrouter/mistralai/mistral-devstral-2`

**Root Cause:** Incorrect OpenRouter model ID format. Used old naming convention.

**Solution:** Updated model IDs to correct OpenRouter format:
- `mistralai/devstral-2512` (Mistral Devstral 2)
- `google/gemini-2.0-flash-001` (Gemini 2.0 Flash)
- `meta-llama/llama-3.3-70b-instruct:free` (Llama 3.3 70B)

**Status:** ✅ Fixed. Models now load correctly.

---

### 3. **PM2 Process Isolation Conflict** (Jan 28, 2026)

**Problem:** Dashboard PM2 restarting 140+ times. Gateway conflicting with dashboard in same PM2 daemon.

**Root Cause:** Moltbot gateway was added to default PM2 instance, sharing resources with dashboard.

**Solution:** Moved Moltbot from PM2 to systemd service (isolated).
- Moltbot: `systemd` only
- Dashboard: `PM2` only
- No shared daemon = no conflicts

**Status:** ✅ Fixed. Processes now isolated.

**Files changed:**
- Created: `/etc/systemd/system/moltbot-gateway.service`
- Removed: Moltbot from PM2 list

---

### 4. **Missing Task-Type Router Compilation** (Jan 28, 2026)

**Problem:** Bot said it implemented task-type routing but nothing changed.

**Root Cause:** TypeScript source files modified but not compiled to `dist/`.

**Solution:**
1. Fixed import error in `src/agents/task-type-router.ts` (DEFAULT_PROVIDER location)
2. Compiled: `npm run build`
3. Restarted gateway to load new `dist/` code

**Status:** ✅ Fixed. Task-type router now active.

---

### 5. **Telegram Command Limit Exceeded** (Jan 29, 2026)

**Problem:** Error: `setMyCommands failed: BOT_COMMANDS_TOO_MUCH` (Telegram API limit = 100 commands).

**Root Cause:** Both config files had `"native": "auto"` trying to register all skills + commands with Telegram.

**Solution:** Disabled native command auto-registration:
```json
// /root/.clawdbot/moltbot.json
"commands": {
  "native": false,
  "nativeSkills": false
}

// /root/.clawdbot/agents/main/config.json
"commands": {
  "native": false,
  "text": true,
  "restart": true
}
```

**Status:** ✅ Fixed. Telegram now connects without errors.

---

### 6. **Node.js Version Too Old** (Jan 28, 2026)

**Problem:** Moltbot requires Node.js 24+ but only v20 was installed.

**Root Cause:** Package.json specified `engines: { node: ">=24" }`.

**Solution:** Upgraded Node.js:
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Verified:** `node --version` → v24.13.0

**Status:** ✅ Fixed.

---

### 7. **Gateway Crash Loop & Inotify Exhaustion** (Jan 29, 2026)

**Problem:** Gateway hung/became unresponsive. PM2 restarted 448+ times. Telegram bot stopped responding.

**Symptoms:**
- `Port 18789 is already in use` (process stuck, wouldn't release port)
- `Gateway failed to start: gateway already running; lock timeout after 5000ms`
- Lock files stale/not released
- Port conflict between different PM2 daemons and attempted systemd service

**Root Cause:** System hit **inotify file descriptor limit** (`ENOSPC`):
```
Error: ENOSPC: System limit for number of file watchers reached, watch '/root/.moltbot/moltbot.json'
Error: ENOSPC: System limit for number of file watchers reached, watch '/root/clawd/canvas'
Error: ENOSPC: System limit for number of file watchers reached, watch '/root/clawd'
```

Gateway couldn't monitor config/skill files for changes → config reloading broke → became hung/unresponsive → PM2 restart loop (448+ restarts).

**Solutions:**

1. **Permanent inotify limit increase:** `/etc/sysctl.d/99-moltbot-inotify.conf`
```
fs.inotify.max_user_watches=524288  # Increased from 65536
```
Apply: `sysctl -p /etc/sysctl.d/99-moltbot-inotify.conf`

Verify: `cat /proc/sys/fs/inotify/max_user_watches` (should show 524288)

2. **Process management:** Gateway is managed by **PM2 (separate daemon)**, not systemd
```bash
pm2 status                    # Check gateway status
pm2 restart moltbot-gateway   # Restart gateway (PM2-managed)
pm2 logs moltbot-gateway      # View real-time logs
```

3. **Manual recovery (if stuck):**
```bash
killall -9 moltbot
pm2 restart moltbot-gateway
```

**Key Files Modified:**
- Created: `/etc/sysctl.d/99-moltbot-inotify.conf` (inotify limit increase)

**Architecture Note:**
- PM2 runs multiple independent daemons: `si_project/dashboard`, `ai_product_visualizer`, `moltbot-gateway`
- Each daemon is separate to prevent process interference
- **Never** use systemd for moltbot-gateway (causes port conflicts with PM2)

**Status:** ✅ Fixed. Inotify limit increased. PM2 managing gateway cleanly.

---

## Gateway Stability Infrastructure (Jan 29, 2026)

### Multi-Layer Stability Design

**Layer 1: System Level**
- Inotify watcher limit: 524288 (prevents file monitoring exhaustion)
  - Config: `/etc/sysctl.d/99-moltbot-inotify.conf`
  - Verify: `cat /proc/sys/fs/inotify/max_user_watches`

**Layer 2: PM2 Process Management**
- Automatic restart on crash
- Memory limit: 500MB (auto-restart if exceeded)
- Min uptime: 10 seconds (prevents restart storms)
- Kill timeout: 5 seconds (graceful shutdown before force kill)
- Config: `/root/moltbot/ecosystem.config.cjs`

**Layer 3: Startup Hooks**
- `scripts/gateway-start.sh`: Wrapper script that runs on every startup
  - Automatically cleans stale lock files (`~/.clawdbot/*.lock`)
  - Prevents "gateway already running" errors
  - Runs before `node dist/entry.js gateway`

**Layer 4: Health Monitoring**
- `scripts/pm2-health-monitor.js`: Standalone health check app managed by PM2
  - Runs every 5 minutes (configurable)
  - Tests port 18789 connectivity (detects hung processes)
  - Monitors inotify watcher usage (warns at 80% of limit)
  - Force-restarts via `killall -9 moltbot` if unresponsive
  - Logs to `/tmp/moltbot/pm2-health-monitor.log`
  - Isolated from gateway in same PM2 daemon

### Monitoring Commands

```bash
# View both gateway and health monitor status
pm2 list

# View gateway logs (real-time)
pm2 logs moltbot-gateway

# View health monitor logs
pm2 logs moltbot-health-monitor

# View last 50 lines of either
pm2 logs moltbot-gateway -n 50
pm2 logs moltbot-health-monitor -n 50

# Monitor health checks in real-time
tail -f /tmp/moltbot/pm2-health-monitor.log

# Force restart gateway
pm2 restart moltbot-gateway

# Emergency restart (if stuck)
killall -9 moltbot && pm2 restart moltbot-gateway
```

### Recovery Scenarios

**Scenario 1: Gateway Becomes Unresponsive (Process Running but Port Hung)**
- Symptom: `pm2 status` shows `online`, but `nc -zv 127.0.0.1 18789` fails
- Response: Health monitor detects this within 5 minutes
- Action: Auto-kills process, PM2 restarts it
- Result: Bot responds to next Telegram message

**Scenario 2: Lock File Left Behind**
- Symptom: `Gateway failed to start: gateway already running`
- Cause: Previous process crashed without cleaning locks
- Response: `gateway-start.sh` cleans locks on startup
- Result: Gateway starts cleanly

**Scenario 3: Inotify Exhaustion**
- Symptom: `Error: ENOSPC: System limit for number of file watchers reached`
- Cause: Too many config/skill files being watched
- Response: Health monitor logs warning at 80% threshold
- Solution: Delete unused skills or increase limit further (requires code review)

**Scenario 4: Memory Exhaustion**
- Symptom: Process becomes slow/unresponsive, memory climbing
- Response: PM2 auto-restart when hitting 500MB limit
- Result: Clean restart, memory reset

### What This Prevents

✅ Telegram messages causing gateway hang
✅ Stale lock files blocking restarts
✅ Inotify limit exhaustion going unnoticed
✅ Memory leaks causing slowness
✅ Restart storms from `Restart=always`
✅ Systemd conflicts with PM2
✅ Lack of visibility into gateway health

---

## Configuration Summary

### Model Fallback Chain

**Primary:** Mistral Devstral 2 2512 (agentic specialist)
**Fallbacks:**
1. Gemini 2.0 Flash (long-context, 1M tokens)
2. Llama 3.3 70B (creative/pedagogical)
3. Moonshot Kimi K2.5 (language model)
4. Claude Sonnet 4.5 (escalation)
5. Claude Opus 4.5 (complex reasoning)

### Task-Type Routing

- **File Analysis** → Gemini Flash
- **Creative Content** → Llama 3.3 70B
- **Debugging** → Claude Sonnet 4.5
- **CLI/Commands** → Mistral Devstral 2
- **General** → Mistral Devstral 2 (default)

### Telegram Settings

- **Streaming Mode:** `block` (single message per response)
- **Commands Native:** `false` (avoid API limit)
- **Restart Command:** `true` (allows `/restart` from chat)
- **User ID Allowlist:** 876311493 (only you)

---

---

## Architecture: Process Management

### PM2 Daemons on This Host
- **Moltbot Gateway** (`pm2 start ecosystem.config.cjs` or `pm2 restart moltbot-gateway`)
  - Managed by: PM2 (separate daemon, independent from other PM2 instances)
  - Port: 18789
  - PID file: `/root/.pm2/pids/moltbot-gateway-0.pid`
  - Config: `/root/moltbot/ecosystem.config.cjs`

- **Other PM2 Daemons** (separate instances)
  - `si_project/dashboard` - Frontend dashboard
  - `ai_product_visualizer` - Backend visualizer
  - **Each runs in its own PM2 daemon to prevent interference**

### Systemd Services (Independent)
- `code-server.service` - Code editor (not PM2-managed)
- `ssh.service` - SSH server (not PM2-managed)
- These do not interact with moltbot or other PM2 processes

### Safety Design
- **Process isolation:** Each PM2 daemon is independent (separate instances)
- **No port conflicts:** Moltbot never uses systemd (only PM2)
- **Independent logging:** Moltbot logs to `/tmp/moltbot/` (separate from other services)
- **Inotify limit:** System-wide increased to prevent file watcher exhaustion

### Monitoring & Control
```bash
pm2 list                      # View all PM2 daemons (in current user's daemon)
pm2 status                    # Show moltbot-gateway status
pm2 restart moltbot-gateway   # Restart gateway
pm2 logs moltbot-gateway      # Real-time logs
pm2 logs moltbot-gateway -n 100  # Last 100 lines
```

---

## Quick Troubleshooting

### Bot Not Responding

1. Check status: `pm2 status`
2. Check logs: `pm2 logs moltbot-gateway` or `pm2 logs moltbot-gateway -n 50`
3. Restart: `pm2 restart moltbot-gateway`
4. Check port: `nc -zv 127.0.0.1 18789`
5. Check inotify limit (if file watching errors): `cat /proc/sys/fs/inotify/max_user_watches` (should be 524288)
6. If stuck, force kill and restart:
```bash
killall -9 moltbot
pm2 restart moltbot-gateway
```

### Telegram Connection Error

Check logs for `setMyCommands failed` or network errors:
```bash
pm2 logs moltbot-gateway | grep -i telegram
```

If command limit error: Verify `native: false` in `/root/.clawdbot/moltbot.json` and `/root/.clawdbot/agents/main/config.json`.

### High Latency (>1 minute)

Expected for first API call to OpenRouter. Check OpenRouter API status.
If consistent, check model health: `node dist/entry.js models status`

### Duplicate Responses

Check `streamMode: "block"` is set in `/root/.clawdbot/moltbot.json`.

### Gateway Crashes Frequently

Check PM2 restart count: `pm2 list | grep moltbot-gateway`
- If `↺` count is high (>10), check logs for root cause:
  - Inotify exhaustion: `dmesg | grep -i inotify`
  - Memory pressure: `pm2 logs moltbot-gateway | grep -i memory`
  - Telegram errors: `pm2 logs moltbot-gateway | grep -i telegram`
If issue persists, reduce retry attempts in retry policy config.

---

## Deployment Checklist

- [ ] Node.js 24+ installed
- [ ] Moltbot cloned and built (`npm run build`)
- [ ] Systemd service created and enabled
- [ ] Config files populated (moltbot.json, agents/main/config.json)
- [ ] API keys in environment or .env
- [ ] Telegram bot token configured
- [ ] Gateway started: `systemctl start moltbot-gateway`
- [ ] Telegram connection verified: `node dist/entry.js channels status`
- [ ] Test message sent in Telegram

---

## Key File Locations

```
/root/moltbot/                          Main installation
├── dist/                               Compiled code (loaded at runtime)
├── src/                                TypeScript source
├── ecosystem.config.cjs                PM2 config (moltbot-gateway process)
└── README_Tech.md                      This file

~/.clawdbot/                            Config directory
├── moltbot.json                        Global gateway config
├── agents/main/
│   ├── config.json                     Agent-specific config
│   └── auth-profiles.json              API key storage
└── .env                                Environment variables

/root/.pm2/                             PM2 daemon directory
├── pids/moltbot-gateway-0.pid          Process ID file (moltbot-gateway)
└── logs/                               PM2 logs directory

/etc/sysctl.d/                          System configuration
└── 99-moltbot-inotify.conf            Inotify limit increase (filesystem watchers)

/tmp/moltbot/                           Runtime logs
├── moltbot-*.log                       Detailed application debug logs
├── pm2-out.log                         PM2 stdout log
└── pm2-error.log                       PM2 stderr/error log

/etc/systemd/system/                    Systemd services (NOT used for moltbot)
├── code-server.service                 Code editor (independent)
├── ssh.service                         SSH server (independent)
└── ...other services
```

---

**Last Updated:** Jan 29, 2026 (19:50 UTC)
**Maintained By:** Claude Code + Moltbot Task Router
**Latest:** Crash loop root cause fixed (inotify limit increased to 524288). PM2 process manager confirmed as correct, systemd conflicts removed. Gateway now running cleanly via PM2.
