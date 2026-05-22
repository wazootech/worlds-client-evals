import { createClient } from "@libsql/client";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import type { Client } from "@worlds/client";
import { ComunicaSparqlEngine } from "@worlds/client/adapters/comunica";
import { createLibsqlClient } from "@worlds/client/adapters/libsql";

/** GENID_BASE is the production-style skolem prefix for eval fixture entities. */
export const GENID_BASE = "https://worlds.wazoo.dev/.well-known/genid/";

/** WAZOO_VOCAB_NAMESPACE is the shared vocabulary namespace for eval predicates. */
export const WAZOO_VOCAB_NAMESPACE = "https://worlds.wazoo.dev/vocab/";

export const CREATURE_SUBJECT_URI = `${GENID_BASE}c0a1b2c3d4e5f607`;
export const DRAGON_SUBJECT_URI = `${GENID_BASE}d1b2c3d4e5f6072`;
export const WYVERN_SUBJECT_URI = `${GENID_BASE}e2c3d4e5f6073a1`;
export const NEST_SUBJECT_URI = `${GENID_BASE}f3d4e5f6074a1b2`;
export const TREASURE_SUBJECT_URI = `${GENID_BASE}a4e5f6075a1b2c3`;

export const CREATURE_LABEL = "mythical-beings";
export const DRAGON_LABEL = "emberclaw";
export const WYVERN_LABEL = "frostfang";
export const NEST_LABEL = "dragon-roost";
export const NEST_LOCATION_LITERAL = "volcanic-cavern";
export const TREASURE_LABEL = "golden-hoard";

export const UNKNOWN_HIERARCHY_LABEL = "x7Qp2ZrK";

const SEEDED_HIERARCHY_DATA = `
  @prefix vocab: <${WAZOO_VOCAB_NAMESPACE}> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

  <${CREATURE_SUBJECT_URI}> rdfs:label "${CREATURE_LABEL}" .
  <${DRAGON_SUBJECT_URI}>   rdfs:subClassOf <${CREATURE_SUBJECT_URI}> ;
                            rdfs:label "${DRAGON_LABEL}" ;
                            vocab:dwellsAt <${NEST_SUBJECT_URI}> .
  <${WYVERN_SUBJECT_URI}>   rdfs:subClassOf <${CREATURE_SUBJECT_URI}> ;
                            rdfs:label "${WYVERN_LABEL}" .
  <${NEST_SUBJECT_URI}>     rdfs:label "${NEST_LABEL}" ;
                            vocab:locatedIn "${NEST_LOCATION_LITERAL}" .
  <${TREASURE_SUBJECT_URI}> rdfs:label "${TREASURE_LABEL}" ;
                            vocab:guardedBy <${DRAGON_SUBJECT_URI}> .
`;

/** createSeededHierarchyWorldClient builds a fresh in-memory world with the hierarchy graph. */
export async function createSeededHierarchyWorldClient(): Promise<Client> {
  const libsqlClient = createClient({ url: ":memory:" });
  const queryEngine = new QueryEngine();
  const client = await createLibsqlClient({
    client: libsqlClient,
    createSparqlEngine: ({ store }) =>
      new ComunicaSparqlEngine({ queryEngine, store }),
  });

  await client.import({
    source: {
      kind: "serialized",
      data: SEEDED_HIERARCHY_DATA,
      contentType: "text/turtle",
    },
  });

  return client;
}
