Fixes #4929

## Summary

Adds an async file-capture fallback for EBADF spawn failures on macOS.

## The Problem

On macOS, `spawn()` frequently fails with `EBADF` (Bad File Descriptor) when creating stdio pipes. This completely breaks command execution, making the agent unable to use any tools.

## The Solution

When normal spawn fails with EBADF, fall back to a file-capture approach:

1. Spawn with `stdio: "ignore"` (bypasses pipe creation)
2. Redirect stdout/stderr to temp files via shell wrapper
3. Read files after completion and replay to fake streams
4. Return a ChildProcess-compatible object

This is **fully async** and does not block the event loop.

## Changes

- `src/process/spawn-utils.ts`: Add `createFileCaptureChild()` and `spawnWithFileCapture()` functions, integrate as final fallback in `spawnWithFallback()`

## Testing

The fallback only activates when normal spawn fails with EBADF. On healthy systems, there is no change in behavior.

To test the fallback path specifically:
1. Force EBADF by exhausting file descriptors
2. Verify spawn still works via file-capture
3. Verify event loop stays responsive during execution
