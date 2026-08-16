import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { createLibsqlClient } from "@worlds/libsql";
import type { ClientInterface } from "@worlds/sdk";

import { GENID_BASE, WAZOO_VOCAB_NAMESPACE } from "./constants.ts";
export { GENID_BASE, WAZOO_VOCAB_NAMESPACE };

/** PAPER_SUBJECT_URI is the canonical subject IRI for the seeded paper entity. */
export const PAPER_SUBJECT_URI = `${GENID_BASE}a1b2c3d4e5f6a7b8`;

/** SCHOLAR_PAPER_SEARCH_LABEL is the opaque rdfs:label literal used in search prompts. */
export const SCHOLAR_PAPER_SEARCH_LABEL = "kL9mN4pQ";

/** SCHOLAR_AUTHOR_LITERAL is the opaque vocab:author literal on the paper entity. */
export const SCHOLAR_AUTHOR_LITERAL = "dR7sT2vW";

/** SCHOLAR_VENUE_LITERAL is the opaque vocab:venue literal for the publication venue. */
export const SCHOLAR_VENUE_LITERAL = "xY5zA8bC";

/** PAPER_YEAR_LITERAL is the opaque vocab:year literal for the publication year. */
export const PAPER_YEAR_LITERAL = "2024";

const SEEDED_SCHOLAR_DATA = `
  @prefix vocab: <${WAZOO_VOCAB_NAMESPACE}> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
  <${PAPER_SUBJECT_URI}> rdfs:label "${SCHOLAR_PAPER_SEARCH_LABEL}" ;
                         vocab:author "${SCHOLAR_AUTHOR_LITERAL}" ;
                         vocab:venue "${SCHOLAR_VENUE_LITERAL}" ;
                         vocab:year "${PAPER_YEAR_LITERAL}" .
`;

/** createSeededScholarWorldClient builds a fresh in-memory world with the scholar graph. */
export async function createSeededScholarWorldClient(): Promise<ClientInterface> {
  const libsqlClient = createClient({ url: ":memory:" });
  const queryEngine = new QueryEngine();
  const client = await createLibsqlClient({
    client: libsqlClient,
    queryEngine,
  });

  await client.import({
    source: {
      kind: "serialized",
      data: SEEDED_SCHOLAR_DATA,
      contentType: "text/turtle",
    },
  });

  return client;
}
