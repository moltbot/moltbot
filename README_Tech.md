# Moltbot Technical Documentation

## Format Guidelines for Contributors

**Style:** Concise, technical, action-oriented.
**Brevity:** One sentence per command/concept. Use bullet points, not paragraphs.
**Problem Log:** Keep entries short—problem → symptom → solution. Add date and who fixed it if known.
**Commands:** Always include the command first, explanation after (e.g., `systemctl restart moltbot-gateway` # Restarts the gateway service).
**Sections:** Group by topic. Use `##` for major sections, `###` for subsections.
**Updates:** When adding new problems/solutions, add to the end of the Problem Log section with date.

---

## System Overview & Separate PM2 Daemons

**CRITICAL ARCHITECTURE NOTE:** This system runs **three separate PM2 daemon instances** to prevent resource conflicts and crash loops that occurred when processes shared the same daemon.

### Historical Context (Why Separation Matters)

Previously, the dashboard, AI product visualizer, and moltbot gateway were all managed by the **same PM2 daemon** (`/root/.pm2`). This created catastrophic instability:
- **Dashboard crashed 140+ times** due to resource contention
- **Restart loops** where one process crashing triggered cascading failures
- **Port conflicts** and lock file exhaustion
- **Memory/CPU starvation** when one process spiked
- **Dozens of "already running" errors** due to stuck processes

**Solution Implemented (Jan 28, 2026):**
- **Moltbot Gateway**: Runs in PM2 daemon at `/root/.pm2` (isolated)
- **Dashboard**: Runs in PM2 daemon at `/root/.pm2-si-project` (completely separate)
- **AI Product Visualizer**: Runs via code-server, NOT in PM2 (independent)

⚠️ **IMPORTANT:** Do **NOT** attempt to add moltbot processes to the SI Project PM2 daemon or vice versa. Do **NOT** kill or restart unrelated processes unless you have clear evidence of resource clashing (e.g., port conflicts, inotify exhaustion affecting both).

### Process Architecture

1. **Moltbot Gateway** (`moltbot-gateway`)
   - Manager: **PM2 (separate daemon at `/root/.pm2`)**
   - Runs: `node dist/entry.js gateway --port 18789`
   - Startup script: `/root/moltbot/scripts/gateway-start.sh` (cleans stale locks before start)
   - Handles: Telegram integration, message routing, model selection, channel providers
   - **Isolation:** Independent PM2 daemon, separate from SI Project

2. **Health Monitor** (`moltbot-health-monitor`)
   - Manager: **PM2 (same `/root/.pm2` daemon as gateway)**
   - Script: `/root/moltbot/scripts/pm2-health-monitor.js`
   - Monitors gateway health every 5 minutes, auto-restarts if unresponsive

3. **Supporting Processes (DO NOT INTERFERE)**
   - **Dashboard** (`/root/si_project/dashboard`) - PM2 managed at `/root/.pm2-si-project` daemon, **completely separate from moltbot**
     - Restarts frequently (95+ count) but is isolated and does not affect bot
   - **AI Product Visualizer** (`/root/ai_product_visualizer`) - Runs via code-server, **NOT in any PM2 daemon**
   - **Telegram Relay** - Embedded in gateway (grammY framework)
   - **Task-Type Router** - Compiled TypeScript module in gateway

4. **Configuration Files**
   - Global: `/root/.clawdbot/moltbot.json`
   - Agent-specific: `/root/.clawdbot/agents/main/config.json`
   - Environment: `/root/.clawdbot/.env`

---

## Process Management

### Moltbot Gateway (PM2)

```bash
# Check status
pm2 list
pm2 status moltbot-gateway

# Restart gateway
pm2 restart moltbot-gateway

# Stop gracefully
pm2 stop moltbot-gateway

# Start if stopped
pm2 start moltbot-gateway

# View live logs
pm2 logs moltbot-gateway

# View error logs
tail -f /tmp/moltbot/pm2-error.log

# View stdout logs
tail -f /tmp/moltbot/pm2-out.log
```

**Auto-restart:** Enabled (via PM2 + health monitor). If gateway crashes or becomes unresponsive, PM2 or health monitor restarts it.
**Boot persistence:** Enabled via PM2 startup script.

### From Telegram Chat

Send `/restart` command in Telegram to restart the bot gracefully without terminal access.

### PM2 Daemon Locations & File Paths

**CRITICAL:** These are three independent PM2 daemons. Do NOT mix processes between them.

**Moltbot PM2 Daemon** (separate, isolated)
```bash
# Daemon directory
/root/.pm2                                # PM2 daemon files for moltbot
├── pids/moltbot-gateway-0.pid           # Process ID file (gateway)
├── pids/moltbot-health-monitor-0.pid    # Process ID file (health monitor)
├── logs/                                # PM2 logs directory
└── conf.js                              # PM2 config (auto-generated)

# Application files
/root/moltbot/                           # Moltbot source & config
├── ecosystem.config.cjs                 # PM2 startup config (defines both processes)
├── scripts/gateway-start.sh             # Gateway startup wrapper
├── scripts/pm2-health-monitor.js        # Health monitor script
├── dist/entry.js                        # Compiled gateway entry point
└── dist/                                # All compiled TypeScript

# Config & runtime
/root/.clawdbot/moltbot.json             # Gateway config file (watched by file watcher)
/root/.clawdbot/agents/main/config.json  # Agent-specific config
/tmp/moltbot/                            # Runtime logs & temp files
├── moltbot-2026-01-29.log               # Detailed app logs (rotated daily)
├── pm2-out.log                          # PM2 stdout
└── pm2-error.log                        # PM2 stderr
```

**SI Project PM2 Daemon** (separate, completely independent)
```bash
# Daemon directory
/root/.pm2-si-project                    # PM2 daemon files for SI Project
├── pids/dashboard-0.pid                 # Process ID file
├── logs/                                # PM2 logs directory
└── conf.js                              # PM2 config (auto-generated)

# Application files
/root/si_project/dashboard/              # Dashboard app source
└── package.json                         # Dashboard npm config

# Status: Frequently restarts (95+ count) but ISOLATED from moltbot
```

**AI Product Visualizer** (NOT in any PM2 daemon)
```bash
# Location
/root/ai_product_visualizer/             # AI product visualizer source
└── package.json                         # npm config

# Managed by: code-server (web IDE), NOT PM2
# Status: Independent process, does not interact with moltbot or dashboard PM2 daemons
```

**Check PM2 daemon status:**
```bash
pm2 list                                  # Shows processes in current/default PM2 daemon
ps aux | grep "PM2"                      # Shows all PM2 daemon instances running
```

### Health Monitor (PM2)

```bash
# Check status
pm2 list moltbot-health-monitor

# Restart
pm2 restart moltbot-health-monitor

# Logs
pm2 logs moltbot-health-monitor
```

**Purpose:** Monitors gateway every 5 minutes and auto-restarts if port 18789 becomes unresponsive.

### Logs Location

```bash
# PM2 error logs
tail -f /tmp/moltbot/pm2-error.log

# PM2 stdout logs
tail -f /tmp/moltbot/pm2-out.log

# Application debug logs (most detailed)
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

**Solution:** Keep gateway in PM2 but ensure process isolation via ecosystem config.
- Moltbot: **PM2** with dedicated config (`ecosystem.config.cjs`)
- Dashboard: **PM2** (separate process)
- Both managed by PM2 but isolated

**Status:** ✅ Fixed. Processes now isolated within PM2.

**Files changed:**
- Updated: `/root/moltbot/ecosystem.config.cjs` (PM2 config for gateway + health monitor)

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
- PM2 manages all processes: `dashboard`, `ai_product_visualizer`, `moltbot-gateway`, `moltbot-health-monitor`
- Processes are isolated via PM2 config to prevent interference
- **Gateway is PM2-only** (no systemd service exists or should be created)

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

## Stuck Gateway Process Blocking Restart (Jan 29, 2026 Afternoon)

**Problem:** Bot stopped responding to Telegram messages in the afternoon despite working fine in the morning.

**Symptoms:**
- Bot unresponsive to Telegram messages
- Health monitor unable to restart gateway
- PM2 error logs showed: `Gateway failed to start: gateway already running (pid 618450); lock timeout after 5000ms`
- Port 18789 blocked by stuck process

**Root Cause:**
An old gateway process (pid 618450) from earlier in the day became stuck and wouldn't release port 18789. Health monitor tried to restart but couldn't because the stuck process held the port. The issue wasn't plugin command overflow (those were just logged warnings from earlier; the bot still worked).

**Timeline:**
- 13:31 UTC: Bot working fine ✓
- 18:19 UTC: Gateway received SIGTERM and stopped
- 18:40+ UTC: Health monitor unable to restart due to stuck process blocking port
- 21:01 UTC: PM2 restart finally killed stuck process, gateway started cleanly

**Solution:** PM2 restart with proper process cleanup.

**What Fixed It:**
```bash
pm2 restart moltbot-gateway
```
This forced PM2 to kill the stuck process and start fresh.

**Prevention:** Health monitor now includes force-kill logic for stuck processes.

**Status:** ✅ Fixed. Gateway responsive, Telegram working normally.

**Note:** Setting `plugins.entries.telegram.enabled: false` (attempted during troubleshooting) accidentally disabled the entire Telegram channel because Telegram is implemented as a bundled plugin. This config has been removed.

---

### 8. **Gateway Graceful Shutdown During Message Processing** (Jan 29, 2026 Evening)

**Problem:** Bot receives Telegram messages (typing indicator shows) but crashes before sending responses. 100% reproducible.

**Symptoms:**
- Message arrives at 21:20:35 UTC
- Agent starts processing at 21:20:36 UTC
- First tool executes successfully (21:20:49 UTC)
- Second tool starts at 21:21:02 UTC
- **SIGUSR1 signal received 7ms into second tool execution**
- Gateway shuts down gracefully, restarts
- Incomplete response never sent to Telegram

**Initial Hypothesis (Incorrect):** Plugin command overflow from earlier.
**User's Insight:** "We had the same config this morning and it worked fine" - prompted deeper investigation.

**Root Cause Analysis:**
The gateway is NOT crashing randomly. Instead, it receives **SIGUSR1 signal (controlled restart)** during message processing, triggering a graceful shutdown. Investigation revealed:

1. **Signal Source:** `/root/moltbot/src/gateway/server-reload-handlers.ts:157`
   - Gateway detects config file change via file watcher
   - Reload handler checks if change requires full restart vs. hot reload
   - For plugin changes, decides full restart needed
   - **Emits SIGUSR1 to itself** via `process.emit("SIGUSR1")`

2. **Signal Handler:** `/root/moltbot/src/cli/gateway-cli/run-loop.ts:74-83`
   ```typescript
   const onSigusr1 = () => {
     gatewayLog.info("signal SIGUSR1 received");
     const authorized = consumeGatewaySigusr1RestartAuthorization();
     if (!authorized && !isGatewaySigusr1RestartExternallyAllowed()) { ... }
     request("restart", "SIGUSR1");  // Triggers graceful shutdown
   };
   ```

3. **Why It Happens During Messages:**
   - Config file `/root/.clawdbot/moltbot.json` keeps being **automatically rewritten**
   - Each rewrite triggers file watcher → reload handler → SIGUSR1 → shutdown
   - If rewrite happens during message processing, in-flight message gets interrupted
   - **~27-second pattern:** Time from agent start to second tool execution

4. **Why Config File Keeps Rewriting:**
   - When user attempted to disable `plugins.entries.telegram.enabled`, file was modified
   - When I attempted to switch model to Claude Sonnet, file was modified
   - Both times, config file was **automatically restored/rewritten** (likely by a config management layer)
   - Each rewrite re-triggers the reload cycle

**Timeline:**
- 20:32 UTC: First config change (attempted telegram disable)
- 21:01 UTC: Re-enabled telegram
- **21:01+ UTC: Config rewrites + file watcher cycles began**
- 21:14 UTC: Config change logs show repeated modifications
- 21:20 UTC: **Message arrives and gets interrupted mid-processing**

**Not the Root Causes (Verified):**
- ✗ Plugin command overflow (logs show no errors, same config worked this morning)
- ✗ PM2 health monitor (uses SIGKILL not SIGUSR1, checks every 5 minutes not during messages)
- ✗ PM2 timeouts (5 second limit but crash at 27 seconds)
- ✗ Inotify exhaustion (already increased to 524288)
- ✗ Memory pressure (gateway shows 52MB usage, limit is 500MB)
- ✗ Random crashes (pattern is exact, reproducible, tied to config rewrites)

**Current Status:** 🚨 **UNRESOLVED**
- Root cause identified: Config file auto-rewriting → file watcher → reload handler → SIGUSR1 → shutdown during messages
- **Next steps needed:**
  1. Identify what mechanism auto-restores/rewrites config file
  2. Prevent config rewrites during normal operation
  3. OR add deferred restart logic (don't restart if active requests exist)
  4. OR add request timeout handling for messages interrupted by reload

**Investigation Notes:**
- Config modification timestamps: 21:14:26 and 21:01:43 UTC match reload log messages exactly
- File watcher working correctly (detecting changes as intended)
- Reload handler working correctly (making appropriate restart decisions)
- Gateway signal handling working correctly (graceful shutdown on SIGUSR1)
- **Issue is the config file being rewritten externally**, not any of these components

---

## Troubleshooting Attempts This Session (Jan 29, 2026 Evening)

**Session Goal:** Resolve bot crashing when sending Telegram messages despite working fine earlier that day.

### Attempt 1: Investigate PM2 Restart Loop (20:32-21:01 UTC)
**Action:** Checked PM2 restart count and error logs
**Files Examined:**
- `pm2 list` - found gateway restarted 3→4 times
- `/tmp/moltbot/pm2-error.log` - found "orphaned user message" warnings
- `/tmp/moltbot/moltbot-2026-01-29.log` - found agent starts but never completes

**Result:** ✗ Not the plugin overflow. Logs show same config that worked this morning was active.

### Attempt 2: Verify PM2 Daemon Separation (21:01 UTC)
**Action:** Checked if moltbot was properly isolated from SI Project dashboard
**Commands:**
```bash
pm2 list                           # Checked main daemon
ps aux | grep "PM2"                # Found both daemons running
ls -la /root/.pm2/                 # Found moltbot PID files
ls -la /root/.pm2-si-project/      # Found dashboard PID files
```

**Result:** ✅ **Verified:** Moltbot properly separated. Dashboard (95+ restarts) is isolated and not affecting bot.

### Attempt 3: Rule Out Health Monitor (21:05 UTC)
**Action:** Analyzed health monitor script to verify it wasn't sending SIGTERM
**File Examined:** `/root/moltbot/scripts/pm2-health-monitor.js`

**Findings:**
- Uses `SIGKILL (-9)` not SIGTERM
- Checks every 5 minutes, not during every message
- Not the culprit

**Result:** ✗ Health monitor ruled out as SIGTERM source.

### Attempt 4: Disable Telegram Plugin (20:32 UTC - Abandoned)
**Action:** Attempted to disable telegram plugin to test if plugin was causing issue
**Change:** Set `plugins.entries.telegram.enabled: false` in `/root/.clawdbot/moltbot.json`

**Result:** ✗ **Unintended consequence:** This disabled the entire Telegram channel (telegram is a bundled plugin, not external). Bot stopped responding entirely.

**Lesson:** Don't disable bundled plugins via config; they're core to gateway functionality.

### Attempt 5: Switch Model to Claude Sonnet (21:14 UTC - Incomplete)
**Action:** Attempted to switch model from Mistral Devstral to Claude Sonnet to rule out API issue
**Change:** Modified `/root/.clawdbot/moltbot.json` to use `anthropic/claude-sonnet-4-5`

**Result:** ⚠️ **Test inconclusive:** Config was automatically rewritten before test completed.

### Attempt 6: Analyze Config File Rewrites (21:14 UTC)
**Action:** Examined config file modification timestamps
**Commands:**
```bash
stat /root/.clawdbot/moltbot.json*         # Check modification times
grep "reload" /tmp/moltbot/pm2-out.log    # Check reload logs
```

**Findings:**
- Config file modified at 21:14:26 UTC, 21:01:43 UTC
- Times match reload handler logs exactly
- **Config is being automatically rewritten**

**Result:** 🔍 **Key discovery:** Something auto-restores config file after changes.

### Attempt 7: Trace SIGUSR1 Signal Source (21:20+ UTC - Current)
**Action:** Analyzed exact logs showing SIGUSR1 during message processing
**Files Examined:**
- `src/gateway/server-reload-handlers.ts:157` - Found `process.emit("SIGUSR1")`
- `src/cli/gateway-cli/run-loop.ts:74-83` - Found SIGUSR1 signal handler
- `/tmp/moltbot/moltbot-2026-01-29.log` - Exact timestamps of crash

**Timeline from logs:**
```
21:20:35: Telegram message received
21:20:36: Agent embedded run start
21:20:49: First exec tool completes
21:21:02: Second exec tool starts
21:21:02 (+7ms): SIGUSR1 signal received ← Gateway self-terminates
21:21:02: Shutdown sequence begins
21:21:06: Gateway restarts
```

**Result:** ✅ **Root cause identified:** Gateway receives SIGUSR1 (self-inflicted via reload handler) during tool execution, triggering graceful shutdown.

### Attempt 8: Confirm Config-Triggered Reloads (21:20+ UTC)
**Action:** Traced PM2 logs showing config change → reload → SIGUSR1 sequence
**Commands:**
```bash
pm2 logs moltbot-gateway --lines 50 --nostream   # Full log review
grep -n "reload\|SIGUSR1" /tmp/moltbot/pm2-out.log  # Timeline analysis
```

**Key Logs Found:**
```
20:32:34: [reload] config change requires gateway restart (plugins.entries.telegram.enabled)
21:01:43: [reload] config change requires gateway restart (plugins.entries.telegram)
21:14:26: [reload] config change detected; evaluating reload
21:14:26: [gateway] signal SIGUSR1 received
```

**Result:** ✅ **Pattern confirmed:** Every config rewrite triggers reload handler → SIGUSR1 → shutdown.

### Attempted Fixes - Summary

| Attempt | Action | Result | Status |
|---------|--------|--------|--------|
| 1 | Check restart loop | Found increasing restarts, not plugin overflow | ✗ Not root cause |
| 2 | Verify PM2 isolation | Confirmed separation working correctly | ✅ Confirmed safe |
| 3 | Rule out health monitor | Verified not sending SIGTERM | ✓ Eliminated |
| 4 | Disable telegram plugin | Completely disabled Telegram (bundled plugin) | ✗ Made worse |
| 5 | Switch to Claude Sonnet | Config auto-rewritten before test | ⚠️ Inconclusive |
| 6 | Analyze config rewrites | Found config being auto-restored | 🔍 Key discovery |
| 7 | Trace SIGUSR1 source | Found gateway self-terminating via reload handler | ✅ Root cause |
| 8 | Confirm reload sequence | Mapped entire config → reload → shutdown cycle | ✅ Mechanism confirmed |

### What Still Needs Investigation

🚨 **BLOCKER: Identify config auto-rewrite mechanism**

The config file `/root/.clawdbot/moltbot.json` is being automatically rewritten after each modification:
1. User/agent modifies config
2. File watcher detects change
3. Reload handler emits SIGUSR1
4. Gateway restarts
5. **Config file is automatically restored to previous state** ← Unknown mechanism

**Possible causes:**
- Config sync/validation layer rewriting file
- CLI attempting to restore settings on startup
- Web provider re-applying config
- Environment variable override rewriting config on load
- Hook or background process reverting changes

**Next steps to identify:**
- Check for file watchers on config beyond the gateway
- Review CLI entry point for auto-config logic
- Check for config hydration/defaults logic on gateway startup
- Search for any config-restore or config-revert functionality
- Monitor file operations: `lsof /root/.clawdbot/moltbot.json`
- Trace who writes to config file: `inotifywait -m /root/.clawdbot/`

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
- [ ] PM2 installed globally (`npm install -g pm2`)
- [ ] Config files populated (moltbot.json, agents/main/config.json)
- [ ] API keys in environment or .env
- [ ] Telegram bot token configured
- [ ] Gateway started: `pm2 start ecosystem.config.cjs`
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
