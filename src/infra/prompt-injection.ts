/**
 * Prompt Injection Defense
 *
 * Detects and mitigates prompt injection attacks in user input:
 * - Pattern-based detection for common injection techniques
 * - Encoding detection (base64, unicode tricks, invisible chars)
 * - Role impersonation detection
 * - Risk scoring for graduated responses
 * - Configurable actions (log, warn, sanitize, block)
 *
 * This module complements src/security/external-content.ts which handles
 * content wrapping. This module focuses on detection and response.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("prompt-injection");

// Detection pattern categories
export type InjectionCategory =
  | "instruction_override" // "Ignore previous instructions"
  | "role_impersonation" // "[SYSTEM]:", "Assistant:"
  | "prompt_extraction" // "What are your instructions?"
  | "jailbreak" // "DAN", "Developer Mode"
  | "encoding_trick" // Base64, unicode obfuscation
  | "delimiter_attack" // Fake message boundaries
  | "command_injection"; // Shell commands, exec patterns

export type InjectionSeverity = "low" | "medium" | "high" | "critical";

export type DetectionResult = {
  detected: boolean;
  category?: InjectionCategory;
  severity?: InjectionSeverity;
  pattern?: string;
  matched?: string;
  position?: number;
};

export type ScanResult = {
  isClean: boolean;
  riskScore: number; // 0-100
  detections: DetectionResult[];
  highestSeverity?: InjectionSeverity;
  summary: string;
};

// Pattern definitions with severity and category
type PatternDef = {
  pattern: RegExp;
  category: InjectionCategory;
  severity: InjectionSeverity;
  description: string;
};

const INJECTION_PATTERNS: PatternDef[] = [
  // Instruction override attempts
  {
    pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
    category: "instruction_override",
    severity: "high",
    description: "Instruction override attempt",
  },
  {
    pattern:
      /disregard\s+(all\s+)?(your\s+)?(previous|prior|above)?\s*(instructions?|guidelines?|rules?)/i,
    category: "instruction_override",
    severity: "high",
    description: "Disregard instructions attempt",
  },
  {
    pattern:
      /forget\s+(everything|all)?\s*(your\s+)?(instructions?|rules?|guidelines?|training|restrictions?)/i,
    category: "instruction_override",
    severity: "high",
    description: "Forget instructions attempt",
  },
  {
    pattern: /override\s+(your|the|all)\s+(instructions?|rules?|restrictions?)/i,
    category: "instruction_override",
    severity: "high",
    description: "Override instructions attempt",
  },
  {
    pattern: /new\s+(instructions?|rules?|mode)\s*:/i,
    category: "instruction_override",
    severity: "medium",
    description: "New instructions declaration",
  },

  // Role impersonation
  {
    pattern: /^\s*\[?\s*(SYSTEM|ADMIN|ROOT|DEVELOPER)\s*\]?\s*:/im,
    category: "role_impersonation",
    severity: "critical",
    description: "System role impersonation",
  },
  {
    pattern: /^\s*\[?\s*(Assistant|AI|Claude|GPT)\s*\]?\s*:/im,
    category: "role_impersonation",
    severity: "high",
    description: "Assistant role impersonation",
  },
  {
    pattern: /<\/?system>/i,
    category: "role_impersonation",
    severity: "critical",
    description: "System XML tag injection",
  },
  {
    pattern: /<\/?assistant>/i,
    category: "role_impersonation",
    severity: "high",
    description: "Assistant XML tag injection",
  },
  {
    pattern: /\]\s*\n+\s*\[?(system|assistant|user)\]?\s*:/i,
    category: "delimiter_attack",
    severity: "high",
    description: "Message boundary injection",
  },

  // Prompt extraction attempts
  {
    pattern: /what\s+(are|is)\s+your\s+(system\s+)?(instructions?|prompt|rules?|guidelines?)/i,
    category: "prompt_extraction",
    severity: "medium",
    description: "Prompt extraction attempt",
  },
  {
    pattern: /repeat\s+(your\s+)?(initial|system|original)\s+(instructions?|prompt)/i,
    category: "prompt_extraction",
    severity: "medium",
    description: "Prompt repeat request",
  },
  {
    pattern: /show\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions?)/i,
    category: "prompt_extraction",
    severity: "medium",
    description: "Prompt show request",
  },
  {
    pattern: /print\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
    category: "prompt_extraction",
    severity: "medium",
    description: "Prompt print request",
  },

  // Jailbreak attempts
  {
    pattern: /\b(DAN|Do\s+Anything\s+Now)\b/i,
    category: "jailbreak",
    severity: "critical",
    description: "DAN jailbreak attempt",
  },
  {
    pattern: /developer\s+mode\s+(enabled?|activated?|on)/i,
    category: "jailbreak",
    severity: "critical",
    description: "Developer mode activation attempt",
  },
  {
    pattern: /you\s+are\s+now\s+(in\s+)?(unrestricted|uncensored|unfiltered)\s+mode/i,
    category: "jailbreak",
    severity: "critical",
    description: "Unrestricted mode attempt",
  },
  {
    pattern: /pretend\s+(you\s+)?(are|have)\s+no\s+(restrictions?|limits?|rules?)/i,
    category: "jailbreak",
    severity: "high",
    description: "Pretend no restrictions attempt",
  },
  {
    pattern:
      /act\s+as\s+(if\s+)?(you\s+)?(have\s+)?no\s+(ethical|moral)\s+(guidelines?|restrictions?)/i,
    category: "jailbreak",
    severity: "high",
    description: "Bypass ethics attempt",
  },

  // Command injection patterns
  {
    pattern: /\bexec\s*\([^)]*\)/i,
    category: "command_injection",
    severity: "high",
    description: "Exec function call",
  },
  {
    pattern: /\brm\s+-rf\b/i,
    category: "command_injection",
    severity: "critical",
    description: "Destructive rm command",
  },
  {
    pattern: /elevated\s*[:=]\s*true/i,
    category: "command_injection",
    severity: "high",
    description: "Elevated mode flag",
  },
  {
    pattern: /\$\([^)]+\)/,
    category: "command_injection",
    severity: "medium",
    description: "Shell command substitution",
  },
  {
    pattern: /`[^`]+`/,
    category: "command_injection",
    severity: "low",
    description: "Backtick command (may be code)",
  },

  // Delimiter/boundary attacks
  {
    pattern: /---\s*(end|begin)\s+(of\s+)?(system|user|assistant)/i,
    category: "delimiter_attack",
    severity: "high",
    description: "Message boundary delimiter",
  },
  {
    pattern: /={3,}\s*(system|user|assistant|prompt)/i,
    category: "delimiter_attack",
    severity: "medium",
    description: "Equals delimiter injection",
  },
];

// Encoding detection patterns
const ENCODING_PATTERNS: PatternDef[] = [
  {
    pattern: /[A-Za-z0-9+/]{20,}={0,2}/,
    category: "encoding_trick",
    severity: "low",
    description: "Potential base64 encoding",
  },
  {
    pattern: /\\u[0-9a-fA-F]{4}/,
    category: "encoding_trick",
    severity: "medium",
    description: "Unicode escape sequence",
  },
  {
    pattern: /&#x?[0-9a-fA-F]+;/,
    category: "encoding_trick",
    severity: "medium",
    description: "HTML entity encoding",
  },
  {
    pattern: /%[0-9a-fA-F]{2}/,
    category: "encoding_trick",
    severity: "low",
    description: "URL encoding",
  },
];

// Invisible/homoglyph characters
const INVISIBLE_CHARS = [
  "\u200B", // Zero-width space
  "\u200C", // Zero-width non-joiner
  "\u200D", // Zero-width joiner
  "\u2060", // Word joiner
  "\uFEFF", // Byte order mark
  "\u00AD", // Soft hyphen
];

function detectInvisibleChars(text: string): DetectionResult | null {
  for (const char of INVISIBLE_CHARS) {
    const pos = text.indexOf(char);
    if (pos !== -1) {
      return {
        detected: true,
        category: "encoding_trick",
        severity: "medium",
        pattern: "invisible_character",
        matched: `U+${char.charCodeAt(0).toString(16).toUpperCase()}`,
        position: pos,
      };
    }
  }
  return null;
}

function detectBase64Content(text: string): DetectionResult | null {
  // Look for base64 that might decode to suspicious content
  const base64Regex = /[A-Za-z0-9+/]{40,}={0,2}/g;
  let match;
  while ((match = base64Regex.exec(text)) !== null) {
    try {
      const decoded = Buffer.from(match[0], "base64").toString("utf8");
      // Check if decoded content contains suspicious patterns
      if (/ignore|system|prompt|instruction/i.test(decoded)) {
        return {
          detected: true,
          category: "encoding_trick",
          severity: "high",
          pattern: "base64_suspicious_content",
          matched: match[0].slice(0, 30) + "...",
          position: match.index,
        };
      }
    } catch {
      // Invalid base64, skip
    }
  }
  return null;
}

/**
 * Scan text for prompt injection patterns.
 */
