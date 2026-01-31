import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reverseGeocode, formatGeocodedLocation } from "./geocoding.js";

describe("geocoding", () => {
  describe("reverseGeocode", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns null when disabled", async () => {
      const result = await reverseGeocode(51.5074, -0.1278, { enabled: false });
      expect(result).toBeNull();
    });

    it("returns null when provider is none", async () => {
      const result = await reverseGeocode(51.5074, -0.1278, {
        enabled: true,
        provider: "none",
      });
      expect(result).toBeNull();
    });
  });

  describe("formatGeocodedLocation", () => {
    it("formats coordinates only when no geocoding result", () => {
      const result = formatGeocodedLocation(51.5074, -0.1278, null);
      expect(result).toBe("📍 51.507400, -0.127800");
    });

    it("formats with address when available", () => {
      const result = formatGeocodedLocation(51.5074, -0.1278, {
        name: "10 Downing Street",
        address: "10 Downing Street, Westminster, London, SW1A 2AA, UK",
      });
      expect(result).toContain("10 Downing Street");
      expect(result).toContain("51.507400, -0.127800");
    });

    it("formats with name only", () => {
      const result = formatGeocodedLocation(51.5074, -0.1278, {
        name: "Westminster",
      });
      expect(result).toBe("📍 Westminster (51.507400, -0.127800)");
    });
  });
});
