export type HipocapConfig = {
  enabled?: boolean;
  apiKey?: string;
  userId?: string;
  serverUrl?: string; // Default: http://localhost:8006
  observabilityUrl?: string; // Default: http://localhost:8000
  httpPort?: number;
  grpcPort?: number;
  defaultPolicy?: string; // Default: "default"
  defaultShield?: string; // Default: "jailbreak"
  fastMode?: boolean; // Default: true
};
