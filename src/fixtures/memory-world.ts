import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { createLibsqlClient } from "@worlds/libsql";
import type { ClientInterface } from "@worlds/sdk";

import { GENID_BASE, WAZOO_VOCAB_NAMESPACE } from "./constants.ts";
export { GENID_BASE, WAZOO_VOCAB_NAMESPACE };

/** MEMORY_AGENT_SUBJECT_URI is the canonical subject IRI for the seeded agent entity. */
export const MEMORY_AGENT_SUBJECT_URI = `${GENID_BASE}b7c8d9e0f1a2b3c4`;

/** MEMORY_AGENT_SEARCH_LABEL is the opaque rdfs:label literal used in search prompts. */
export const MEMORY_AGENT_SEARCH_LABEL = "v3Lm8QnR";

/** MEMORY_STALE_AFFILIATION_LITERAL is the superseded session-1 affiliation literal. */
export const MEMORY_STALE_AFFILIATION_LITERAL = "f4Hp1WkT";

/** MEMORY_CURRENT_AFFILIATION_LITERAL is the authoritative session-2 affiliation literal. */
export const MEMORY_CURRENT_AFFILIATION_LITERAL = "s9Jc6YvB";

/** UNKNOWN_MEMORY_AGENT_SEARCH_LABEL is a label absent from the seeded graph for search-miss scenarios. */
export const UNKNOWN_MEMORY_AGENT_SEARCH_LABEL = "u2Nk5XrP";

const SEEDED_MEMORY_DATA = `
  @prefix vocab: <${WAZOO_VOCAB_NAMESPACE}> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
  <${MEMORY_AGENT_SUBJECT_URI}> rdfs:label "${MEMORY_AGENT_SEARCH_LABEL}" ;
                                vocab:affiliationAtSession1 "${MEMORY_STALE_AFFILIATION_LITERAL}" ;
                                vocab:currentAffiliation "${MEMORY_CURRENT_AFFILIATION_LITERAL}" .
`;

/** createSeededMemoryWorldClient builds a fresh in-memory world with the memory graph. */
export async function createSeededMemoryWorldClient(): Promise<ClientInterface> {
  const libsqlClient = createClient({ url: ":memory:" });
  const queryEngine = new QueryEngine();
  const client = await createLibsqlClient({
    client: libsqlClient,
    queryEngine,
  });

  await client.import({
    source: {
      kind: "serialized",
      data: SEEDED_MEMORY_DATA,
      contentType: "text/turtle",
    },
  });

  return client;
}
