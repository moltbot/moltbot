/**
 * Security event logger
 * Writes security events to a separate log file for audit trail
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { SecurityEvent, SecurityEventSeverity, SecurityEventCategory, SecurityEventOutcome } from "./schema.js";
import { DEFAULT_LOG_DIR } from "../../logging/logger.js";
import { getChildLogger } from "../../logging/index.js";

const SECURITY_LOG_PREFIX = "security";
const SECURITY_LOG_SUFFIX = ".jsonl";

/**
 * Format date as YYYY-MM-DD for log file naming
 */
function formatLocalDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Get security log file path for today
 */
function getSecurityLogPath(): string {
  const dateStr = formatLocalDate(new Date());
  return path.join(DEFAULT_LOG_DIR, `${SECURITY_LOG_PREFIX}-${dateStr}${SECURITY_LOG_SUFFIX}`);
}

/**
 * Security event logger
 * Provides centralized logging for all security-related events
 */
class SecurityEventLogger {
  private logger = getChildLogger({ subsystem: "security" });
  private enabled = true;

  /**
   * Log a security event
   * Events are written to both the security log file and the main logger
   */
  logEvent(event: Omit<SecurityEvent, "timestamp" | "eventId">): void {
    if (!this.enabled) return;

    const fullEvent: SecurityEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      eventId: randomUUID(),
    };

    // Write to security log file (append-only, immutable)
    this.writeToSecurityLog(fullEvent);

    // Also log to main logger for OTEL export and console output
    this.logToMainLogger(fullEvent);
  }

  /**
   * Log an authentication event
   */
  logAuth(params: {
    action: string;
    ip: string;
    outcome: SecurityEventOutcome;
    severity: SecurityEventSeverity;
    resource: string;
    details?: Record<string, unknown>;
    deviceId?: string;
    userId?: string;
    userAgent?: string;
    requestId?: string;
  }): void {
    this.logEvent({
      severity: params.severity,
      category: "authentication",
      ip: params.ip,
      deviceId: params.deviceId,
      userId: params.userId,
      userAgent: params.userAgent,
      action: params.action,
      resource: params.resource,
      outcome: params.outcome,
      details: params.details ?? {},
      requestId: params.requestId,
    });
  }

  /**
   * Log a rate limit event
   */
  logRateLimit(params: {
    action: string;
    ip: string;
    outcome: SecurityEventOutcome;
    severity: SecurityEventSeverity;
    resource: string;
    details?: Record<string, unknown>;
    deviceId?: string;
    requestId?: string;
  }): void {
    this.logEvent({
      severity: params.severity,
      category: "rate_limit",
      ip: params.ip,
      deviceId: params.deviceId,
      action: params.action,
      resource: params.resource,
      outcome: params.outcome,
      details: params.details ?? {},
      requestId: params.requestId,
    });
  }

  /**
   * Log an intrusion attempt
   */
  logIntrusion(params: {
    action: string;
    ip: string;
    resource: string;
    attackPattern?: string;
    details?: Record<string, unknown>;
    deviceId?: string;
    userAgent?: string;
    requestId?: string;
  }): void {
    this.logEvent({
      severity: "critical",
      category: "intrusion_attempt",
      ip: params.ip,
      deviceId: params.deviceId,
      userAgent: params.userAgent,
      action: params.action,
      resource: params.resource,
      outcome: "deny",
      details: params.details ?? {},
      attackPattern: params.attackPattern,
      requestId: params.requestId,
    });
  }

  /**
   * Log an IP management event
   */
  logIpManagement(params: {
    action: string;
    ip: string;
    severity: SecurityEventSeverity;
    details?: Record<string, unknown>;
  }): void {
    this.logEvent({
      severity: params.severity,
      category: "network_access",
      ip: params.ip,
      action: params.action,
      resource: "ip_manager",
      outcome: "alert",
      details: params.details ?? {},
    });
  }

  /**
   * Log a pairing event
   */
  logPairing(params: {
    action: string;
    ip: string;
    outcome: SecurityEventOutcome;
    severity: SecurityEventSeverity;
    details?: Record<string, unknown>;
    userId?: string;
  }): void {
    this.logEvent({
      severity: params.severity,
      category: "pairing",
      ip: params.ip,
      userId: params.userId,
      action: params.action,
      resource: "pairing",
      outcome: params.outcome,
      details: params.details ?? {},
    });
  }

  /**
   * Enable/disable security logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Write event to security log file (JSONL format)
   */
  private writeToSecurityLog(event: SecurityEvent): void {
    try {
      const logPath = getSecurityLogPath();
      const logDir = path.dirname(logPath);

      // Ensure log directory exists
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
      }

      // Append event as single line JSON
      const line = JSON.stringify(event) + "\n";
      fs.appendFileSync(logPath, line, { encoding: "utf8", mode: 0o600 });
    } catch (err) {
      // Never block on logging failures, but log to main logger
      this.logger.error("Failed to write security event to log file", { error: String(err) });
    }
  }

  /**
   * Log event to main logger for OTEL export and console output
   */
  private logToMainLogger(event: SecurityEvent): void {
    const logMethod = event.severity === "critical" ? "error" : event.severity === "warn" ? "warn" : "info";

    this.logger[logMethod](`[${event.category}] ${event.action}`, {
      eventId: event.eventId,
      ip: event.ip,
      resource: event.resource,
      outcome: event.outcome,
      ...(event.attackPattern && { attackPattern: event.attackPattern }),
      ...(event.details && Object.keys(event.details).length > 0 && { details: event.details }),
    });
  }
}

/**
 * Singleton security logger instance
 */
export const securityLogger = new SecurityEventLogger();

/**
 * Get security log file path for a specific date
 */
export function getSecurityLogPathForDate(date: Date): string {
  const dateStr = formatLocalDate(date);
  return path.join(DEFAULT_LOG_DIR, `${SECURITY_LOG_PREFIX}-${dateStr}${SECURITY_LOG_SUFFIX}`);
}

/**
 * Read security events from log file
 */
export function readSecurityEvents(params: {
  date?: Date;
  severity?: SecurityEventSeverity;
  category?: SecurityEventCategory;
  limit?: number;
}): SecurityEvent[] {
  const { date = new Date(), severity, category, limit = 1000 } = params;
  const logPath = getSecurityLogPathForDate(date);

  if (!fs.existsSync(logPath)) {
    return [];
  }

  const content = fs.readFileSync(logPath, "utf8");
  const lines = content.trim().split("\n").filter(Boolean);
  const events: SecurityEvent[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as SecurityEvent;

      // Apply filters
      if (severity && event.severity !== severity) continue;
      if (category && event.category !== category) continue;

      events.push(event);

      // Stop if we've reached the limit
      if (events.length >= limit) break;
    } catch {
      // Skip invalid JSON lines
      continue;
    }
  }

  return events;
}