export function scanForInjection(text: string): ScanResult {
  const detections: DetectionResult[] = [];
  let riskScore = 0;

  // Check main injection patterns
  for (const def of INJECTION_PATTERNS) {
    const match = text.match(def.pattern);
    if (match) {
      detections.push({
        detected: true,
        category: def.category,
        severity: def.severity,
        pattern: def.description,
        matched: match[0],
        position: match.index,
      });
      riskScore += severityToScore(def.severity);
    }
  }

  // Check encoding patterns
  for (const def of ENCODING_PATTERNS) {
    if (def.pattern.test(text)) {
      detections.push({
        detected: true,
        category: def.category,
        severity: def.severity,
        pattern: def.description,
      });
      riskScore += severityToScore(def.severity);
    }
  }

  // Check for invisible characters
  const invisibleResult = detectInvisibleChars(text);
  if (invisibleResult) {
    detections.push(invisibleResult);
    riskScore += severityToScore(invisibleResult.severity!);
  }

  // Check for suspicious base64 content
  const base64Result = detectBase64Content(text);
  if (base64Result) {
    detections.push(base64Result);
    riskScore += severityToScore(base64Result.severity!);
  }

  // Cap risk score at 100
  riskScore = Math.min(100, riskScore);

  // Determine highest severity
  const highestSeverity =
    detections.length > 0
      ? detections.reduce((max, d) =>
          severityToScore(d.severity!) > severityToScore(max.severity!) ? d : max,
        ).severity
      : undefined;

  // Build summary
  const summary =
    detections.length === 0
      ? "No injection patterns detected"
      : `${detections.length} potential injection pattern(s) detected`;

  return {
    isClean: detections.length === 0,
    riskScore,
    detections,
    highestSeverity,
    summary,
  };
}

