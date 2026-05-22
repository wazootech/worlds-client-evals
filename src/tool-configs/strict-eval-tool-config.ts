import { createEvalTools } from "../tools/create-eval-tools.ts";
import type { ToolConfig } from "./types.ts";

export const strictEvalToolConfig: ToolConfig = {
  id: "strict-eval",
  description: "Baseline tools with strict step discipline prompt addition.",
  discoveryName: "searchWorld",
  queryName: "executeSparql",
  requiredToolNames: ["searchWorld", "executeSparql"],
  guardErrorSubstring: "Only read-only SPARQL queries are allowed",
  factory: createEvalTools,
  systemPromptAdditions:
    "You MUST use exactly one searchWorld call and exactly one executeSparql call per case. Never exceed two total tool calls.",
};
