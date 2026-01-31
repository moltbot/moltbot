import type { HipocapConfig } from "../../config/types.hipocap.js";

export type { HipocapConfig };

export type ThreatCategory =
  | "S1" // Violent Crimes
  | "S2" // Non-Violent Crimes
  | "S3" // Sex-Related Crimes
  | "S4" // Child Sexual Exploitation
  | "S5" // Defamation
  | "S6" // Specialized Advice
  | "S7" // Privacy
  | "S8" // Intellectual Property
  | "S9" // Indiscriminate Weapons
  | "S10" // Hate
  | "S11" // Suicide & Self-Harm
  | "S12" // Sexual Content
  | "S13" // Elections
  | "S14"; // Code Interpreter Abuse

export type Severity = "safe" | "low" | "medium" | "high" | "critical";
export type Decision = "ALLOWED" | "BLOCKED" | "REVIEW_REQUIRED" | "ALLOWED_WITH_WARNING";

export interface AnalysisRequest {
  function_name: string;
  function_result?: any;
  function_args?: any;
  user_query?: string;
  user_role?: string;

  // Analysis flags
  input_analysis?: boolean;
  llm_analysis?: boolean;
  quarantine_analysis?: boolean; // aka require_quarantine
  enable_keyword_detection?: boolean;
  keywords?: string[];

  // Configuration
  policy_key?: string;
  quick_analysis?: boolean;
}

export interface ShieldRequest {
  shield_key: string;
  content: string;
  require_reason?: boolean;
}

export interface AnalysisResponse {
  final_decision: Decision;
  safe_to_use: boolean;
  reason?: string;
  blocked_at?: "input_analysis" | "llm_analysis" | "quarantine_analysis" | "policy" | null;
  final_score?: number;

  // Detailed scores
  input_analysis?: {
    score: number;
    decision: "PASS" | "BLOCK" | "REVIEW";
    combined_score?: number;
    combined_severity?: Severity;
    timestamp?: number;
  };
  llm_analysis?: {
    risk_score: number;
    decision: "PASS" | "BLOCK" | "REVIEW";
    score?: number;
    severity?: Severity;
    timestamp?: number;
  };
  quarantine_analysis?: {
    score: number;
    decision: "PASS" | "BLOCK" | "REVIEW";
    combined_score?: number;
    combined_severity?: Severity;
  };

  threat_indicators?: ThreatCategory[];
  detected_patterns?: string[];
  policy_violations?: string[];
  severity?: Severity;
  review_required?: boolean;
  rbac_blocked?: boolean;
  chaining_blocked?: boolean;
  warning?: string;

  // Additional fields for full parity with Python AnalyzeResponse
  keyword_detection?: any;
  severity_rule?: any;
  output_restriction?: any;
  context_rule?: any;
  function_chaining_info?: any;
}

export interface ShieldResponse {
  decision: "ALLOW" | "BLOCK";
  reason?: string;
}

export interface Policy {
  policy_key: string;
  name: string;
  description?: string;
  roles?: Record<string, any>;
  functions?: Record<string, any>;
  severity_rules?: Record<string, any>;
  output_restrictions?: Record<string, any>;
  function_chaining?: Record<string, any>;
  context_rules?: any[];
  decision_thresholds?: {
    block_threshold?: number;
    allow_threshold?: number;
    use_severity_fallback?: boolean;
    input_safe_threshold?: number;
    input_block_threshold?: number;
    quarantine_safe_threshold?: number;
    quarantine_block_threshold?: number;
  };
  custom_prompts?: Record<string, string>;
  is_default?: boolean;
}

export interface Shield {
  shield_key: string;
  name: string;
  description?: string;
  prompt_description: string;
  what_to_block: string;
  what_not_to_block: string;
  is_active: boolean;
  content?: string; // For creation payload
}
