/**
 * Security event types and schemas
 */

export type SecurityEventSeverity = "info" | "warn" | "critical";

export type SecurityEventCategory =
  | "authentication"
  | "authorization"
  | "rate_limit"
  | "intrusion_attempt"
  | "ssrf_block"
  | "pairing"
  | "file_access"
  | "command_execution"
  | "network_access"
  | "configuration";

export type SecurityEventOutcome = "allow" | "deny" | "alert";

export interface SecurityEvent {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Unique event ID (UUID) */
  eventId: string;
  /** Event severity level */
  severity: SecurityEventSeverity;
  /** Event category */
  category: SecurityEventCategory;

  // Context
  /** Client IP address */
  ip: string;
  /** Device ID (if authenticated) */
  deviceId?: string;
  /** User ID (if authenticated) */
  userId?: string;
  /** User agent string */
  userAgent?: string;

  // Event details
  /** Action performed (e.g., 'auth_failed', 'rate_limit_exceeded') */
  action: string;
  /** Resource accessed (e.g., '/hooks/agent', 'gateway_auth') */
  resource: string;
  /** Outcome of the security check */
  outcome: SecurityEventOutcome;

  // Metadata
  /** Additional event-specific details */
  details: Record<string, unknown>;
  /** Detected attack pattern (if intrusion detected) */
  attackPattern?: string;

  // Audit trail
  /** Request ID for correlation */
  requestId?: string;
  /** Session ID for correlation */
  sessionId?: string;
}

/**
 * Predefined action types for common security events
 */
export const SecurityActions = {
  // Authentication
  AUTH_FAILED: "auth_failed",
  AUTH_SUCCESS: "auth_success",
  TOKEN_MISMATCH: "token_mismatch",
  PASSWORD_MISMATCH: "password_mismatch",
  TAILSCALE_AUTH_FAILED: "tailscale_auth_failed",
  DEVICE_AUTH_FAILED: "device_auth_failed",

  // Rate limiting
  RATE_LIMIT_EXCEEDED: "rate_limit_exceeded",
  RATE_LIMIT_WARNING: "rate_limit_warning",
  CONNECTION_LIMIT_EXCEEDED: "connection_limit_exceeded",

  // Intrusion detection
  BRUTE_FORCE_DETECTED: "brute_force_detected",
  SSRF_BYPASS_ATTEMPT: "ssrf_bypass_attempt",
  PATH_TRAVERSAL_ATTEMPT: "path_traversal_attempt",
  PORT_SCANNING_DETECTED: "port_scanning_detected",
  COMMAND_INJECTION_ATTEMPT: "command_injection_attempt",

  // IP management
  IP_BLOCKED: "ip_blocked",
  IP_UNBLOCKED: "ip_unblocked",
  IP_ALLOWLISTED: "ip_allowlisted",
  IP_REMOVED_FROM_ALLOWLIST: "ip_removed_from_allowlist",

  // Pairing
  PAIRING_REQUEST_CREATED: "pairing_request_created",
  PAIRING_APPROVED: "pairing_approved",
  PAIRING_DENIED: "pairing_denied",
  PAIRING_CODE_INVALID: "pairing_code_invalid",
  PAIRING_RATE_LIMIT: "pairing_rate_limit",

  // Authorization
  ACCESS_DENIED: "access_denied",
  PERMISSION_DENIED: "permission_denied",
  COMMAND_DENIED: "command_denied",

  // Configuration
  SECURITY_SHIELD_ENABLED: "security_shield_enabled",
  SECURITY_SHIELD_DISABLED: "security_shield_disabled",
  FIREWALL_RULE_ADDED: "firewall_rule_added",
  FIREWALL_RULE_REMOVED: "firewall_rule_removed",
} as const;

/**
 * Predefined attack patterns
 */
export const AttackPatterns = {
  BRUTE_FORCE: "brute_force",
  SSRF_BYPASS: "ssrf_bypass",
  PATH_TRAVERSAL: "path_traversal",
  PORT_SCANNING: "port_scanning",
  COMMAND_INJECTION: "command_injection",
  TOKEN_ENUMERATION: "token_enumeration",
  CREDENTIAL_STUFFING: "credential_stuffing",
} as const;
