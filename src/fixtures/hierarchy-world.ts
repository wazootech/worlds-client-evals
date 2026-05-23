import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { Client } from "@worlds/client";
import { ComunicaSparqlEngine } from "@worlds/client/adapters/comunica";
import { createLibsqlClientOptions } from "@worlds/client/adapters/libsql";

import { GENID_BASE, WAZOO_VOCAB_NAMESPACE } from "./constants.ts";

export { GENID_BASE };
export { WAZOO_VOCAB_NAMESPACE as HIERARCHY_VOCAB_NAMESPACE };

export const HIERARCHY_CREATURE_SUBJECT_URI = `${GENID_BASE}c0a1b2c3d4e5f607`;
export const HIERARCHY_DRAGON_SUBJECT_URI = `${GENID_BASE}d1b2c3d4e5f6072`;
export const HIERARCHY_WYVERN_SUBJECT_URI = `${GENID_BASE}e2c3d4e5f6073a1`;
export const HIERARCHY_NEST_SUBJECT_URI = `${GENID_BASE}f3d4e5f6074a1b2`;
export const HIERARCHY_TREASURE_SUBJECT_URI = `${GENID_BASE}a4e5f6075a1b2c3`;

export const HIERARCHY_CREATURE_LABEL = "mythical-beings";
/** HIERARCHY_CREATURE_DISCOVERY_QUERY is tokenized to match searchWorld behavior for HIERARCHY_CREATURE_LABEL. */
export const HIERARCHY_CREATURE_DISCOVERY_QUERY = "mythical being";
export const HIERARCHY_DRAGON_LABEL = "emberclaw";
export const HIERARCHY_WYVERN_LABEL = "frostfang";
export const HIERARCHY_NEST_LABEL = "dragon-roost";
export const HIERARCHY_NEST_LOCATION_LITERAL = "volcanic-cavern";
export const HIERARCHY_TREASURE_LABEL = "golden-hoard";
/** HIERARCHY_TREASURE_DISCOVERY_QUERY is tokenized to match searchWorld behavior for HIERARCHY_TREASURE_LABEL. */
export const HIERARCHY_TREASURE_DISCOVERY_QUERY = "golden hoard";

export const UNKNOWN_HIERARCHY_LABEL = "x7Qp2ZrK";

const SEEDED_HIERARCHY_DATA = `
  @prefix vocab: <${WAZOO_VOCAB_NAMESPACE}> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

  <${HIERARCHY_CREATURE_SUBJECT_URI}> rdfs:label "${HIERARCHY_CREATURE_LABEL}" .
  <${HIERARCHY_DRAGON_SUBJECT_URI}>   rdfs:subClassOf <${HIERARCHY_CREATURE_SUBJECT_URI}> ;
                                      rdfs:label "${HIERARCHY_DRAGON_LABEL}" ;
                                      vocab:dwellsAt <${HIERARCHY_NEST_SUBJECT_URI}> .
  <${HIERARCHY_WYVERN_SUBJECT_URI}>   rdfs:subClassOf <${HIERARCHY_CREATURE_SUBJECT_URI}> ;
                                      rdfs:label "${HIERARCHY_WYVERN_LABEL}" .
  <${HIERARCHY_NEST_SUBJECT_URI}>     rdfs:label "${HIERARCHY_NEST_LABEL}" ;
                                      vocab:locatedIn "${HIERARCHY_NEST_LOCATION_LITERAL}" .
  <${HIERARCHY_TREASURE_SUBJECT_URI}> rdfs:label "${HIERARCHY_TREASURE_LABEL}" ;
                                      vocab:guardedBy <${HIERARCHY_DRAGON_SUBJECT_URI}> .
`;

/** createSeededHierarchyWorldClient builds a fresh in-memory world with the hierarchy graph. */
export async function createSeededHierarchyWorldClient(): Promise<Client> {
  const libsqlClient = createClient({ url: ":memory:" });
  const queryEngine = new QueryEngine();
  const client = new Client(
    await createLibsqlClientOptions({
      client: libsqlClient,
      createSparqlEngine: ({ libsqlStore }) =>
        new ComunicaSparqlEngine({ queryEngine, store: libsqlStore }),
    }),
  );

  await client.import({
    source: {
      kind: "serialized",
      data: SEEDED_HIERARCHY_DATA,
      contentType: "text/turtle",
    },
  });

  return client;
}
