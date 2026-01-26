import crypto from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it, vi } from "vitest";

import type { ClawdbotConfig, PluginRuntime } from "clawdbot/plugin-sdk";

import type { ResolvedFeishuAccount } from "./accounts.js";
import { handleFeishuWebhookRequest, registerFeishuWebhookTarget } from "./monitor.js";

async function withServer(
  handler: Parameters<typeof createServer>[0],
  fn: (baseUrl: string) => Promise<void>,
) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo | null;
  if (!address) throw new Error("missing server address");
  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function encryptFeishuPayload(params: { plaintext: string; encryptKey: string }): string {
  const key = crypto.createHash("sha256").update(params.encryptKey).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const ciphertext = Buffer.concat([cipher.update(params.plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, ciphertext]).toString("base64");
}

function computeFeishuSignature(params: {
  rawBody: string;
  encryptKey: string;
  timestamp: string;
  nonce: string;
}): string {
  return crypto
    .createHash("sha256")
    .update(`${params.timestamp}${params.nonce}${params.encryptKey}${params.rawBody}`)
    .digest("hex");
}

describe("handleFeishuWebhookRequest", () => {
  it("responds to url_verification (verificationToken)", async () => {
    const core = { logging: { shouldLogVerbose: () => false } } as unknown as PluginRuntime;
    const account: ResolvedFeishuAccount = {
      accountId: "default",
      enabled: true,
      config: { verificationToken: "vtok" },
      credentialSource: "config",
    };
    const error = vi.fn();
    const statusSink = vi.fn();
    const unregister = registerFeishuWebhookTarget({
      account,
      config: {} as ClawdbotConfig,
      runtime: { error },
      core,
      path: "/hook",
      statusSink,
    });

    try {
      await withServer(
        async (req, res) => {
          const handled = await handleFeishuWebhookRequest(req, res);
          if (!handled) {
            res.statusCode = 404;
            res.end("not found");
          }
        },
        async (baseUrl) => {
          const response = await fetch(`${baseUrl}/hook`, {
            method: "POST",
            body: JSON.stringify({ token: "vtok", challenge: "abc", type: "url_verification" }),
          });

          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({ challenge: "abc" });
          expect(statusSink).not.toHaveBeenCalled();
          expect(error).not.toHaveBeenCalled();
        },
      );
    } finally {
      unregister();
    }
  });

  it("responds to url_verification (encryptKey)", async () => {
    const core = { logging: { shouldLogVerbose: () => false } } as unknown as PluginRuntime;
    const encryptKey = "encrypt-key-example";
    const account: ResolvedFeishuAccount = {
      accountId: "default",
      enabled: true,
      config: { encryptKey },
      credentialSource: "config",
    };
    const error = vi.fn();
    const statusSink = vi.fn();
    const unregister = registerFeishuWebhookTarget({
      account,
      config: {} as ClawdbotConfig,
      runtime: { error },
      core,
      path: "/hook",
      statusSink,
    });

    try {
      await withServer(
        async (req, res) => {
          const handled = await handleFeishuWebhookRequest(req, res);
          if (!handled) {
            res.statusCode = 404;
            res.end("not found");
          }
        },
        async (baseUrl) => {
          const plaintext = JSON.stringify({ type: "url_verification", challenge: "abc" });
          const encrypt = encryptFeishuPayload({ plaintext, encryptKey });
          const rawBody = JSON.stringify({ encrypt });
          const timestamp = "1700000000";
          const nonce = "nonce";
          const signature = computeFeishuSignature({ rawBody, encryptKey, timestamp, nonce });

          const response = await fetch(`${baseUrl}/hook`, {
            method: "POST",
            headers: {
              "x-lark-request-timestamp": timestamp,
              "x-lark-request-nonce": nonce,
              "x-lark-signature": signature,
            },
            body: rawBody,
          });

          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({ challenge: "abc" });
          expect(statusSink).not.toHaveBeenCalled();
          expect(error).not.toHaveBeenCalled();
        },
      );
    } finally {
      unregister();
    }
  });

  it("parses im.message.receive_v1 payloads and returns 200", async () => {
    const core = { logging: { shouldLogVerbose: () => false } } as unknown as PluginRuntime;
    const account: ResolvedFeishuAccount = {
      accountId: "default",
      enabled: true,
      config: { verificationToken: "vtok" },
      credentialSource: "config",
    };
    const error = vi.fn();
    const statusSink = vi.fn();
    const unregister = registerFeishuWebhookTarget({
      account,
      config: {} as ClawdbotConfig,
      runtime: { error },
      core,
      path: "/hook",
      statusSink,
    });

    try {
      await withServer(
        async (req, res) => {
          const handled = await handleFeishuWebhookRequest(req, res);
          if (!handled) {
            res.statusCode = 404;
            res.end("not found");
          }
        },
        async (baseUrl) => {
          const payload = {
            token: "vtok",
            header: { event_type: "im.message.receive_v1", create_time: "1700000000000" },
            event: {
              message: {
                message_id: "m1",
                chat_id: "oc_123",
                chat_type: "group",
                message_type: "image",
                content: JSON.stringify({ text: "ignored" }),
              },
              sender: {
                sender_id: { open_id: "ou_123", user_id: "u_1" },
                sender_type: "user",
              },
            },
          };

          const response = await fetch(`${baseUrl}/hook`, {
            method: "POST",
            body: JSON.stringify(payload),
          });

          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({});
          await new Promise((r) => setTimeout(r, 0));
          expect(statusSink).toHaveBeenCalledTimes(1);
          expect(error).not.toHaveBeenCalled();
        },
      );
    } finally {
      unregister();
    }
  });
});
