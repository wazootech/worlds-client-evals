import { assertEquals, assertThrows } from "@std/assert";
import {
  compileEvalPrompt,
  resolveToolConfig,
} from "../../src/tool-configs/index.ts";

Deno.test("resolveToolConfig returns the baseline config", () => {
  const toolConfig = resolveToolConfig("baseline");

  assertEquals(toolConfig.discoveryName, "searchWorld");
  assertEquals(toolConfig.queryName, "executeSparql");
  assertEquals(toolConfig.requiredToolNames, ["searchWorld", "executeSparql"]);
});

Deno.test("resolveToolConfig rejects unknown configs", () => {
  assertThrows(
    () => resolveToolConfig("unknown"),
    Error,
    "Unknown tool config",
  );
});

Deno.test("compileEvalPrompt replaces semantic tool placeholders", () => {
  const baselineConfig = resolveToolConfig("baseline");

  assertEquals(
    compileEvalPrompt("Use {{discovery}} then {{query}}.", baselineConfig),
    "Use searchWorld then executeSparql.",
  );
});

Deno.test("strict-eval config has system prompt additions", () => {
  const toolConfig = resolveToolConfig("strict-eval");

  assertEquals(toolConfig.id, "strict-eval");
  assertEquals(typeof toolConfig.systemPromptAdditions, "string");
  assertEquals(
    toolConfig.systemPromptAdditions!.includes("Never exceed"),
    true,
  );
});
