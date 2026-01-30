/**
 * Security configuration types
 */

export interface RateLimitConfig {
  max: number;
  windowMs: number;
}

export interface SecurityShieldConfig {
  /** Enable security shield (default: true for opt-out mode) */
  enabled?: boolean;

  /** Rate limiting configuration */
  rateLimiting?: {
    enabled?: boolean;

    /** Per-IP rate limits */
    perIp?: {
      connections?: RateLimitConfig;
      authAttempts?: RateLimitConfig;
      requests?: RateLimitConfig;
    };

    /** Per-device rate limits */
    perDevice?: {
      authAttempts?: RateLimitConfig;
      requests?: RateLimitConfig;
    };

    /** Per-sender rate limits (for messaging channels) */
    perSender?: {
      pairingRequests?: RateLimitConfig;
      messageRate?: RateLimitConfig;
    };

    /** Webhook rate limits */
    webhook?: {
      perToken?: RateLimitConfig;
      perPath?: RateLimitConfig;
    };
  };

  /** Intrusion detection configuration */
  intrusionDetection?: {
    enabled?: boolean;

    /** Attack pattern detection thresholds */
    patterns?: {
      bruteForce?: { threshold?: number; windowMs?: number };
      ssrfBypass?: { threshold?: number; windowMs?: number };
      pathTraversal?: { threshold?: number; windowMs?: number };
      portScanning?: { threshold?: number; windowMs?: number };
    };

    /** Anomaly detection (experimental) */
    anomalyDetection?: {
      enabled?: boolean;
      learningPeriodMs?: number;
      sensitivityScore?: number;
    };
  };

  /** IP management configuration */
  ipManagement?: {
    /** Auto-blocking rules */
    autoBlock?: {
      enabled?: boolean;
      durationMs?: number; // Default block duration
    };

    /** IP allowlist (CIDR blocks or IPs) */
    allowlist?: string[];

    /** Firewall integration (Linux only) */
    firewall?: {
      enabled?: boolean;
      backend?: "iptables" | "ufw";
    };
  };
}

export interface SecurityLoggingConfig {
  enabled?: boolean;
  file?: string; // Log file path (supports {date} placeholder)
  level?: "info" | "warn" | "critical";
}

export interface AlertTriggerConfig {
  enabled?: boolean;
  throttleMs?: number;
}

export interface AlertingConfig {
  enabled?: boolean;

  /** Alert triggers */
  triggers?: {
    criticalEvents?: AlertTriggerConfig;
    failedAuthSpike?: { enabled?: boolean; threshold?: number; windowMs?: number; throttleMs?: number };
    ipBlocked?: AlertTriggerConfig;
  };

  /** Alert channels */
  channels?: {
    webhook?: {
      enabled?: boolean;
      url?: string;
      headers?: Record<string, string>;
    };

    slack?: {
      enabled?: boolean;
      webhookUrl?: string;
    };

    email?: {
      enabled?: boolean;
      smtp?: {
        host?: string;
        port?: number;
        secure?: boolean;
        auth?: {
          user?: string;
          pass?: string;
        };
      };
      from?: string;
      to?: string[];
    };

    telegram?: {
      enabled?: boolean;
      botToken?: string;
      chatId?: string;
    };
  };
}

export interface SecurityConfig {
  shield?: SecurityShieldConfig;
  logging?: SecurityLoggingConfig;
  alerting?: AlertingConfig;
}

/**
 * Default security configuration (opt-out mode)
 */
export const DEFAULT_SECURITY_CONFIG: Required<SecurityConfig> = {
  shield: {
    enabled: true, // OPT-OUT MODE: Enabled by default

    rateLimiting: {
      enabled: true,

      perIp: {
        connections: { max: 10, windowMs: 60_000 }, // 10 concurrent connections
        authAttempts: { max: 5, windowMs: 300_000 }, // 5 auth attempts per 5 minutes
        requests: { max: 100, windowMs: 60_000 }, // 100 requests per minute
      },

      perDevice: {
        authAttempts: { max: 10, windowMs: 900_000 }, // 10 auth attempts per 15 minutes
        requests: { max: 500, windowMs: 60_000 }, // 500 requests per minute
      },

      perSender: {
        pairingRequests: { max: 3, windowMs: 3_600_000 }, // 3 pairing requests per hour
        messageRate: { max: 30, windowMs: 60_000 }, // 30 messages per minute
      },

      webhook: {
        perToken: { max: 200, windowMs: 60_000 }, // 200 webhook calls per token per minute
        perPath: { max: 50, windowMs: 60_000 }, // 50 webhook calls per path per minute
      },
    },

    intrusionDetection: {
      enabled: true,

      patterns: {
        bruteForce: { threshold: 10, windowMs: 600_000 }, // 10 failures in 10 minutes
        ssrfBypass: { threshold: 3, windowMs: 300_000 }, // 3 SSRF attempts in 5 minutes
        pathTraversal: { threshold: 5, windowMs: 300_000 }, // 5 path traversal attempts in 5 minutes
        portScanning: { threshold: 20, windowMs: 10_000 }, // 20 connections in 10 seconds
      },

      anomalyDetection: {
        enabled: false, // Experimental, opt-in
        learningPeriodMs: 86_400_000, // 24 hours
        sensitivityScore: 0.95, // 95th percentile
      },
    },

    ipManagement: {
      autoBlock: {
        enabled: true,
        durationMs: 86_400_000, // 24 hours
      },

      allowlist: [
        "100.64.0.0/10", // Tailscale CGNAT range (auto-added)
      ],

      firewall: {
        enabled: true, // Enabled on Linux, no-op on other platforms
        backend: "iptables",
      },
    },
  },

  logging: {
    enabled: true,
    file: "/tmp/openclaw/security-{date}.jsonl",
    level: "warn", // Log warn and critical events
  },

  alerting: {
    enabled: false, // Requires user configuration

    triggers: {
      criticalEvents: {
        enabled: true,
        throttleMs: 300_000, // Max 1 alert per 5 minutes per trigger
      },

      failedAuthSpike: {
        enabled: true,
        threshold: 20, // 20 failures
        windowMs: 600_000, // in 10 minutes
        throttleMs: 600_000, // Max 1 alert per 10 minutes
      },

      ipBlocked: {
        enabled: true,
        throttleMs: 3_600_000, // Max 1 alert per hour per IP
      },
    },

    channels: {
      webhook: {
        enabled: false,
        url: "",
        headers: {},
      },

      slack: {
        enabled: false,
        webhookUrl: "",
      },

      email: {
        enabled: false,
        smtp: {
          host: "",
          port: 587,
          secure: false,
          auth: {
            user: "",
            pass: "",
          },
        },
        from: "",
        to: [],
      },

      telegram: {
        enabled: false,
        botToken: "",
        chatId: "",
      },
    },
  },
};
