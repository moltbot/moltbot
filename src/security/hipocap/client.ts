import { Logger } from "tslog"; // Utilizing tslog as used in other parts of moltbot
import type {
  AnalysisRequest,
  AnalysisResponse,
  HipocapConfig,
  Policy,
  Shield,
  ShieldRequest,
  ShieldResponse,
} from "./types.js";
import { getHipocapConfig, validateConfig } from "./config.js";
import {
  withHipocapSpan,
  recordLmnrEvent,
  setLmnrTraceMetadata,
  setLmnrSpanStatus,
} from "../../observability/lmnr.js";

const logger = new Logger({ name: "HipocapClient" });

export class HipocapClient {
  private config: HipocapConfig;

  constructor(config?: HipocapConfig) {
    this.config = config || getHipocapConfig();
  }

  public isEnabled(): boolean {
    return this.config.enabled ?? false;
  }

  public async initialize(): Promise<boolean> {
    if (!this.isEnabled()) {
      logger.debug("Hipocap is disabled.");
      return false;
    }

    const validation = validateConfig(this.config);
    if (!validation.valid) {
      logger.error(`Hipocap configuration invalid: ${validation.error}`);
      return false;
    }

    try {
      // Simple health check or ping to verify connection
      const isConnected = await this.healthCheck();
      if (isConnected) {
        logger.info("Successfully connected to Hipocap server.");

        // Sync default policy to ensure assistant can use exec
        this.syncPolicy().catch((err) => {
          logger.error("Failed to sync Hipocap policy during initialization:", err);
        });

        logger.info(`View security insights at Hipocap Dashboard: ${this.config.serverUrl}`);
        return true;
      } else {
        logger.error("Failed to connect to Hipocap server.");
        return false;
      }
    } catch (error) {
      logger.error("Error initializing Hipocap client:", error);
      return false;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.serverUrl}/api/v1/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${this.config.apiKey || ""}`,
      "X-LMNR-API-Key": this.config.apiKey || "",
    };

    if (this.config.userId) {
      headers["X-LMNR-User-Id"] = this.config.userId;
    }

    return headers;
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = 30000,
  ): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      throw error;
    }
  }

  public async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    if (!this.isEnabled()) {
      return {
        final_decision: "ALLOWED",
        safe_to_use: true,
        reason: "Hipocap disabled",
      };
    }

    const function_name = request.function_name || "unknown";
    const analysis_start_time = Date.now();

    // Map initial attributes
    const initialAttributes: Record<string, any> = {
      "hipocap.function_name": function_name,
    };

    return await withHipocapSpan(
      function_name,
      initialAttributes,
      request,
      async () => {
        const { policy_key, ...analyze_payload } = request;
        const final_policy_key = policy_key || this.config.defaultPolicy;

        const queryParams = new URLSearchParams();
        if (final_policy_key) {
          queryParams.set("policy_key", final_policy_key);
        }

        const url = `${this.config.serverUrl}/api/v1/analyze${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

        try {
          const response = await this.fetchWithTimeout(
            url,
            {
              method: "POST",
              headers: this.getHeaders(),
              body: JSON.stringify(analyze_payload),
            },
            45000,
          ); // 45s for full analysis

          if (!response.ok) {
            let errorMessage = `Hipocap API error: ${response.status} ${response.statusText}`;
            try {
              const errorData = (await response.json()) as any;
              if (errorData && (errorData.detail || errorData.message)) {
                errorMessage = `Hipocap API error: ${errorData.detail || errorData.message} (${response.status})`;
              }
            } catch {
              // Ignore parse error, use default message
            }

            if (response.status === 401) {
              logger.error(
                `Hipocap API Unauthorized. Check your API Key (starting with: ${(this.config.apiKey || "").slice(0, 4)}...) and server URL: ${this.config.serverUrl}`,
              );
            }
            throw new Error(errorMessage);
          }

          const result = (await response.json()) as AnalysisResponse;
          const analysis_end_time = Date.now();

          // Inject client-side timestamps into analysis results (Python parity)
          if (result.input_analysis) result.input_analysis.timestamp = analysis_start_time / 1000;
          if (result.llm_analysis) result.llm_analysis.timestamp = analysis_end_time / 1000;

          // Score calculation logic mirrored from Python
          let final_score = result.final_score;
          let combined_severity = result.severity;
          let combined_score = final_score;

          if (combined_score === undefined || combined_score === null) {
            if (result.input_analysis) {
              combined_severity =
                combined_severity ||
                result.input_analysis.combined_severity ||
                (result.input_analysis as any).severity;
              combined_score =
                result.input_analysis.combined_score || (result.input_analysis as any).score;
            }
            if (result.llm_analysis && !combined_severity) {
              combined_severity = result.llm_analysis.severity;
              combined_score =
                combined_score ?? (result.llm_analysis.score || result.llm_analysis.risk_score);
            }
            if (result.quarantine_analysis && !combined_severity) {
              combined_severity = result.quarantine_analysis.combined_severity;
              combined_score = combined_score ?? result.quarantine_analysis.combined_score;
            }
          }

          // Enrich span with detailed result codes via trace metadata (Laminar parity)
          const resultMetadata: Record<string, any> = {
            "hipocap.function_name": function_name,
            "hipocap.final_decision": result.final_decision,
            "hipocap.safe_to_use": result.safe_to_use,
            "hipocap.final_score": result.final_score ?? 0,
            "hipocap.severity": combined_severity,
            "hipocap.score": combined_score ?? 0,
            "hipocap.blocked_at": result.blocked_at,
            "hipocap.reason": result.reason,
            "hipocap.rbac_blocked": result.rbac_blocked,
            "hipocap.chaining_blocked": result.chaining_blocked,
            "hipocap.warning": result.warning,
          };

          // Add all missing parity fields
          if (result.keyword_detection)
            resultMetadata["hipocap.keyword_detection"] = result.keyword_detection;
          if (result.severity_rule) resultMetadata["hipocap.severity_rule"] = result.severity_rule;
          if (result.output_restriction)
            resultMetadata["hipocap.output_restriction"] = result.output_restriction;
          if (result.context_rule) resultMetadata["hipocap.context_rule"] = result.context_rule;
          if (result.function_chaining_info)
            resultMetadata["hipocap.function_chaining_info"] = result.function_chaining_info;

          // Add structured analysis stages as objects (Laminar metadata conversion handles stringification if needed)
          if (result.input_analysis)
            resultMetadata["hipocap.input_analysis"] = result.input_analysis;
          if (result.llm_analysis) resultMetadata["hipocap.llm_analysis"] = result.llm_analysis;
          if (result.quarantine_analysis)
            resultMetadata["hipocap.quarantine_analysis"] = result.quarantine_analysis;

          // Enrich trace with metadata
          setLmnrTraceMetadata(resultMetadata);

          // Record stage-specific events (Python parity)
          if (result.input_analysis) {
            recordLmnrEvent(
              "hipocap.security.analysis_complete",
              {
                "hipocap.function_name": function_name,
                "hipocap.analysis_stage": "input_analysis",
                "hipocap.final_decision": result.final_decision,
                "hipocap.severity": combined_severity || "unknown",
                "hipocap.reason": result.reason || "",
              },
              analysis_start_time * 1000000,
            ); // ns
          }

          if (result.llm_analysis) {
            recordLmnrEvent(
              "hipocap.security.analysis_complete",
              {
                "hipocap.function_name": function_name,
                "hipocap.analysis_stage": "llm_analysis",
                "hipocap.final_decision": result.final_decision,
                "hipocap.severity": combined_severity || "unknown",
                "hipocap.reason": result.reason || "",
              },
              analysis_end_time * 1000000,
            ); // ns
          }

          if (!result.safe_to_use || result.final_decision !== "ALLOWED") {
            recordLmnrEvent(
              "hipocap.security.threat_detected",
              {
                "hipocap.function_name": function_name,
                "hipocap.final_decision": result.final_decision,
                "hipocap.severity": combined_severity || "unknown",
                "hipocap.reason": result.reason || "Security threat detected",
                "hipocap.blocked_at": result.blocked_at || "",
              },
              analysis_end_time * 1000000,
            );

            setLmnrSpanStatus("ERROR", result.reason || "Security threat detected");
          } else {
            setLmnrSpanStatus("OK");
          }

          return result;
        } catch (error) {
          logger.error("Analysis failed:", error);
          const errorResult: AnalysisResponse = {
            final_decision: "REVIEW_REQUIRED",
            safe_to_use: false,
            reason: `Analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          };

          recordLmnrEvent("hipocap.security.threat_detected", {
            "hipocap.function_name": function_name,
            "hipocap.final_decision": "ERROR",
            "hipocap.reason": errorResult.reason,
          });

          setLmnrSpanStatus("ERROR", errorResult.reason);

          return errorResult;
        }
      },
      {
        userId: this.config.userId,
      },
    );
  }

  public async shield(request: ShieldRequest): Promise<ShieldResponse> {
    if (!this.isEnabled()) {
      return { decision: "ALLOW", reason: "Hipocap disabled" };
    }

    const name = request.shield_key || "shield";
    const initialAttributes = {
      "hipocap.shield_key": request.shield_key,
    };

    return await withHipocapSpan(
      name,
      initialAttributes,
      request,
      async () => {
        const { shield_key, ...shield_payload } = request;

        try {
          const response = await this.fetchWithTimeout(
            `${this.config.serverUrl}/api/v1/shields/${shield_key}/analyze`,
            {
              method: "POST",
              headers: this.getHeaders(),
              body: JSON.stringify(shield_payload),
            },
            10000,
          ); // 10s for fast shield check

          if (!response.ok) {
            let errorMessage = `Hipocap Shield API error: ${response.status} ${response.statusText}`;
            try {
              const errorData = (await response.json()) as any;
              if (errorData && (errorData.detail || errorData.message)) {
                errorMessage = `Hipocap Shield API error: ${errorData.detail || errorData.message} (${response.status})`;
              }
            } catch {
              // Ignore
            }

            if (response.status === 401) {
              logger.error(
                `Hipocap Shield API Unauthorized. Check your API Key (starting with: ${(this.config.apiKey || "").slice(0, 4)}...) and server URL: ${this.config.serverUrl}`,
              );
            }
            throw new Error(errorMessage);
          }

          const result = (await response.json()) as ShieldResponse;
          const end_time = Date.now();

          // Enrich span with results via trace metadata
          setLmnrTraceMetadata({
            "hipocap.shield_decision": result.decision,
            "hipocap.shield_reason": result.reason,
          });

          if (result.decision === "BLOCK") {
            recordLmnrEvent(
              "hipocap.security.threat_detected",
              {
                "hipocap.shield_key": request.shield_key,
                "hipocap.final_decision": "BLOCKED",
                "hipocap.severity": "critical",
                "hipocap.reason": result.reason || "Shield blocked content",
              },
              end_time * 1000000,
            );

            setLmnrSpanStatus("ERROR", result.reason || "Shield blocked content");
          } else {
            setLmnrSpanStatus("OK");
          }

          return result;
        } catch (error) {
          logger.error("Shield analysis failed:", error);
          setLmnrSpanStatus(
            "ERROR",
            error instanceof Error ? error.message : "Unknown shield error",
          );
          return {
            decision: "ALLOW", // Default to allow on error to avoid blocking the agent
            reason: `Shield analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          };
        }
      },
      {
        userId: this.config.userId,
      },
    );
  }

  public async listPolicies(): Promise<any[]> {
    try {
      const response = await fetch(`${this.config.serverUrl}/api/v1/policies`, {
        headers: this.getHeaders(),
      });
      if (!response.ok) throw new Error("Failed to list policies");
      return await response.json();
    } catch (e) {
      logger.error("Failed to list policies", e);
      throw e;
    }
  }

  public async listShields(): Promise<any[]> {
    try {
      const response = await fetch(`${this.config.serverUrl}/api/v1/shields`, {
        headers: this.getHeaders(),
      });
      if (!response.ok) throw new Error("Failed to list shields");
      return await response.json();
    } catch (e) {
      logger.error("Failed to list shields", e);
      throw e;
    }
  }

  public async createPolicy(policy: Partial<Policy>): Promise<any> {
    const response = await fetch(`${this.config.serverUrl}/api/v1/policies`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(policy),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to create policy: ${JSON.stringify(errorData)}`);
    }
    return await response.json();
  }

  public async createShield(shield: Partial<Shield>): Promise<any> {
    const response = await fetch(`${this.config.serverUrl}/api/v1/shields`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(shield),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to create shield: ${JSON.stringify(errorData)}`);
    }
    return await response.json();
  }

  /**
   * Ensures the default policy has the correct role and function configurations.
   * This is called on initialization to guarantee 'assistant' role has permission
   * to execute sensitive tools like 'exec'.
   */
  public async syncPolicy(
    policyKey: string = this.config.defaultPolicy || "default",
  ): Promise<any> {
    logger.info(`Syncing Hipocap policy: ${policyKey}`);

    try {
      const response = await this.fetchWithTimeout(
        `${this.config.serverUrl}/api/v1/policies/${policyKey}`,
        {
          method: "PATCH",
          headers: this.getHeaders(),
          body: JSON.stringify({
            roles: {
              assistant: {
                permissions: ["*"],
                description: "AI Assistant with execution capabilities",
              },
            },
            functions: {
              exec: {
                allowed_roles: ["assistant", "admin"],
                description: "Execute system commands",
              },
            },
          }),
        },
        10000,
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.warn(
          `Policy sync for '${policyKey}' returned status ${response.status}: ${JSON.stringify(errorData)}`,
        );
        // If it's a 404, the policy might not exist yet.
        // The analyze call will create it automatically, but we might want to wait.
        return null;
      }

      const result = await response.json();
      logger.info(`Successfully synced Hipocap policy: ${policyKey}`);
      return result;
    } catch (e) {
      logger.error(`Error during policy sync for '${policyKey}':`, e);
      throw e;
    }
  }
}
