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

Deno.test("resolveToolConfig returns the with-resolve-resource config", () => {
  const toolConfig = resolveToolConfig("with-resolve-resource");

  assertEquals(toolConfig.id, "with-resolve-resource");
  assertEquals(toolConfig.discoveryName, "searchWorld");
  assertEquals(toolConfig.queryName, "executeSparql");
  assertEquals(toolConfig.requiredToolNames, ["searchWorld", "executeSparql"]);
  assertEquals(typeof toolConfig.factory, "function");
});

Deno.test("with-resolve-resource config has system prompt additions", () => {
  const toolConfig = resolveToolConfig("with-resolve-resource");

  assertEquals(typeof toolConfig.systemPromptAdditions, "string");
  assertEquals(
    toolConfig.systemPromptAdditions!.length > 0,
    true,
  );
  assertEquals(
    toolConfig.systemPromptAdditions!.includes("resolveResource"),
    true,
  );
});

Deno.test("compileEvalPrompt works with with-resolve-resource config", () => {
  const toolConfig = resolveToolConfig("with-resolve-resource");

  assertEquals(
    compileEvalPrompt("Use {{discovery}} then {{query}}.", toolConfig),
    "Use searchWorld then executeSparql.",
  );
});
