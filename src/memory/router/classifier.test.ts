import { describe, expect, it } from "vitest";

import { classifyQuery, classifyQueryWithEmbeddings, type QueryIntent } from "./classifier.js";

describe("router/classifier", () => {
  describe("classifyQuery", () => {
    describe("episodic intent detection", () => {
      it("detects 'what did we discuss' pattern", () => {
        const result = classifyQuery("What did we discuss about the API design?");

        expect(result.intent).toBe("episodic");
        expect(result.suggestedStrategy).toBe("vector_first");
        expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      });

      it("detects 'when did we' pattern", () => {
        const result = classifyQuery("When did we decide on the database schema?");

        expect(result.intent).toBe("episodic");
      });

      it("detects 'last time we' pattern", () => {
        const result = classifyQuery("Last time we talked about security measures");

        expect(result.intent).toBe("episodic");
      });

      it("detects 'remember when' pattern", () => {
        const result = classifyQuery("Remember when we implemented caching?");

        expect(result.intent).toBe("episodic");
      });

      it("detects 'in our previous' pattern", () => {
        const result = classifyQuery("In our previous meeting, what was decided?");

        expect(result.intent).toBe("episodic");
      });
    });

    describe("factual intent detection", () => {
      it("detects 'what does X use' pattern", () => {
        const result = classifyQuery("What does Tom use for testing?");

        expect(result.intent).toBe("factual");
        expect(result.suggestedStrategy).toBe("kg_first");
      });

      it("detects 'what does X prefer' pattern", () => {
        // Pattern requires single word after "does" - use "Tom" not "the team"
        const result = classifyQuery("What does Tom prefer for CI/CD?");

        expect(result.intent).toBe("factual");
      });

      it("detects 'what is X's favorite' pattern", () => {
        const result = classifyQuery("What is Alice's favorite framework?");

        expect(result.intent).toBe("factual");
      });

      it("detects 'how does X work' pattern", () => {
        // Pattern requires single word after "does" - use "caching" not "the router"
        const result = classifyQuery("How does caching work?");

        expect(result.intent).toBe("factual");
        expect(result.suggestedStrategy).toBe("hybrid");
      });

      it("detects 'what are the features' pattern", () => {
        const result = classifyQuery("What are the features of the memory system?");

        expect(result.intent).toBe("factual");
      });
    });

    describe("relational intent detection", () => {
      it("detects 'who knows' pattern", () => {
        const result = classifyQuery("Who knows about Kubernetes?");

        expect(result.intent).toBe("relational");
        expect(result.suggestedStrategy).toBe("kg_first");
      });

      it("detects 'who works with' pattern", () => {
        const result = classifyQuery("Who works with the frontend team?");

        expect(result.intent).toBe("relational");
      });

      it("detects 'what projects involve' pattern", () => {
        const result = classifyQuery("What projects involve both TypeScript and React?");

        expect(result.intent).toBe("relational");
      });

      it("detects 'is X related to' pattern", () => {
        // Pattern requires single word after "is" - use "OpenClaw" not "the memory system"
        const result = classifyQuery("Is OpenClaw related to Claude?");

        expect(result.intent).toBe("relational");
        expect(result.suggestedStrategy).toBe("kg_only");
      });

      it("detects 'relationship between' pattern", () => {
        const result = classifyQuery("What is the relationship between these modules?");

        expect(result.intent).toBe("relational");
        expect(result.suggestedStrategy).toBe("kg_only");
      });
    });

    describe("planning intent detection", () => {
      it("detects 'how should we handle' pattern", () => {
        const result = classifyQuery("How should we handle authentication?");

        expect(result.intent).toBe("planning");
        expect(result.suggestedStrategy).toBe("hybrid");
      });

      it("detects 'what approach should' pattern", () => {
        const result = classifyQuery("What approach should we take for caching?");

        expect(result.intent).toBe("planning");
      });

      it("detects 'given X, how' pattern", () => {
        const result = classifyQuery("Given the deadline, how should we prioritize?");

        expect(result.intent).toBe("planning");
      });

      it("detects 'considering X, should' pattern", () => {
        const result = classifyQuery("Considering the constraints, should we use microservices?");

        expect(result.intent).toBe("planning");
      });
    });

    describe("unknown intent handling", () => {
      it("returns unknown for unmatched queries", () => {
        const result = classifyQuery("Hello world");

        expect(result.intent).toBe("unknown");
        expect(result.suggestedStrategy).toBe("vector_first");
        expect(result.confidence).toBeLessThan(0.5);
      });

      it("defaults to vector_first strategy for unknown", () => {
        const result = classifyQuery("Something completely random");

        expect(result.suggestedStrategy).toBe("vector_first");
      });
    });

    describe("entity extraction", () => {
      it("extracts capitalized entity names", () => {
        const result = classifyQuery("What did Tom discuss with Alice about OpenClaw?");

        expect(result.extractedEntities).toContain("Tom");
        expect(result.extractedEntities).toContain("Alice");
        expect(result.extractedEntities).toContain("OpenClaw");
      });

      it("filters common words", () => {
        const result = classifyQuery("What did We discuss about The project?");

        expect(result.extractedEntities).not.toContain("We");
        expect(result.extractedEntities).not.toContain("The");
        expect(result.extractedEntities).not.toContain("What");
      });

      it("deduplicates entities", () => {
        const result = classifyQuery("Tom and Tom discussed Tom's project");

        const tomCount = result.extractedEntities.filter((e) => e === "Tom").length;
        expect(tomCount).toBeLessThanOrEqual(1);
      });

      it("handles empty queries", () => {
        const result = classifyQuery("");

        expect(result.intent).toBe("unknown");
        expect(result.extractedEntities).toHaveLength(0);
      });
    });

    describe("case insensitivity", () => {
      it("matches patterns regardless of case", () => {
        const lower = classifyQuery("what did we discuss about this?");
        const upper = classifyQuery("WHAT DID WE DISCUSS ABOUT THIS?");
        const mixed = classifyQuery("What Did We Discuss About This?");

        expect(lower.intent).toBe("episodic");
        expect(upper.intent).toBe("episodic");
        expect(mixed.intent).toBe("episodic");
      });
    });

    describe("retrieval strategy selection", () => {
      const strategyTestCases: Array<{
        query: string;
        expectedIntent: QueryIntent;
        expectedStrategy: string;
      }> = [
        {
          query: "What did we discuss last week?",
          expectedIntent: "episodic",
          expectedStrategy: "vector_first",
        },
        {
          query: "What does Tom prefer?",
          expectedIntent: "factual",
          expectedStrategy: "kg_first",
        },
        {
          query: "Who knows about React?",
          expectedIntent: "relational",
          expectedStrategy: "kg_first",
        },
        {
          query: "Is OpenClaw related to Claude?",
          expectedIntent: "relational",
          expectedStrategy: "kg_only",
        },
        {
          query: "How should we approach this?",
          expectedIntent: "planning",
          expectedStrategy: "hybrid",
        },
      ];

      for (const { query, expectedIntent, expectedStrategy } of strategyTestCases) {
        it(`selects ${expectedStrategy} for "${query.substring(0, 30)}..."`, () => {
          const result = classifyQuery(query);
          expect(result.intent).toBe(expectedIntent);
          expect(result.suggestedStrategy).toBe(expectedStrategy);
        });
      }
    });
  });

  describe("classifyQueryWithEmbeddings", () => {
    it("falls back to pattern-based classification", async () => {
      const result = await classifyQueryWithEmbeddings("What did we discuss about security?");

      // Should return same result as pattern-based for now
      expect(result.intent).toBe("episodic");
      expect(result.suggestedStrategy).toBe("vector_first");
    });

    it("handles async call correctly", async () => {
      const result = await classifyQueryWithEmbeddings("Random query");

      expect(result).toHaveProperty("intent");
      expect(result).toHaveProperty("confidence");
      expect(result).toHaveProperty("suggestedStrategy");
      expect(result).toHaveProperty("extractedEntities");
    });
  });
});
