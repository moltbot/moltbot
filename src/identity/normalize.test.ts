import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeSessionId, denormalizeSessionId } from "./normalize.js";
import * as storage from "./storage.js";

vi.mock("./storage.js");

describe("normalizeSessionId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns telegram-prefixed ID when no mapping exists for Telegram", async () => {
    vi.mocked(storage.findMappingByIdentity).mockResolvedValue(null);

    const result = await normalizeSessionId("telegram", "123456789");

    expect(result).toBe("telegram:123456789");
    expect(storage.findMappingByIdentity).toHaveBeenCalledWith(
      "telegram",
      "123456789",
    );
  });

  it("returns phone number directly when no mapping exists for WhatsApp", async () => {
    vi.mocked(storage.findMappingByIdentity).mockResolvedValue(null);

    const result = await normalizeSessionId("whatsapp", "+1234567890");

    expect(result).toBe("+1234567890");
    expect(storage.findMappingByIdentity).toHaveBeenCalledWith(
      "whatsapp",
      "+1234567890",
    );
  });

  it("returns phone number directly when no mapping exists for Twilio", async () => {
    vi.mocked(storage.findMappingByIdentity).mockResolvedValue(null);

    const result = await normalizeSessionId("twilio", "+1234567890");

    expect(result).toBe("+1234567890");
    expect(storage.findMappingByIdentity).toHaveBeenCalledWith(
      "twilio",
      "+1234567890",
    );
  });

  it("returns shared ID when mapping exists", async () => {
    const mockMapping = {
      id: "shared-abc-123",
      identities: {
        telegram: "123456789",
        whatsapp: "+1234567890",
      },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    vi.mocked(storage.findMappingByIdentity).mockResolvedValue(mockMapping);

    const result = await normalizeSessionId("telegram", "123456789");

    expect(result).toBe("shared-abc-123");
    expect(storage.findMappingByIdentity).toHaveBeenCalledWith(
      "telegram",
      "123456789",
    );
  });

  it("returns same shared ID for different providers with mapping", async () => {
    const mockMapping = {
      id: "shared-xyz-456",
      identities: {
        telegram: "987654321",
        whatsapp: "+9876543210",
      },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };

    // First call for Telegram
    vi.mocked(storage.findMappingByIdentity).mockResolvedValueOnce(
      mockMapping,
    );
    const telegramResult = await normalizeSessionId("telegram", "987654321");

    // Second call for WhatsApp
    vi.mocked(storage.findMappingByIdentity).mockResolvedValueOnce(
      mockMapping,
    );
    const whatsappResult = await normalizeSessionId(
      "whatsapp",
      "+9876543210",
    );

    expect(telegramResult).toBe("shared-xyz-456");
    expect(whatsappResult).toBe("shared-xyz-456");
    expect(telegramResult).toBe(whatsappResult);
  });
});

describe("denormalizeSessionId", () => {
  it("extracts Telegram ID from telegram-prefixed session ID", () => {
    const result = denormalizeSessionId("telegram", "telegram:123456789");
    expect(result).toBe("123456789");
  });

  it("returns phone number for WhatsApp when session ID looks like phone", () => {
    const result = denormalizeSessionId("whatsapp", "+1234567890");
    expect(result).toBe("+1234567890");
  });

  it("returns phone number for Twilio when session ID looks like phone", () => {
    const result = denormalizeSessionId("twilio", "+9876543210");
    expect(result).toBe("+9876543210");
  });

  it("returns null for shared IDs (cannot denormalize without lookup)", () => {
    const result = denormalizeSessionId("telegram", "shared-abc-123");
    expect(result).toBeNull();
  });

  it("returns null when Telegram ID doesn't have telegram prefix", () => {
    const result = denormalizeSessionId("telegram", "123456789");
    expect(result).toBeNull();
  });

  it("returns null when WhatsApp ID doesn't look like phone number", () => {
    const result = denormalizeSessionId("whatsapp", "shared-id-xyz");
    expect(result).toBeNull();
  });
});
