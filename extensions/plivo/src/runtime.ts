/**
 * Plivo Runtime State Management
 */

import type { PlivoRuntimeState } from "./types.js";

// Runtime reference from Clawdbot plugin API
let plivoRuntime: unknown = null;

// Per-account runtime state
const accountStates = new Map<string, PlivoRuntimeState>();

export function setPlivoRuntime(runtime: unknown): void {
  plivoRuntime = runtime;
}

export function getPlivoRuntime(): unknown {
  return plivoRuntime;
}

export function setAccountState(accountId: string, state: PlivoRuntimeState): void {
  accountStates.set(accountId, state);
}

export function getAccountState(accountId: string): PlivoRuntimeState | undefined {
  return accountStates.get(accountId);
}

export function removeAccountState(accountId: string): void {
  accountStates.delete(accountId);
}

export function getAllAccountStates(): Map<string, PlivoRuntimeState> {
  return accountStates;
}
