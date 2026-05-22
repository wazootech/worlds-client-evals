import type { Client } from "@worlds/client";
import { tool } from "ai";
import { z } from "zod";
import {
  EXECUTE_SPARQL_TOOL_DESCRIPTION,
  SEARCH_WORLD_TOOL_DESCRIPTION,
} from "./agent-tool-descriptions.ts";
import { isReadOnlySparqlQuery } from "./is-read-only-sparql-query.ts";

/** createEvalTools creates the isolated tool set used by the Deno eval harness. */
export function createEvalTools(client: Client) {
  return {
    searchWorld: tool({
      description: SEARCH_WORLD_TOOL_DESCRIPTION,
      inputSchema: z.object({
        query: z.string().describe(
          "Exact label, keyword, or natural-language phrase to search for.",
        ),
      }),
      execute: async (request: { query: string }) => {
        try {
          const response = await client.search(request);
          return {
            success: true,
            ...response,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    }),
    executeSparql: tool({
      description: EXECUTE_SPARQL_TOOL_DESCRIPTION,
      inputSchema: z.object({
        query: z.string().describe(
          "The raw read-only SPARQL query string. Only SELECT and ASK are allowed.",
        ),
        baseIri: z.string().optional().describe(
          "Base IRI for the query execution.",
        ),
        timeoutMs: z.number().optional().describe(
          "Query timeout in milliseconds (defaults to 30 seconds).",
        ),
      }),
      execute: async (
        request: { query: string; baseIri?: string; timeoutMs?: number },
      ) => {
        if (!isReadOnlySparqlQuery(request.query)) {
          return {
            success: false,
            error:
              "Only read-only SPARQL queries are allowed for this agent. Please use SELECT or ASK.",
          };
        }

        try {
          const response = await client.sparql(request);
          return {
            success: true,
            data: response.kind === "void" ? null : response.data,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    }),
  };
}
