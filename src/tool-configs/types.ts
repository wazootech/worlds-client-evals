import type { ClientInterface } from "@worlds/sdk";
import type { ToolSet } from "ai";

/** ToolConfig describes one named tool set that can run the eval suite. */
export interface ToolConfig {
  id: string;
  description: string;
  discoveryName: string;
  queryName: string;
  requiredToolNames: string[];
  guardErrorSubstring?: string;
  systemPromptAdditions?: string;
  factory: (client: ClientInterface) => ToolSet;
}
