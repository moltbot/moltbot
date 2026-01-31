import { describe, it, expect, beforeAll, afterAll } from "vitest";
import process from "node:process";

import {
  installUnhandledRejectionHandler,
  isTransientNetworkError,
  isAbortError,
} from "./unhandled-rejections.js";
import { ignoreCiaoCancellationRejection } from "./bonjour-ciao.js";
import { registerUnhandledRejectionHandler } from "./unhandled-rejections.js";

describe("mDNS error handling integration", () => {
  let originalExit: typeof process.exit;

  beforeAll(() => {
    originalExit = process.exit.bind(process);
    installUnhandledRejectionHandler();
    registerUnhandledRejectionHandler(ignoreCiaoCancellationRejection);
  });

  afterAll(() => {
    process.exit = originalExit;
  });

  describe("error detection functions", () => {
    it("detects IPv4 address change as transient network error", () => {
      const mdnsError = Object.assign(
        new Error("Reached illegal state! IPv4 address changed from undefined to defined!"),
        {
          name: "AssertionError",
          code: "ERR_ASSERTION",
        },
      );

      expect(isTransientNetworkError(mdnsError)).toBe(true);
    });

    it("detects MDNSServer illegal state as transient network error", () => {
      const mdnsError = new Error("MDNSServer: Reached illegal state during network update");

      expect(isTransientNetworkError(mdnsError)).toBe(true);
    });

    it("detects AbortError correctly", () => {
      const abortError = Object.assign(new Error("This operation was aborted"), {
        name: "AbortError",
      });

      expect(isAbortError(abortError)).toBe(true);
    });

    it("does not treat fatal errors as transient", () => {
      const fatalError = Object.assign(new Error("Out of memory"), {
        code: "ERR_OUT_OF_MEMORY",
      });

      expect(isTransientNetworkError(fatalError)).toBe(false);
    });
  });

  describe("ciao cancellation handler", () => {
    it("handles CIAO announcement cancelled error", () => {
      const ciaoError = new Error("CIAO announcement cancelled due to network change");

      expect(ignoreCiaoCancellationRejection(ciaoError)).toBe(true);
    });

    it("handles IPv4 address change error", () => {
      const mdnsError = Object.assign(
        new Error("Reached illegal state! IPv4 address changed from undefined to defined!"),
        {
          name: "AssertionError",
          code: "ERR_ASSERTION",
        },
      );

      expect(ignoreCiaoCancellationRejection(mdnsError)).toBe(true);
    });

    it("handles MDNSServer illegal state error", () => {
      const mdnsError = Object.assign(new Error("MDNSServer: Reached illegal state"), {
        name: "AssertionError",
      });

      expect(ignoreCiaoCancellationRejection(mdnsError)).toBe(true);
    });

    it("does not handle unrelated errors", () => {
      const genericError = new Error("Something went wrong");

      expect(ignoreCiaoCancellationRejection(genericError)).toBe(false);
    });
  });
});
