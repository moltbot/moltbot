/**
 * PowerMem HTTP API client.
 * Calls POST /api/v1/memories, POST /api/v1/memories/search, DELETE /api/v1/memories/:id, GET /api/v1/system/health.
 */

import type { PowerMemConfig } from "./config.js";

export type PowerMemSearchResult = {
  memory_id: number;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
};

export type PowerMemAddResult = {
  memory_id: number;
  content: string;
  user_id?: string;
  agent_id?: string;
  metadata?: Record<string, unknown>;
};

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

function buildHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }
  return headers;
}

async function handleResponse<T>(res: Response, parseJson = true): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let message = `PowerMem API ${res.status}: ${res.statusText}`;
    try {
      const body = text ? JSON.parse(text) : null;
      if (body?.message) message = body.message;
      else if (body?.detail) message = Array.isArray(body.detail) ? body.detail.map((d: { msg?: string }) => d.msg ?? String(d)).join("; ") : String(body.detail);
    } catch {
      if (text) message = text.slice(0, 200);
    }
    throw new Error(message);
  }
  if (!parseJson) return undefined as T;
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export type PowerMemClientOptions = {
  baseUrl: string;
  apiKey?: string;
  userId?: string;
  agentId?: string;
};

export class PowerMemClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly userId: string;
  private readonly agentId: string;

  constructor(options: PowerMemClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.userId = options.userId ?? "moltbot-user";
    this.agentId = options.agentId ?? "moltbot-agent";
  }

  static fromConfig(cfg: PowerMemConfig, userId: string, agentId: string): PowerMemClient {
    return new PowerMemClient({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      userId,
      agentId,
    });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    parseJson = true,
  ): Promise<T> {
    const url = buildUrl(this.baseUrl, path);
    const res = await fetch(url, {
      method,
      headers: buildHeaders(this.apiKey),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res, parseJson);
  }

  /** GET /api/v1/system/health */
  async health(): Promise<{ status: string }> {
    const data = await this.request<{ data?: { status?: string } }>(
      "GET",
      "/api/v1/system/health",
      undefined,
    );
    return { status: data?.data?.status ?? "unknown" };
  }

  /** POST /api/v1/memories */
  async add(
    content: string,
    options: { infer?: boolean; metadata?: Record<string, unknown> } = {},
  ): Promise<PowerMemAddResult[]> {
    const body = {
      content,
      user_id: this.userId,
      agent_id: this.agentId,
      infer: options.infer ?? true,
      ...(options.metadata && { metadata: options.metadata }),
    };
    const res = await this.request<{ success: boolean; data?: PowerMemAddResult[] }>(
      "POST",
      "/api/v1/memories",
      body,
    );
    if (!res?.data) return [];
    return res.data;
  }

  /** POST /api/v1/memories/search */
  async search(query: string, limit = 5): Promise<PowerMemSearchResult[]> {
    const body = {
      query,
      user_id: this.userId,
      agent_id: this.agentId,
      limit,
    };
    const res = await this.request<{
      success: boolean;
      data?: { results?: PowerMemSearchResult[] };
    }>("POST", "/api/v1/memories/search", body);
    return res?.data?.results ?? [];
  }

  /** DELETE /api/v1/memories/:memory_id */
  async delete(memoryId: number | string): Promise<void> {
    const id = typeof memoryId === "string" ? memoryId : String(memoryId);
    await this.request(
      "DELETE",
      `/api/v1/memories/${id}?user_id=${encodeURIComponent(this.userId)}&agent_id=${encodeURIComponent(this.agentId)}`,
      undefined,
      false,
    );
  }
}
