export {
  classifyRecoveryCategory,
  getRecoveryInfo,
} from "../../../src/infra/error-recovery.js";
export type {
  RecoveryCategory,
  RecoveryDocs,
  RecoveryInfo,
} from "../../../src/infra/error-recovery.js";

export function formatPrimaryErrorMessage(raw?: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "Unknown error.";
  return trimmed.length > 600 ? `${trimmed.slice(0, 600)}…` : trimmed;
}
