import { Laminar, observe, LaminarAttributes } from "@lmnr-ai/lmnr";
import { Logger } from "tslog";

const logger = new Logger({ name: "Observability:Lmnr" });

export function initLmnr(
  options: {
    apiKey?: string;
    baseUrl?: string;
    httpPort?: number;
    grpcPort?: number;
  } = {},
) {
  if (Laminar.initialized()) {
    logger.debug("Laminar already initialized. Skipping initLmnr.");
    return;
  }

  const key = options.apiKey || process.env.HIPOCAP_API_KEY;
  const baseUrl =
    options.baseUrl || process.env.HIPOCAP_OBS_BASE_URL || process.env.HIPOCAP_OBSERVABILITY_URL;
  const httpPort =
    options.httpPort ||
    (process.env.HIPOCAP_OBS_HTTP_PORT ? parseInt(process.env.HIPOCAP_OBS_HTTP_PORT) : undefined);
  const grpcPort =
    options.grpcPort ||
    (process.env.HIPOCAP_OBS_GRPC_PORT ? parseInt(process.env.HIPOCAP_OBS_GRPC_PORT) : undefined);

  if (!key) {
    // If no key but OTel env vars are present, we might still want to initialize generic OTel
    // but Laminar SDK requires an API key for its own features.
    logger.debug("HIPOCAP_API_KEY not found. Laminar observability disabled.");
    return;
  }

  try {
    Laminar.initialize({
      projectApiKey: key,
      baseUrl,
      httpPort,
      grpcPort,
    });
    logger.info(
      `Laminar observability initialized (baseUrl: ${baseUrl || "cloud"}, grpcPort: ${grpcPort || "default"}).`,
    );
  } catch (error) {
    logger.error("Failed to initialize Laminar:", error);
  }
}

/**
 * Helper to wrap a function in a Laminar span.
 */
export async function withLmnrSpan<T>(
  name: string,
  fn: () => Promise<T>,
  input?: any,
  options: { spanType?: string; metadata?: Record<string, any> } = {},
): Promise<T> {
  return (await observe(
    {
      name,
      input,
      spanType: (options.spanType as any) || "DEFAULT",
      metadata: options.metadata,
    },
    fn,
  )) as T;
}

/**
 * Helper to wrap Hipocap security operations with specific attributes and types.
 */
export async function withHipocapSpan<T>(
  name: string,
  attributes: Record<string, any>,
  input: any,
  fn: () => Promise<T>,
  options: { userId?: string; sessionId?: string } = {},
): Promise<T> {
  return await observe(
    {
      name,
      spanType: "TOOL",
      input,
      metadata: attributes,
      userId: options.userId,
      sessionId: options.sessionId,
    },
    fn,
  );
}

/**
 * Helper to wrap the main agent execution.
 */
export async function withAgentSpan<T>(
  name: string,
  input: any,
  metadata: Record<string, any>,
  fn: () => Promise<T>,
): Promise<T> {
  return (await observe(
    {
      name,
      spanType: "DEFAULT",
      input,
      metadata,
    },
    fn,
  )) as T;
}

/**
 * Add a Laminar event.
 */
export function recordLmnrEvent(
  name: string,
  attributes?: Record<string, any>,
  timestamp?: number | bigint,
) {
  if (Laminar.initialized()) {
    Laminar.event({ name, attributes, timestamp: timestamp as any });
  }
}

/**
 * Set attributes on the current Laminar span.
 */
export function setLmnrSpanAttributes(attributes: Record<string, any>) {
  if (Laminar.initialized()) {
    Laminar.setSpanAttributes(attributes);
  }
}

/**
 * Set metadata on the current Laminar trace (uses association properties).
 */
export function setLmnrTraceMetadata(metadata: Record<string, any>) {
  if (Laminar.initialized()) {
    Laminar.setTraceMetadata(metadata);
  }
}

/**
 * Set the status (OK or ERROR) for the current span.
 */
export function setLmnrSpanStatus(status: "OK" | "ERROR", message?: string) {
  if (Laminar.initialized()) {
    const currentSpan = Laminar.getCurrentSpan();
    if (currentSpan) {
      currentSpan.setStatus({
        code: status === "OK" ? 1 : 2, // 1 for OK, 2 for ERROR in OTEL
        message,
      });
    }
  }
}

export { LaminarAttributes };
