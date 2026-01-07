import { Cron } from "croner";
import type { CronSchedule } from "./types.js";

/**
 * Compute the next run time for a cron schedule
 */
export function computeNextRunAtMs(
  schedule: CronSchedule,
  nowMs: number,
): number | undefined {
  if (schedule.kind === "at") {
    return schedule.atMs > nowMs ? schedule.atMs : undefined;
  }

  if (schedule.kind === "every") {
    const everyMs = Math.max(1, Math.floor(schedule.everyMs));
    const anchor = Math.max(0, Math.floor(schedule.anchorMs ?? nowMs));
    if (nowMs < anchor) return anchor;
    const elapsed = nowMs - anchor;
    const steps = Math.max(1, Math.floor((elapsed + everyMs - 1) / everyMs));
    return anchor + steps * everyMs;
  }

  // Cron expression
  const expr = schedule.expr.trim();
  if (!expr) return undefined;
  const cron = new Cron(expr, {
    timezone: schedule.tz?.trim() || undefined,
    catch: false,
  });
  const next = cron.nextRun(new Date(nowMs));
  return next ? next.getTime() : undefined;
}

/**
 * Validate a cron expression
 */
export function isValidCronExpr(expr: string, tz?: string): boolean {
  try {
    new Cron(expr.trim(), {
      timezone: tz?.trim() || undefined,
      catch: false,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get human-readable description of next run
 */
export function describeNextRun(schedule: CronSchedule, nowMs: number): string {
  const nextMs = computeNextRunAtMs(schedule, nowMs);
  if (!nextMs) return "never";

  const diffMs = nextMs - nowMs;
  if (diffMs < 1000) return "now";
  if (diffMs < 60_000) return `in ${Math.round(diffMs / 1000)}s`;
  if (diffMs < 3600_000) return `in ${Math.round(diffMs / 60_000)}m`;
  if (diffMs < 86400_000) return `in ${Math.round(diffMs / 3600_000)}h`;
  return `in ${Math.round(diffMs / 86400_000)}d`;
}