function severityToScore(severity: InjectionSeverity): number {
  switch (severity) {
    case "low":
      return 5;
    case "medium":
      return 15;
    case "high":
      return 30;
    case "critical":
      return 50;
    default:
      return 0;
  }
}

// Configuration
export type PromptInjectionConfig = {
  /** Enable prompt injection scanning (default: true). */
  enabled?: boolean;
  /** Action when injection detected: 'log', 'warn', 'sanitize', 'block' (default: 'log'). */
  action?: "log" | "warn" | "sanitize" | "block";
  /** Risk score threshold for action (default: 30). */
  riskThreshold?: number;
  /** Categories to detect (default: all). */
  categories?: InjectionCategory[];
  /** Log all scans, not just detections (default: false). */
  logAllScans?: boolean;
};

export type ResolvedPromptInjectionConfig = Required<PromptInjectionConfig>;

const DEFAULT_CONFIG: ResolvedPromptInjectionConfig = {
  enabled: true,
  action: "log",
  riskThreshold: 30,
  categories: [
    "instruction_override",
    "role_impersonation",
    "prompt_extraction",
    "jailbreak",
    "encoding_trick",
    "delimiter_attack",
    "command_injection",
  ],
  logAllScans: false,
};

export function resolvePromptInjectionConfig(
  config?: Partial<PromptInjectionConfig>,
): ResolvedPromptInjectionConfig {
  return {
    enabled: config?.enabled ?? DEFAULT_CONFIG.enabled,
    action: config?.action ?? DEFAULT_CONFIG.action,
    riskThreshold: config?.riskThreshold ?? DEFAULT_CONFIG.riskThreshold,
    categories: config?.categories ?? DEFAULT_CONFIG.categories,
    logAllScans: config?.logAllScans ?? DEFAULT_CONFIG.logAllScans,
  };
}

