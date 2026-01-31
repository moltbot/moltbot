import { afterEach, describe, expect, it, vi } from "vitest";

import { CHUTES_MODEL_CATALOG } from "../commands/onboard-auth.models.js";
import {
  discoverChutesModels,
  fetchChutesModels,
  mapChutesModelToDefinition,
} from "./chutes-models.js";

describe("chutes-models", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  describe("mapChutesModelToDefinition", () => {
    it("maps a full Chutes model entry correctly", () => {
      const entry = {
        id: "test-model",
        name: "Test Model",
        context_length: 1000,
        max_output_length: 500,
        confidential_compute: true,
        pricing: { prompt: 0.1, completion: 0.2 },
        supported_features: ["reasoning", "tools"],
      };

      const def = mapChutesModelToDefinition(entry);

      expect(def.id).toBe("test-model");
      expect(def.name).toBe("Test Model");
      expect(def.contextWindow).toBe(1000);
      expect(def.maxTokens).toBe(500);
      expect(def.confidentialCompute).toBe(true);
      expect(def.cost.input).toBe(0.1);
      expect(def.cost.output).toBe(0.2);
      expect(def.reasoning).toBe(true);
    });

    it("uses defaults for missing optional fields", () => {
      const entry = { id: "minimal-model" };
      const def = mapChutesModelToDefinition(entry);

      expect(def.id).toBe("minimal-model");
      expect(def.name).toBe("minimal-model");
      expect(def.contextWindow).toBe(128000);
      expect(def.maxTokens).toBe(4096);
      expect(def.confidentialCompute).toBeUndefined();
      expect(def.cost.input).toBe(0);
      expect(def.cost.output).toBe(0);
      expect(def.reasoning).toBe(false);
    });
  });

  describe("fetchChutesModels", () => {
    it("returns empty array and warns on fetch failure", async () => {
      const originalVitest = process.env.VITEST;
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.VITEST;
      process.env.NODE_ENV = "development";

      try {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
          }),
        );

        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const models = await fetchChutesModels();

        expect(models).toEqual([]);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Failed to fetch Chutes models: Internal Server Error"),
        );
      } finally {
        process.env.VITEST = originalVitest;
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it("returns empty array on network timeout", async () => {
      const originalVitest = process.env.VITEST;
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.VITEST;
      process.env.NODE_ENV = "development";

      try {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Timeout")));

        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const models = await fetchChutesModels();

        expect(models).toEqual([]);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Failed to fetch models: Error: Timeout"),
        );
      } finally {
        process.env.VITEST = originalVitest;
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it("returns empty array on malformed JSON", async () => {
      const originalVitest = process.env.VITEST;
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.VITEST;
      process.env.NODE_ENV = "development";

      try {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.reject(new Error("Invalid JSON")),
          }),
        );

        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const models = await fetchChutesModels();

        expect(models).toEqual([]);
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        process.env.VITEST = originalVitest;
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });

  describe("discoverChutesModels", () => {
    it("returns catalog when API returns no models", async () => {
      const originalVitest = process.env.VITEST;
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.VITEST;
      process.env.NODE_ENV = "development";

      try {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: [] }),
          }),
        );

        const models = await discoverChutesModels();
        expect(models.length).toBe(CHUTES_MODEL_CATALOG.length);
        expect(models[0].id).toBe(CHUTES_MODEL_CATALOG[0].id);
      } finally {
        process.env.VITEST = originalVitest;
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it("merges API models with catalog metadata", async () => {
      const originalVitest = process.env.VITEST;
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.VITEST;
      process.env.NODE_ENV = "development";

      try {
        const apiEntry = {
          id: CHUTES_MODEL_CATALOG[0].id,
          confidential_compute: true, // Override catalog
        };

        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: [apiEntry] }),
          }),
        );

        const models = await discoverChutesModels();
        expect(models.length).toBe(1);
        expect(models[0].id).toBe(apiEntry.id);
        expect(models[0].confidentialCompute).toBe(true);
        // Metadata from catalog should still be there
        expect(models[0].contextWindow).toBe(CHUTES_MODEL_CATALOG[0].contextWindow);
      } finally {
        process.env.VITEST = originalVitest;
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it("handles newly discovered models not in catalog", async () => {
      const originalVitest = process.env.VITEST;
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.VITEST;
      process.env.NODE_ENV = "development";

      try {
        const newModel = { id: "brand-new-model", name: "New Model" };

        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: [newModel] }),
          }),
        );

        const models = await discoverChutesModels();
        expect(models.length).toBe(1);
        expect(models[0].id).toBe("brand-new-model");
        expect(models[0].name).toBe("New Model");
      } finally {
        process.env.VITEST = originalVitest;
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    describe("teeOnly filtering", () => {
      it("filters TEE models correctly from API data", async () => {
        const originalVitest = process.env.VITEST;
        const originalNodeEnv = process.env.NODE_ENV;
        delete process.env.VITEST;
        process.env.NODE_ENV = "development";

        try {
          const apiModels = [
            { id: "non-tee", confidential_compute: false },
            { id: "tee-model", confidential_compute: true },
          ];

          vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
              ok: true,
              json: async () => ({ data: apiModels }),
            }),
          );

          const models = await discoverChutesModels({ teeOnly: true });
          expect(models.length).toBe(1);
          expect(models[0].id).toBe("tee-model");
          expect(models[0].confidentialCompute).toBe(true);
        } finally {
          process.env.VITEST = originalVitest;
          process.env.NODE_ENV = originalNodeEnv;
        }
      });

      it("filters TEE models from catalog when API fails", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            ok: false,
          }),
        );

        const models = await discoverChutesModels({ teeOnly: true });
        const catalogTeeCount = CHUTES_MODEL_CATALOG.filter(
          (m) => "confidentialCompute" in m && m.confidentialCompute,
        ).length;
        expect(models.length).toBe(catalogTeeCount);
        models.forEach((m) => expect(m.confidentialCompute).toBe(true));
      });

      it("returns full catalog when teeOnly is true but no TEE models found (fallback)", async () => {
        const originalVitest = process.env.VITEST;
        const originalNodeEnv = process.env.NODE_ENV;
        delete process.env.VITEST;
        process.env.NODE_ENV = "development";

        try {
          // API returns models but none are TEE
          vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
              ok: true,
              json: async () => ({ data: [{ id: "not-a-tee", confidential_compute: false }] }),
            }),
          );

          const models = await discoverChutesModels({ teeOnly: true });
          // Since api filtered results in 0 models, it should return full catalog
          expect(models.length).toBe(CHUTES_MODEL_CATALOG.length);
        } finally {
          process.env.VITEST = originalVitest;
          process.env.NODE_ENV = originalNodeEnv;
        }
      });
    });
  });
});
