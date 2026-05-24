import { expect, test } from "bun:test";
import { createEvalTools } from "@/tools/create-eval-tools.ts";
import { isReadOnlySparqlQuery } from "@/tools/is-read-only-sparql-query.ts";
import {
  createSeededWorldClient,
  EXPECTED_HOUSE_LITERAL,
  PROTAGONIST_SUBJECT_URI,
  WAZOO_VOCAB_NAMESPACE,
} from "@/fixtures/primary-world.ts";

const READ_ONLY_QUERIES = [
  "SELECT ?s WHERE { ?s ?p ?o }",
  "  SELECT ?s WHERE { ?s ?p ?o }",
  "# plan comment\nSELECT ?s WHERE { ?s ?p ?o }",
  "ASK { ?s ?p ?o }",
  "ask { ?s a ?o }",
];

const MUTATING_OR_INVALID_QUERIES = [
  'INSERT DATA { <http://example.org/s> <http://example.org/p> "o" }',
  "DELETE WHERE { ?s ?p ?o }",
  "DROP ALL",
  "CLEAR GRAPH <http://example.org/g>",
  "LOAD <http://example.org/data>",
  "CREATE GRAPH <http://example.org/g>",
  "WITH <http://example.org/g> INSERT { ?s ?p ?o }",
  "COPY GRAPH <http://example.org/a> TO <http://example.org/b>",
  "MOVE GRAPH <http://example.org/a> TO <http://example.org/b>",
  "ADD GRAPH <http://example.org/a> TO <http://example.org/b>",
  "not a sparql query",
  "",
];

for (const query of READ_ONLY_QUERIES) {
  test(`isReadOnlySparqlQuery accepts read-only query: ${query.slice(0, 40)}`, () => {
    expect(isReadOnlySparqlQuery(query)).toBe(true);
  });
}

for (const query of MUTATING_OR_INVALID_QUERIES) {
  test(`isReadOnlySparqlQuery rejects mutating or invalid query: ${query.slice(0, 40)}`, () => {
    expect(isReadOnlySparqlQuery(query)).toBe(false);
  });
}

test("executeSparql runs SELECT queries against the seeded Worlds client", async () => {
  const client = await createSeededWorldClient();
  const tools = createEvalTools(client);
  const result = await tools.executeSparql.execute?.(
    {
      query: `SELECT ?house WHERE { <${PROTAGONIST_SUBJECT_URI}> <${WAZOO_VOCAB_NAMESPACE}house> ?house . }`,
    },
    {
      toolCallId: "test-sparql",
      messages: [],
    },
  );

  expect(result).toEqual({
    success: true,
    data: {
      head: { vars: ["house"], link: undefined },
      results: {
        bindings: [
          {
            house: { type: "literal", value: EXPECTED_HOUSE_LITERAL },
          },
        ],
      },
    },
  });
});
