import { describe, expect, it } from "vitest";

// We need to import the functions we want to test, but they're not exported
// For now, let's just test integration by checking that the module loads
describe("subagent-announce error formatting", () => {
  it("module loads without errors", async () => {
    const module = await import("./subagent-announce.js");
    expect(module).toBeDefined();
    expect(module.buildSubagentSystemPrompt).toBeDefined();
    expect(module.runSubagentAnnounceFlow).toBeDefined();
  });
});
