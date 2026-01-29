import { describe, expect, it, vi, beforeEach } from "vitest";

import { checkCopilotAvailable } from "./copilot-sdk.js";
import * as copilotCredentials from "./copilot-credentials.js";

vi.mock("./copilot-credentials.js", () => ({
  isCopilotCliInstalled: vi.fn(),
  readCopilotAuthStatusCached: vi.fn(),
}));

describe("copilot-sdk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkCopilotAvailable", () => {
    it("returns not available when CLI is not installed", () => {
      vi.mocked(copilotCredentials.isCopilotCliInstalled).mockReturnValue(false);

      const result = checkCopilotAvailable();

      expect(result).toEqual({
        available: false,
        authenticated: false,
      });
    });

    it("returns available but not authenticated when CLI is installed but not authenticated", () => {
      vi.mocked(copilotCredentials.isCopilotCliInstalled).mockReturnValue(true);
      vi.mocked(copilotCredentials.readCopilotAuthStatusCached).mockReturnValue({
        authenticated: false,
      });

      const result = checkCopilotAvailable();

      expect(result).toEqual({
        available: true,
        authenticated: false,
      });
    });

    it("returns available and authenticated with user info when CLI is authenticated", () => {
      vi.mocked(copilotCredentials.isCopilotCliInstalled).mockReturnValue(true);
      vi.mocked(copilotCredentials.readCopilotAuthStatusCached).mockReturnValue({
        authenticated: true,
        login: "testuser",
        avatarUrl: "https://example.com/avatar.png",
      });

      const result = checkCopilotAvailable();

      expect(result).toEqual({
        available: true,
        authenticated: true,
        login: "testuser",
        avatarUrl: "https://example.com/avatar.png",
      });
    });

    it("returns available but not authenticated when auth status is null", () => {
      vi.mocked(copilotCredentials.isCopilotCliInstalled).mockReturnValue(true);
      vi.mocked(copilotCredentials.readCopilotAuthStatusCached).mockReturnValue(null);

      const result = checkCopilotAvailable();

      expect(result).toEqual({
        available: true,
        authenticated: false,
      });
    });

    it("passes cliPath option to credential functions", () => {
      vi.mocked(copilotCredentials.isCopilotCliInstalled).mockReturnValue(true);
      vi.mocked(copilotCredentials.readCopilotAuthStatusCached).mockReturnValue({
        authenticated: true,
      });

      checkCopilotAvailable({ cliPath: "/custom/path/copilot" });

      expect(copilotCredentials.isCopilotCliInstalled).toHaveBeenCalledWith({
        cliPath: "/custom/path/copilot",
      });
      expect(copilotCredentials.readCopilotAuthStatusCached).toHaveBeenCalledWith(
        expect.objectContaining({
          cliPath: "/custom/path/copilot",
        }),
      );
    });
  });
});
