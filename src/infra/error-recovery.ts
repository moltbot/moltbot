import {
  isAuthErrorMessage,
  isBillingErrorMessage,
  isCloudCodeAssistFormatError,
  isCompactionFailureError,
  isLikelyContextOverflowError,
  isOverloadedErrorMessage,
  isRateLimitErrorMessage,
  isTimeoutErrorMessage,
  parseImageDimensionError,
  parseImageSizeError,
} from "../agents/pi-embedded-helpers.js";

export type RecoveryCategory =
  | "auth"
  | "billing"
  | "rate_limit"
  | "overloaded"
  | "timeout"
  | "context_overflow"
  | "compaction_failed"
  | "format"
  | "image_too_large"
  | "image_dimensions"
  | "model_unavailable"
  | "unknown";

export type RecoveryDocs = {
  label: string;
  path: string;
};

export type RecoveryInfo = {
  category: RecoveryCategory;
  title: string;
  suggestions: string[];
  docs?: RecoveryDocs[];
};

const MODEL_UNAVAILABLE_RE =
  /model (?:not available|not supported|unavailable|unknown|not found)|no matching model|does not support this model/i;

export function classifyRecoveryCategory(raw?: string): RecoveryCategory {
  const message = (raw ?? "").trim();
  if (!message) return "unknown";

  if (parseImageDimensionError(message)) return "image_dimensions";
  if (parseImageSizeError(message)) return "image_too_large";
  if (isCompactionFailureError(message)) return "compaction_failed";
  if (isLikelyContextOverflowError(message)) return "context_overflow";
  if (isAuthErrorMessage(message)) return "auth";
  if (isBillingErrorMessage(message)) return "billing";
  if (isRateLimitErrorMessage(message)) return "rate_limit";
  if (isOverloadedErrorMessage(message)) return "overloaded";
  if (isTimeoutErrorMessage(message)) return "timeout";
  if (isCloudCodeAssistFormatError(message)) return "format";
  if (MODEL_UNAVAILABLE_RE.test(message)) return "model_unavailable";
  return "unknown";
}

const RECOVERY_MAP: Record<RecoveryCategory, RecoveryInfo> = {
  auth: {
    category: "auth",
    title: "Authentication failed",
    suggestions: [
      "Verify the provider API key or OAuth token in your config.",
      "Re-run onboarding or refresh the auth profile if it expired.",
      "Confirm the gateway token/password matches the server.",
    ],
    docs: [
      { label: "Auth setup", path: "/gateway/authentication" },
      { label: "Model providers", path: "/concepts/model-providers" },
    ],
  },
  billing: {
    category: "billing",
    title: "Billing or quota issue",
    suggestions: [
      "Check remaining credits or billing status for the provider.",
      "Switch to a different provider/model profile temporarily.",
      "Reduce usage or concurrency and retry.",
    ],
    docs: [
      { label: "Usage tracking", path: "/concepts/usage-tracking" },
      { label: "Model failover", path: "/concepts/model-failover" },
    ],
  },
  rate_limit: {
    category: "rate_limit",
    title: "Rate limit reached",
    suggestions: [
      "Wait a moment and retry the request.",
      "Reduce concurrency or shorten the prompt.",
      "Switch to another model/provider if available.",
    ],
    docs: [
      { label: "Retry strategy", path: "/concepts/retry" },
      { label: "Model failover", path: "/concepts/model-failover" },
    ],
  },
  overloaded: {
    category: "overloaded",
    title: "Service overloaded",
    suggestions: [
      "Retry after a short delay.",
      "Use a lighter or alternative model.",
      "Reduce input size to speed up processing.",
    ],
    docs: [
      { label: "Retry strategy", path: "/concepts/retry" },
      { label: "Models", path: "/concepts/models" },
    ],
  },
  timeout: {
    category: "timeout",
    title: "Request timed out",
    suggestions: [
      "Retry the request; temporary network issues can cause timeouts.",
      "Reduce prompt size or disable heavy tools.",
      "Pick a faster model for long-running tasks.",
    ],
    docs: [
      { label: "Context limits", path: "/concepts/context" },
      { label: "Models", path: "/concepts/models" },
    ],
  },
  context_overflow: {
    category: "context_overflow",
    title: "Context window exceeded",
    suggestions: [
      "Shorten the prompt or remove large attachments.",
      "Start a new session to reset context.",
      "Choose a larger-context model or enable compaction.",
    ],
    docs: [
      { label: "Context limits", path: "/concepts/context" },
      { label: "Compaction", path: "/concepts/compaction" },
    ],
  },
  compaction_failed: {
    category: "compaction_failed",
    title: "Compaction failed",
    suggestions: [
      "Start a new session to reset context.",
      "Trim the prompt and retry.",
      "Switch to a larger-context model if possible.",
    ],
    docs: [
      { label: "Compaction", path: "/concepts/compaction" },
      { label: "Sessions", path: "/concepts/session" },
    ],
  },
  format: {
    category: "format",
    title: "Request format error",
    suggestions: [
      "Retry the request; some providers are strict about schemas.",
      "Reduce tool output size or simplify tool inputs.",
      "Switch to a model that supports the required tool schema.",
    ],
    docs: [
      { label: "Messages format", path: "/concepts/messages" },
      { label: "Models", path: "/concepts/models" },
    ],
  },
  image_too_large: {
    category: "image_too_large",
    title: "Image file too large",
    suggestions: [
      "Compress the image to a smaller file size.",
      "Send fewer images in the same request.",
      "Try a model with higher image size limits.",
    ],
    docs: [{ label: "Messages format", path: "/concepts/messages" }],
  },
  image_dimensions: {
    category: "image_dimensions",
    title: "Image dimensions exceed limits",
    suggestions: [
      "Resize the image to fit the model limits.",
      "Crop large images before sending.",
      "Reduce the number of images per request.",
    ],
    docs: [{ label: "Messages format", path: "/concepts/messages" }],
  },
  model_unavailable: {
    category: "model_unavailable",
    title: "Model not available",
    suggestions: [
      "Select a different model or provider.",
      "Check the configured model name for typos.",
      "Ensure the provider account has access to the model.",
    ],
    docs: [
      { label: "Models", path: "/concepts/models" },
      { label: "Model providers", path: "/concepts/model-providers" },
    ],
  },
  unknown: {
    category: "unknown",
    title: "Something went wrong",
    suggestions: [
      "Retry the request.",
      "Check logs for more details.",
      "If it persists, try a new session or model.",
    ],
    docs: [
      { label: "Troubleshooting", path: "/help/troubleshooting" },
      { label: "FAQ", path: "/help/faq" },
    ],
  },
};

export function getRecoveryInfo(raw?: string): RecoveryInfo | null {
  const category = classifyRecoveryCategory(raw);
  return RECOVERY_MAP[category] ?? null;
}
