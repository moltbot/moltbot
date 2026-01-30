# CRITICAL: EBADF spawn failures break production deployments on macOS

## Summary

OpenClaw experiences frequent `spawn EBADF` errors on macOS that completely break command execution. The current fallback mechanism is **insufficient** and causes **cascading failures** in production.

## The Problem

Node.js `spawn()` fails with `EBADF` (Bad File Descriptor, errno=-9) on macOS, particularly in long-running daemon processes like OpenClaw gateway.

```
spawn EBADF syscall=spawn errno=-9
```

### Root Cause

The EBADF error occurs during **pipe creation** for stdio. When libuv tries to create pipes for stdin/stdout/stderr, it fails if there are file descriptor issues (exhaustion, corruption, inherited invalid FDs).

### Current Behavior

The current `spawn-utils.ts` has no effective fallback. When normal spawn fails with EBADF, all subsequent spawns also fail, making the agent completely unable to execute commands.

## Impact

- **100% command failure rate** when EBADF starts occurring
- Agent cannot use tools (read, bash, edit, write all break)
- Only fix is restarting the gateway process
- Occurs frequently on macOS, especially after hours of uptime

## Proposed Fix

Add an **async file-capture fallback** that bypasses pipe creation entirely:

1. When normal spawn fails with EBADF, fall back to `stdio: "ignore"`
2. Redirect stdout/stderr to temp files via shell wrapper
3. Read files after process completes and replay to fake streams
4. Return a ChildProcess-compatible object

### Why This Works

- `stdio: "ignore"` tells libuv to **skip pipe creation** entirely
- The actual output capture happens via shell redirection (`>file 2>file`)
- This is fully async (does NOT block the event loop)
- Compatible with existing ChildProcess consumers

### Trade-offs

| Aspect | Normal Spawn | File-Capture Fallback |
|--------|--------------|----------------------|
| Streaming output | ✅ Real-time | ❌ After completion |
| Event loop | ✅ Non-blocking | ✅ Non-blocking |
| Stdin support | ✅ Full | ❌ No stdin pipe |
| Performance | ✅ Native | ⚠️ File I/O overhead |

The fallback only activates when normal spawn fails, so there's no impact on systems that don't experience EBADF.

## Previous Attempts

I previously attempted to fix this with `spawnSync` + file capture, but that **blocks the entire event loop** for the duration of the command (potentially minutes). This caused:

- Discord/Telegram/WebSocket disconnections
- Missed heartbeats
- Message queue floods when the sync call returned

The async approach solves all of these issues.

## Request

This is causing significant problems in production. Please consider merging the async file-capture fallback as it:

1. Only activates when needed (no impact on healthy systems)
2. Is fully async (no event loop blocking)
3. Provides graceful degradation instead of complete failure
