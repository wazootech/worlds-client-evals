import type { Client } from "@worlds/client";
import { tool } from "ai";
import { z } from "zod";
import { createEvalTools } from "./eval-tools.ts";

/** createWithResolveResourceTools creates baseline tools plus a resolveResource convenience tool. */
export function createWithResolveResourceTools(client: Client) {
  const baselineTools = createEvalTools(client);
  return {
    ...baselineTools,
    resolveResource: tool({
      description:
        "Look up all properties of a resource by its subject URI. Returns predicate-object pairs for the given resource. Use this after searchWorld when you need to inspect what properties a resource has, without writing a SPARQL query.",
      inputSchema: z.object({
        uri: z.string().describe(
          "The subject URI to resolve. Must be a full absolute IRI.",
        ),
      }),
      execute: async (request: { uri: string }) => {
        try {
          const response = await client.sparql({
            query: `SELECT ?p ?o WHERE { <${request.uri}> ?p ?o }`,
          });
          return {
            success: true,
            subject: request.uri,
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
