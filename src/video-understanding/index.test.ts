import { describe, expect, it } from "vitest";
import type { ClawdbotConfig } from "../config/config.js";
import { isVideo, isVideoUnderstandingEnabledForChat } from "./index.js";

describe("isVideo", () => {
  it("returns true for video/mp4", () => {
    expect(isVideo("video/mp4")).toBe(true);
  });

  it("returns true for video/webm", () => {
    expect(isVideo("video/webm")).toBe(true);
  });

  it("returns true for video/quicktime", () => {
    expect(isVideo("video/quicktime")).toBe(true);
  });

  it("returns true for video/3gpp", () => {
    expect(isVideo("video/3gpp")).toBe(true);
  });

  it("returns false for audio/ogg", () => {
    expect(isVideo("audio/ogg")).toBe(false);
  });

  it("returns false for image/jpeg", () => {
    expect(isVideo("image/jpeg")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isVideo(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isVideo(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isVideo("")).toBe(false);
  });
});

describe("isVideoUnderstandingEnabledForChat", () => {
  const baseCfg: ClawdbotConfig = {
    video: {
      understanding: {
        enabled: true,
        dmEnabled: true,
        groupEnabled: false,
      },
    },
  };

  describe("when video understanding is disabled", () => {
    it("returns false for DM", () => {
      const cfg: ClawdbotConfig = {
        video: { understanding: { enabled: false } },
      };
      expect(
        isVideoUnderstandingEnabledForChat(cfg, "direct", "123@s.whatsapp.net"),
      ).toBe(false);
    });

    it("returns false when video is undefined", () => {
      const cfg: ClawdbotConfig = {};
      expect(
        isVideoUnderstandingEnabledForChat(cfg, "direct", "123@s.whatsapp.net"),
      ).toBe(false);
    });
  });

  describe("DM video understanding", () => {
    it("is enabled by default when understanding is enabled", () => {
      const cfg: ClawdbotConfig = {
        video: { understanding: { enabled: true } },
      };
      expect(
        isVideoUnderstandingEnabledForChat(cfg, "direct", "123@s.whatsapp.net"),
      ).toBe(true);
    });

    it("can be explicitly disabled", () => {
      const cfg: ClawdbotConfig = {
        video: { understanding: { enabled: true, dmEnabled: false } },
      };
      expect(
        isVideoUnderstandingEnabledForChat(cfg, "direct", "123@s.whatsapp.net"),
      ).toBe(false);
    });
  });

  describe("group video understanding", () => {
    it("is disabled by default", () => {
      expect(
        isVideoUnderstandingEnabledForChat(
          baseCfg,
          "group",
          "123@g.us",
          "Family",
        ),
      ).toBe(false);
    });

    it("allows all groups when groupEnabled is true and no allowlist", () => {
      const cfg: ClawdbotConfig = {
        video: {
          understanding: { enabled: true, groupEnabled: true },
        },
      };
      expect(
        isVideoUnderstandingEnabledForChat(cfg, "group", "123@g.us", "Family"),
      ).toBe(true);
    });

    it("allows groups by JID in allowlist", () => {
      const cfg: ClawdbotConfig = {
        video: {
          understanding: {
            enabled: true,
            groupEnabled: true,
            groupAllowFrom: ["123@g.us"],
          },
        },
      };
      expect(
        isVideoUnderstandingEnabledForChat(cfg, "group", "123@g.us", "Family"),
      ).toBe(true);
      expect(
        isVideoUnderstandingEnabledForChat(cfg, "group", "456@g.us", "Work"),
      ).toBe(false);
    });

    it("allows groups by subject name in allowlist", () => {
      const cfg: ClawdbotConfig = {
        video: {
          understanding: {
            enabled: true,
            groupEnabled: true,
            groupAllowFrom: ["Family Group"],
          },
        },
      };
      expect(
        isVideoUnderstandingEnabledForChat(
          cfg,
          "group",
          "123@g.us",
          "Family Group",
        ),
      ).toBe(true);
      expect(
        isVideoUnderstandingEnabledForChat(
          cfg,
          "group",
          "456@g.us",
          "Work Group",
        ),
      ).toBe(false);
    });

    it("allows all groups with wildcard in allowlist", () => {
      const cfg: ClawdbotConfig = {
        video: {
          understanding: {
            enabled: true,
            groupEnabled: true,
            groupAllowFrom: ["*"],
          },
        },
      };
      expect(
        isVideoUnderstandingEnabledForChat(cfg, "group", "123@g.us", "Any"),
      ).toBe(true);
    });

    it("rejects groups not in allowlist", () => {
      const cfg: ClawdbotConfig = {
        video: {
          understanding: {
            enabled: true,
            groupEnabled: true,
            groupAllowFrom: ["Allowed Group"],
          },
        },
      };
      expect(
        isVideoUnderstandingEnabledForChat(
          cfg,
          "group",
          "123@g.us",
          "Other Group",
        ),
      ).toBe(false);
    });
  });
});
