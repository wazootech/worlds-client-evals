import { expect, test } from "bun:test";
import { compileEvalPrompt, resolveToolConfig } from "@/tool-configs/index.ts";

test("resolveToolConfig returns the baseline config", () => {
  const toolConfig = resolveToolConfig("baseline");

  expect(toolConfig.discoveryName).toBe("searchWorld");
  expect(toolConfig.queryName).toBe("executeSparql");
  expect(toolConfig.requiredToolNames).toEqual([
    "searchWorld",
    "executeSparql",
  ]);
});

test("resolveToolConfig rejects unknown configs", () => {
  expect(() => resolveToolConfig("unknown")).toThrow("Unknown tool config");
});

test("compileEvalPrompt replaces semantic tool placeholders", () => {
  const baselineConfig = resolveToolConfig("baseline");

  expect(
    compileEvalPrompt("Use {{discovery}} then {{query}}.", baselineConfig),
  ).toBe("Use searchWorld then executeSparql.");
});

test("strict-eval config has system prompt additions", () => {
  const toolConfig = resolveToolConfig("strict-eval");

  expect(toolConfig.id).toBe("strict-eval");
  expect(typeof toolConfig.systemPromptAdditions).toBe("string");
  expect(toolConfig.systemPromptAdditions?.includes("Never exceed")).toBe(true);
});
