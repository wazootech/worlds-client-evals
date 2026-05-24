import { createEvalTools } from "@/tools/create-eval-tools.ts";
import { strictEvalToolConfig } from "./strict-eval-tool-config.ts";
import type { ToolConfig } from "./types.ts";

const baselineToolConfig: ToolConfig = {
  id: "baseline",
  description: "Search discovery followed by read-only SPARQL traversal.",
  discoveryName: "searchWorld",
  queryName: "executeSparql",
  requiredToolNames: ["searchWorld", "executeSparql"],
  guardErrorSubstring: "Only read-only SPARQL queries are allowed",
  factory: createEvalTools,
};

/** toolConfigsById stores every named tool configuration available to evals. */
export const toolConfigsById: Record<string, ToolConfig> = {
  [baselineToolConfig.id]: baselineToolConfig,
  [strictEvalToolConfig.id]: strictEvalToolConfig,
};

/** defaultToolConfigId identifies the backwards-compatible eval tool set. */
export const defaultToolConfigId = baselineToolConfig.id;

/** resolveToolConfig returns a named tool config or throws a descriptive error. */
export function resolveToolConfig(toolConfigId: string): ToolConfig {
  const toolConfig = toolConfigsById[toolConfigId];
  if (!toolConfig) {
    throw new Error(
      `Unknown tool config: ${toolConfigId}. Available configs: ${Object.keys(
        toolConfigsById,
      ).join(", ")}`,
    );
  }
  return toolConfig;
}

/** resolveToolConfigs returns multiple named tool configs in the requested order. */
export function resolveToolConfigs(toolConfigIds: string[]): ToolConfig[] {
  return toolConfigIds.map(resolveToolConfig);
}

/** compileEvalPrompt substitutes semantic tool placeholders in an eval prompt. */
export function compileEvalPrompt(
  promptTemplate: string,
  toolConfig: ToolConfig,
): string {
  return promptTemplate
    .replaceAll("{{discovery}}", toolConfig.discoveryName)
    .replaceAll("{{query}}", toolConfig.queryName);
}
