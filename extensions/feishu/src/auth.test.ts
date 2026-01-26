import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptFeishuEncrypt, verifyFeishuSignature } from "./auth.js";

function encryptFeishuPayload(params: { plaintext: string; encryptKey: string }): string {
  const key = crypto.createHash("sha256").update(params.encryptKey).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const ciphertext = Buffer.concat([cipher.update(params.plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, ciphertext]).toString("base64");
}

describe("feishu/auth", () => {
  it("decrypts encrypt payloads", () => {
    const encryptKey = "encrypt-key-example";
    const plaintext = JSON.stringify({
      type: "url_verification",
      challenge: "challenge-value",
      token: "verification-token",
    });
    const encrypt = encryptFeishuPayload({ plaintext, encryptKey });

    const decrypted = decryptFeishuEncrypt({ encrypt, encryptKey });
    expect(decrypted).toBe(plaintext);
  });

  it("rejects decrypt with wrong key", () => {
    const encryptKey = "encrypt-key-example";
    const plaintext = '{"type":"event_callback"}';
    const encrypt = encryptFeishuPayload({ plaintext, encryptKey });

    expect(() => decryptFeishuEncrypt({ encrypt, encryptKey: "wrong-key" })).toThrow();
  });

  it("verifies Feishu signatures", () => {
    const rawBody = '{"encrypt":"abc"}';
    const encryptKey = "encrypt-key-example";
    const timestamp = "1700000000";
    const nonce = "nonce";
    const signature = crypto
      .createHash("sha256")
      .update(`${timestamp}${nonce}${encryptKey}${rawBody}`)
      .digest("hex");

    expect(
      verifyFeishuSignature({
        rawBody,
        encryptKey,
        timestamp,
        nonce,
        signature,
      }),
    ).toBe(true);

    expect(
      verifyFeishuSignature({
        rawBody,
        encryptKey,
        timestamp,
        nonce: "other",
        signature,
      }),
    ).toBe(false);
  });
});
