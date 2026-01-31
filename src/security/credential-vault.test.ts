import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CredentialVault } from "./credential-vault.js";
import { FileKeyProvider } from "./key-management.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

describe("CredentialVault", () => {
  let vault: CredentialVault;
  let keyProvider: FileKeyProvider;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-test-"));
    keyProvider = new FileKeyProvider(path.join(tempDir, "test.key"));
    vault = new CredentialVault(keyProvider);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe("encryption/decryption", () => {
    it("should encrypt and decrypt simple data", async () => {
      const data = { username: "test", apiKey: "secret-123" };

      const encrypted = await vault.encrypt(data);
      expect(encrypted).toHaveProperty("version", 2);
      expect(encrypted).toHaveProperty("encryption");
      expect(encrypted).toHaveProperty("data");
      expect(typeof encrypted.data).toBe("string");
      expect(encrypted.encryption.authTag).toBeDefined();

      const decrypted = await vault.decrypt(encrypted);
      expect(decrypted).toEqual(data);
    });

    it("should encrypt and decrypt complex auth profiles", async () => {
      const data = {
        profiles: {
          "openai:default": {
            type: "api_key",
            provider: "openai",
            key: "sk-1234567890",
          },
          "anthropic:work": {
            type: "oauth",
            provider: "anthropic",
            access: "access-token-123",
            refresh: "refresh-token-456",
            expires: 1234567890,
          },
        },
        order: {
          openai: ["default"],
          anthropic: ["work"],
        },
      };

      const encrypted = await vault.encrypt(data);
      const decrypted = await vault.decrypt(encrypted);
      expect(decrypted).toEqual(data);
    });

    it("should produce different encrypted data for same input", async () => {
      const data = { test: "data" };

      const encrypted1 = await vault.encrypt(data);
      const encrypted2 = await vault.encrypt(data);

      // Data should be different due to random IV
      expect(encrypted1.data).not.toBe(encrypted2.data);
      expect(encrypted1.encryption.iv).not.toBe(encrypted2.encryption.iv);

      // But both should decrypt to the same value
      const decrypted1 = await vault.decrypt(encrypted1);
      const decrypted2 = await vault.decrypt(encrypted2);
      expect(decrypted1).toEqual(data);
      expect(decrypted2).toEqual(data);
    });
  });

  describe("isEncrypted", () => {
    it("should detect encrypted data", async () => {
      const data = { test: "value" };
      const encrypted = await vault.encrypt(data);

      expect(await vault.isEncrypted(encrypted)).toBe(true);
      expect(await vault.isEncrypted(data)).toBe(false);
    });

    it("should return false for invalid data", async () => {
      expect(await vault.isEncrypted(null)).toBe(false);
      expect(await vault.isEncrypted(undefined)).toBe(false);
      expect(await vault.isEncrypted("string")).toBe(false);
      expect(await vault.isEncrypted(123)).toBe(false);
      expect(await vault.isEncrypted({})).toBe(false);
      expect(await vault.isEncrypted({ version: 1 })).toBe(false);
      expect(await vault.isEncrypted({ version: 2, data: "test" })).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should throw on unsupported version", async () => {
      const invalidData = {
        version: 1,
        encryption: { algorithm: "aes-256-gcm", iv: "test", authTag: "test" },
        data: "encrypted-data",
      };

      await expect(vault.decrypt(invalidData as any)).rejects.toThrow(
        "Unsupported encryption version: 1",
      );
    });

    it("should throw on missing auth tag", async () => {
      const invalidData = {
        version: 2,
        encryption: { algorithm: "aes-256-gcm", iv: "dGVzdA==", authTag: "" },
        data: "invalid-encrypted-data",
      };

      await expect(vault.decrypt(invalidData as any)).rejects.toThrow("Missing authentication tag");
    });
  });
});
