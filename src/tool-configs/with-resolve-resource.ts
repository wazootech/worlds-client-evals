import { createWithResolveResourceTools } from "../tools/with-resolve-resource-tools.ts";
import type { ToolConfig } from "./types.ts";

/** withResolveResourceToolConfig adds a resolveResource convenience tool to the baseline set. */
export const withResolveResourceToolConfig: ToolConfig = {
  id: "with-resolve-resource",
  description:
    "Baseline tools plus resolveResource for direct URI property lookup.",
  discoveryName: "searchWorld",
  queryName: "executeSparql",
  requiredToolNames: ["searchWorld", "executeSparql"],
  guardErrorSubstring: "Only read-only SPARQL queries are allowed",
  factory: createWithResolveResourceTools,
  systemPromptAdditions:
    `resolveResource provides a simpler way to inspect a resource: pass a subject URI and receive all its predicate-object pairs. You may use resolveResource after searchWorld instead of writing a SPARQL SELECT query.`,
};