export type ScanAndRespondResult = {
  allowed: boolean;
  scanResult: ScanResult;
  action: "none" | "logged" | "warned" | "sanitized" | "blocked";
  sanitizedText?: string;
};

/**
 * Scan text for injection and apply configured response.
 */
export function scanAndRespond(
  text: string,
  config?: Partial<PromptInjectionConfig>,
  context?: { sessionKey?: string; channel?: string; actorId?: string },
): ScanAndRespondResult {
  const resolved = resolvePromptInjectionConfig(config);

  if (!resolved.enabled) {
    return {
      allowed: true,
      scanResult: { isClean: true, riskScore: 0, detections: [], summary: "Scanning disabled" },
      action: "none",
    };
  }

  const scanResult = scanForInjection(text);

  // Filter by configured categories
  const relevantDetections = scanResult.detections.filter((d) =>
    resolved.categories.includes(d.category!),
  );
  const relevantRiskScore = relevantDetections.reduce(
    (sum, d) => sum + severityToScore(d.severity!),
    0,
  );

  // Log all scans if configured
  if (resolved.logAllScans) {
    log.debug("Prompt injection scan", {
      riskScore: relevantRiskScore,
      detections: relevantDetections.length,
      ...context,
    });
  }

  // Check if action threshold is met
  if (relevantRiskScore < resolved.riskThreshold) {
    return {
      allowed: true,
      scanResult,
      action: "none",
    };
  }

  // Apply configured action
  switch (resolved.action) {
    case "log":
      log.info("Prompt injection detected (logged)", {
        riskScore: relevantRiskScore,
        detections: relevantDetections.map((d) => d.pattern),
        ...context,
      });
      return { allowed: true, scanResult, action: "logged" };

    case "warn":
      log.warn("Prompt injection detected (warned)", {
        riskScore: relevantRiskScore,
        detections: relevantDetections.map((d) => d.pattern),
        ...context,
      });
      return { allowed: true, scanResult, action: "warned" };

    case "sanitize":
      log.warn("Prompt injection detected (sanitized)", {
        riskScore: relevantRiskScore,
        detections: relevantDetections.map((d) => d.pattern),
        ...context,
      });
      const sanitized = sanitizeText(text);
      return { allowed: true, scanResult, action: "sanitized", sanitizedText: sanitized };

    case "block":
      log.error("Prompt injection detected (blocked)", {
        riskScore: relevantRiskScore,
        detections: relevantDetections.map((d) => d.pattern),
        ...context,
      });
      return { allowed: false, scanResult, action: "blocked" };

    default:
      return { allowed: true, scanResult, action: "none" };
  }
}

/**
 * Basic text sanitization - removes or escapes suspicious patterns.
 */
function sanitizeText(text: string): string {
  let result = text;

  // Remove invisible characters
  for (const char of INVISIBLE_CHARS) {
    result = result.split(char).join("");
  }

  // Escape role impersonation patterns
  result = result.replace(/^\s*\[?(SYSTEM|ADMIN|ROOT)\]?\s*:/gim, "[ESCAPED-$1]:");
  result = result.replace(/<(\/?)system>/gi, "&lt;$1system&gt;");
  result = result.replace(/<(\/?)assistant>/gi, "&lt;$1assistant&gt;");

  // Add warning prefix if suspicious content remains
  const rescan = scanForInjection(result);
  if (!rescan.isClean && rescan.riskScore >= 30) {
    result = "[Note: This message may contain suspicious patterns]\n\n" + result;
  }

  return result;
}

/**
 * Quick check if text might need full scanning.
 * Use for performance optimization on high-volume input.
 */
export function quickCheck(text: string): boolean {
  // Quick heuristics that might indicate need for full scan
  const lowerText = text.toLowerCase();
  return (
    lowerText.includes("ignore") ||
    lowerText.includes("system") ||
    lowerText.includes("instruction") ||
    lowerText.includes("prompt") ||
    lowerText.includes("pretend") ||
    lowerText.includes("[admin]") ||
    lowerText.includes("<system>") ||
    text.includes("\u200B") || // Zero-width space
    /[A-Za-z0-9+/]{30,}/.test(text) // Potential base64
  );
}
