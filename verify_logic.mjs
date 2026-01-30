
// Logic from src/agents/pi-embedded-helpers/google.ts
function sanitizeToolUseInput(messages) {
  return messages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg;
    if (msg.role !== "assistant" && msg.role !== "toolUse") return msg;
    if (!Array.isArray(msg.content)) return msg;

    return {
      ...msg,
      content: msg.content.map((block) => {
        if (!block || typeof block !== "object") return block;
        if (block.type === "toolUse" || block.type === "toolCall") {
          // If input is missing, add empty object
          if (!("input" in block) || block.input === undefined) {
             return { ...block, input: {} };
          }
        }
        return block;
      }),
    };
  });
}

// Test cases
function runTests() {
  console.log("Running tests...");
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // Test 1: Add empty input
  const msgs1 = [
    {
      role: "assistant",
      content: [{ type: "toolUse", id: "1", name: "f" }],
    },
  ];
  const res1 = sanitizeToolUseInput(msgs1);
  assert(res1[0].content[0].input && Object.keys(res1[0].content[0].input).length === 0, "Should add empty input");

  // Test 2: Preserve existing input
  const msgs2 = [
    {
      role: "assistant",
      content: [{ type: "toolUse", id: "2", name: "f", input: { a: 1 } }],
    },
  ];
  const res2 = sanitizeToolUseInput(msgs2);
  assert(res2[0].content[0].input.a === 1, "Should preserve existing input");

  // Test 3: Ignore other roles
  const msgs3 = [{ role: "user", content: "hi" }];
  const res3 = sanitizeToolUseInput(msgs3);
  assert(res3[0] === msgs3[0], "Should ignore user messages");

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runTests();
