import { logDebug } from "../logger.js";

import { formatBonjourError } from "./bonjour-errors.js";

// Error patterns from @homebridge/ciao that should not crash the gateway
// These are typically transient network/mDNS issues that resolve on their own
const BONJOUR_TRANSIENT_ERRORS = [
  "CIAO ANNOUNCEMENT CANCELLED",
  "REACHED ILLEGAL STATE", // IPv4 address changes during network interface churn
  "IPV4 ADDRESS CHANGED",
  "IPV6 ADDRESS CHANGED",
  "MDNSSERVER",
  "NETWORK INTERFACE", // Network interface changes (sleep/wake, WiFi reconnect)
];

export function ignoreCiaoCancellationRejection(reason: unknown): boolean {
  const message = formatBonjourError(reason).toUpperCase();
  const errorName = reason instanceof Error ? reason.name?.toUpperCase() : "";

  // Check for transient mDNS/Bonjour error patterns
  const isTransientError = BONJOUR_TRANSIENT_ERRORS.some((pattern) => message.includes(pattern));

  // Also catch AssertionError from MDNServer (common during network changes)
  // Note: The error message typically contains "MDNSServer" in the stack trace
  const isAssertionError = errorName === "ASSERTIONERROR" && message.includes("MDNSSERVER");

  if (!isTransientError && !isAssertionError) {
    return false;
  }

  logDebug(`bonjour: ignoring unhandled ciao rejection: ${formatBonjourError(reason)}`);
  return true;
}
