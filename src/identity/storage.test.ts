import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteMapping,
  findMappingByIdentity,
  getMapping,
  listMappings,
  loadIdentityMap,
  saveIdentityMap,
  setMapping,
} from "./storage.js";
import type { IdentityMap, IdentityMapping } from "./types.js";

vi.mock("node:fs/promises");
vi.mock("../utils.js", () => ({
  CONFIG_DIR: "/mock/config",
}));

describe("loadIdentityMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads identity map from disk", async () => {
    const mockMap: IdentityMap = {
      version: 1,
      mappings: {
        "test-id": {
          id: "test-id",
          identities: { telegram: "123", whatsapp: "+1234" },
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      },
    };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMap));

    const result = await loadIdentityMap();

    expect(result).toEqual(mockMap);
    expect(fs.readFile).toHaveBeenCalledWith(
      "/mock/config/identity-map.json",
      "utf-8",
    );
  });

  it("returns empty map when file does not exist", async () => {
    const error = new Error("ENOENT") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    vi.mocked(fs.readFile).mockRejectedValue(error);

    const result = await loadIdentityMap();

    expect(result).toEqual({
      version: 1,
      mappings: {},
    });
  });

  it("throws error for unsupported version", async () => {
    const mockMap = {
      version: 999,
      mappings: {},
    };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMap));

    await expect(loadIdentityMap()).rejects.toThrow(
      "Unsupported identity map version: 999",
    );
  });

  it("throws error for other file read errors", async () => {
    const error = new Error("Permission denied");
    vi.mocked(fs.readFile).mockRejectedValue(error);

    await expect(loadIdentityMap()).rejects.toThrow("Permission denied");
  });
});

describe("saveIdentityMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves identity map to disk", async () => {
    const mockMap: IdentityMap = {
      version: 1,
      mappings: {
        "test-id": {
          id: "test-id",
          identities: { telegram: "123" },
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      },
    };
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await saveIdentityMap(mockMap);

    expect(fs.mkdir).toHaveBeenCalledWith("/mock/config", { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(
      "/mock/config/identity-map.json",
      JSON.stringify(mockMap, null, 2),
      "utf-8",
    );
  });
});

describe("getMapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns mapping when it exists", async () => {
    const mockMapping: IdentityMapping = {
      id: "test-id",
      identities: { telegram: "123" },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const mockMap: IdentityMap = {
      version: 1,
      mappings: { "test-id": mockMapping },
    };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMap));

    const result = await getMapping("test-id");

    expect(result).toEqual(mockMapping);
  });

  it("returns null when mapping does not exist", async () => {
    const mockMap: IdentityMap = {
      version: 1,
      mappings: {},
    };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMap));

    const result = await getMapping("non-existent");

    expect(result).toBeNull();
  });
});

describe("setMapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates new mapping with timestamps", async () => {
    const mockMap: IdentityMap = { version: 1, mappings: {} };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMap));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const newMapping: IdentityMapping = {
      id: "new-id",
      identities: { telegram: "456" },
      createdAt: "",
      updatedAt: "",
    };

    await setMapping(newMapping);

    expect(fs.writeFile).toHaveBeenCalled();
    const savedData = JSON.parse(
      vi.mocked(fs.writeFile).mock.calls[0][1] as string,
    );
    expect(savedData.mappings["new-id"]).toMatchObject({
      id: "new-id",
      identities: { telegram: "456" },
      createdAt: "2024-01-15T12:00:00.000Z",
      updatedAt: "2024-01-15T12:00:00.000Z",
    });
  });

  it("updates existing mapping with new timestamp", async () => {
    const existingMapping: IdentityMapping = {
      id: "existing-id",
      identities: { telegram: "789" },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const mockMap: IdentityMap = {
      version: 1,
      mappings: { "existing-id": existingMapping },
    };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMap));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const updatedMapping: IdentityMapping = {
      ...existingMapping,
      identities: { telegram: "789", whatsapp: "+9999" },
    };

    await setMapping(updatedMapping);

    const savedData = JSON.parse(
      vi.mocked(fs.writeFile).mock.calls[0][1] as string,
    );
    expect(savedData.mappings["existing-id"]).toMatchObject({
      id: "existing-id",
      identities: { telegram: "789", whatsapp: "+9999" },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-15T12:00:00.000Z",
    });
  });
});

describe("deleteMapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes mapping and returns true", async () => {
    const mockMap: IdentityMap = {
      version: 1,
      mappings: {
        "to-delete": {
          id: "to-delete",
          identities: { telegram: "123" },
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      },
    };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMap));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await deleteMapping("to-delete");

    expect(result).toBe(true);
    const savedData = JSON.parse(
      vi.mocked(fs.writeFile).mock.calls[0][1] as string,
    );
    expect(savedData.mappings["to-delete"]).toBeUndefined();
  });

  it("returns false when mapping does not exist", async () => {
    const mockMap: IdentityMap = { version: 1, mappings: {} };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMap));

    const result = await deleteMapping("non-existent");

    expect(result).toBe(false);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

describe("listMappings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all mappings as array", async () => {
    const mapping1: IdentityMapping = {
      id: "id-1",
      identities: { telegram: "111" },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const mapping2: IdentityMapping = {
      id: "id-2",
      identities: { whatsapp: "+2222" },
      createdAt: "2024-01-02T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
    };
    const mockMap: IdentityMap = {
      version: 1,
      mappings: { "id-1": mapping1, "id-2": mapping2 },
    };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMap));

    const result = await listMappings();

    expect(result).toEqual([mapping1, mapping2]);
  });

  it("returns empty array when no mappings exist", async () => {
    const mockMap: IdentityMap = { version: 1, mappings: {} };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMap));

    const result = await listMappings();

    expect(result).toEqual([]);
  });
});

describe("findMappingByIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds mapping by Telegram identity", async () => {
    const mockMapping: IdentityMapping = {
      id: "test-id",
      identities: { telegram: "123456", whatsapp: "+1234" },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const mockMap: IdentityMap = {
      version: 1,
      mappings: { "test-id": mockMapping },
    };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMap));

    const result = await findMappingByIdentity("telegram", "123456");

    expect(result).toEqual(mockMapping);
  });

  it("finds mapping by WhatsApp identity", async () => {
    const mockMapping: IdentityMapping = {
      id: "test-id",
      identities: { telegram: "123456", whatsapp: "+1234" },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const mockMap: IdentityMap = {
      version: 1,
      mappings: { "test-id": mockMapping },
    };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMap));

    const result = await findMappingByIdentity("whatsapp", "+1234");

    expect(result).toEqual(mockMapping);
  });

  it("finds mapping by Twilio identity", async () => {
    const mockMapping: IdentityMapping = {
      id: "test-id",
      identities: { twilio: "+5678", whatsapp: "+1234" },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };
    const mockMap: IdentityMap = {
      version: 1,
      mappings: { "test-id": mockMapping },
    };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMap));

    const result = await findMappingByIdentity("twilio", "+5678");

    expect(result).toEqual(mockMapping);
  });

  it("returns null when identity not found", async () => {
    const mockMap: IdentityMap = {
      version: 1,
      mappings: {
        "test-id": {
          id: "test-id",
          identities: { telegram: "999" },
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      },
    };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMap));

    const result = await findMappingByIdentity("telegram", "123");

    expect(result).toBeNull();
  });

  it("returns null when no mappings exist", async () => {
    const mockMap: IdentityMap = { version: 1, mappings: {} };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMap));

    const result = await findMappingByIdentity("whatsapp", "+1234");

    expect(result).toBeNull();
  });
});
