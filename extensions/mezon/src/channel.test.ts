import { describe, expect, it } from "vitest";

import { mezonPlugin } from "./channel.js";

describe("mezonPlugin", () => {
  describe("messaging", () => {
    it("keeps @username targets", () => {
      const normalize = mezonPlugin.messaging?.normalizeTarget;
      if (!normalize) {
        return;
      }

      expect(normalize("@Alice")).toBe("@Alice");
      expect(normalize("@alice")).toBe("@alice");
    });

    it("normalizes mezon: prefix to user:", () => {
      const normalize = mezonPlugin.messaging?.normalizeTarget;
      if (!normalize) {
        return;
      }

      expect(normalize("mezon:USER123")).toBe("user:USER123");
    });

    it("normalizes clan: prefix", () => {
      const normalize = mezonPlugin.messaging?.normalizeTarget;
      if (!normalize) {
        return;
      }

      expect(normalize("clan:CLAN123")).toBe("clan:CLAN123");
    });
  });

  describe("pairing", () => {
    it("normalizes allowlist entries", () => {
      const normalize = mezonPlugin.pairing?.normalizeAllowEntry;
      if (!normalize) {
        return;
      }

      expect(normalize("@Alice")).toBe("alice");
      expect(normalize("user:USER123")).toBe("user123");
    });
  });

  describe("config", () => {
    it("formats allowFrom entries", () => {
      const formatAllowFrom = mezonPlugin.config.formatAllowFrom;

      const formatted = formatAllowFrom({
        allowFrom: ["@Alice", "user:USER123", "mezon:BOT999"],
      });
      expect(formatted).toEqual(["@alice", "user123", "bot999"]);
    });
  });
});
