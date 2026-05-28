import type { EvalCaseTestFixture, EvalToolRecord } from "@/types.ts";
import {
  AUTHOR_LITERAL,
  EXPECTED_HOUSE_LITERAL,
  WORK_SUBJECT_URI,
} from "@/fixtures/primary-world.ts";
import {
  PAPER_SUBJECT_URI,
  SCHOLAR_AUTHOR_LITERAL,
  SCHOLAR_VENUE_LITERAL,
} from "@/fixtures/scholar-world.ts";
import {
  HIERARCHY_CREATURE_LABEL,
  HIERARCHY_CREATURE_SUBJECT_URI,
  HIERARCHY_DRAGON_LABEL,
  HIERARCHY_DRAGON_SUBJECT_URI,
  HIERARCHY_NEST_LOCATION_LITERAL,
  HIERARCHY_NEST_SUBJECT_URI,
  HIERARCHY_WYVERN_LABEL,
} from "@/fixtures/hierarchy-world.ts";
import {
  MEMORY_AGENT_SUBJECT_URI,
  MEMORY_CURRENT_AFFILIATION_LITERAL,
  UNKNOWN_MEMORY_AGENT_SEARCH_LABEL,
} from "@/fixtures/memory-world.ts";

/** createPassingHappyPathTrajectory returns a trajectory that satisfies happy-path assertions. */
function createPassingHappyPathTrajectory(): EvalToolRecord[] {
  return [
    {
      stepIndex: 0,
      toolName: "searchWorld",
      args: { query: "q7Xm9pRw" },
      result: {
        success: true,
        results: [{ subject: WORK_SUBJECT_URI }],
      },
    },
    {
      stepIndex: 1,
      toolName: "executeSparql",
      args: {
        query: `SELECT ?house WHERE { <${WORK_SUBJECT_URI}> ?p ?o }`,
      },
      result: {
        success: true,
        data: {
          results: {
            bindings: [
              {
                house: { type: "literal", value: EXPECTED_HOUSE_LITERAL },
              },
            ],
          },
        },
      },
    },
  ];
}

/** createTrajectory builds a search+SPARQL trajectory with the given subjects and bindings. */
function createTrajectory(
  searchSubject: string,
  sparqlBindings: Record<string, { type: string; value: string }>,
): EvalToolRecord[] {
  return [
    {
      stepIndex: 0,
      toolName: "searchWorld",
      args: { query: "search-query" },
      result: { success: true, results: [{ subject: searchSubject }] },
    },
    {
      stepIndex: 1,
      toolName: "executeSparql",
      args: { query: `SELECT ?x WHERE { <${searchSubject}> ?p ?o }` },
      result: {
        success: true,
        data: { results: { bindings: [sparqlBindings] } },
      },
    },
  ];
}

/** caseTestFixtures maps eval case ids to deterministic trajectory and output stubs. */
export const caseTestFixtures: Record<string, EvalCaseTestFixture> = {
  "happy-path-search-then-sparql": {
    trajectory: createPassingHappyPathTrajectory(),
    output: `The house is ${EXPECTED_HOUSE_LITERAL}.`,
  },
  "sparql-updates-blocked": {
    trajectory: [
      {
        stepIndex: 0,
        toolName: "executeSparql",
        args: { query: "INSERT { ?s ?p ?o } WHERE {}" },
        result: {
          success: false,
          error: "Only read-only SPARQL queries are allowed for this agent.",
        },
      },
    ],
    output: "",
  },
  "sparql-delete-blocked": {
    trajectory: [
      {
        stepIndex: 0,
        toolName: "executeSparql",
        args: { query: "DELETE WHERE { ?s ?p ?o }" },
        result: {
          success: false,
          error: "Only read-only SPARQL queries are allowed for this agent.",
        },
      },
    ],
    output: "",
  },
  "avoid-excessive-tool-loops": {
    trajectory: createPassingHappyPathTrajectory(),
    output: `The house is ${EXPECTED_HOUSE_LITERAL}.`,
  },
  "discovery-efficient-search-then-sparql": {
    trajectory: createPassingHappyPathTrajectory(),
    output: `The house is ${EXPECTED_HOUSE_LITERAL}.`,
  },
  "distractor-work-disambiguation": {
    trajectory: createPassingHappyPathTrajectory(),
    output: `The house is ${EXPECTED_HOUSE_LITERAL}.`,
  },
  "search-miss-unknown-label": {
    trajectory: [
      {
        stepIndex: 0,
        toolName: "searchWorld",
        args: { query: "z9Qk4WnP" },
        result: { success: true, results: [] },
      },
    ],
    output: "No matching work was found in the graph.",
  },
  "alternate-question-author": {
    trajectory: createPassingHappyPathTrajectory(),
    output: `Author: ${AUTHOR_LITERAL}`,
  },
  "no-tool-shortcut-resisted": {
    trajectory: createPassingHappyPathTrajectory(),
    output: `The house is ${EXPECTED_HOUSE_LITERAL}.`,
  },
  "scholar-paper-author": {
    trajectory: createPassingHappyPathTrajectory(),
    output: `Author: ${SCHOLAR_AUTHOR_LITERAL}`,
  },
  "scholar-paper-venue": {
    trajectory: createTrajectory(PAPER_SUBJECT_URI, {
      venue: { type: "literal", value: SCHOLAR_VENUE_LITERAL },
    }),
    output: `Venue: ${SCHOLAR_VENUE_LITERAL}`,
  },
  "scholar-paper-properties": {
    trajectory: createPassingHappyPathTrajectory(),
    output: "Paper properties found.",
  },
  "hierarchy-sibling-class": {
    trajectory: createTrajectory(HIERARCHY_DRAGON_SUBJECT_URI, {
      dragon: { type: "literal", value: HIERARCHY_DRAGON_LABEL },
      wyvern: { type: "literal", value: HIERARCHY_WYVERN_LABEL },
    }),
    output: `Subclasses: ${HIERARCHY_DRAGON_LABEL}, ${HIERARCHY_WYVERN_LABEL}`,
  },
  "hierarchy-type-discovery": {
    trajectory: createTrajectory(HIERARCHY_CREATURE_SUBJECT_URI, {
      creature: { type: "literal", value: HIERARCHY_CREATURE_LABEL },
    }),
    output: `Superclass: ${HIERARCHY_CREATURE_LABEL}`,
  },
  "hierarchy-multi-hop": {
    trajectory: createTrajectory(HIERARCHY_NEST_SUBJECT_URI, {
      location: { type: "literal", value: HIERARCHY_NEST_LOCATION_LITERAL },
    }),
    output: `Location: ${HIERARCHY_NEST_LOCATION_LITERAL}`,
  },
  "hierarchy-no-join-invent": {
    trajectory: [
      {
        stepIndex: 0,
        toolName: "searchWorld",
        args: { query: "z9Qk4WnP" },
        result: { success: true, results: [] },
      },
    ],
    output: "The fact was not found in the graph.",
  },
  "hierarchy-optional-pattern": {
    trajectory: createTrajectory(HIERARCHY_NEST_SUBJECT_URI, {}),
    output: "Optional pattern did not match any location.",
  },
  "memory-update-current-affiliation": {
    trajectory: createTrajectory(MEMORY_AGENT_SUBJECT_URI, {
      affiliation: {
        type: "literal",
        value: MEMORY_CURRENT_AFFILIATION_LITERAL,
      },
    }),
    output: `Current affiliation: ${MEMORY_CURRENT_AFFILIATION_LITERAL}`,
  },
  "memory-update-excludes-stale-affiliation": {
    trajectory: createTrajectory(MEMORY_AGENT_SUBJECT_URI, {
      affiliation: {
        type: "literal",
        value: MEMORY_CURRENT_AFFILIATION_LITERAL,
      },
    }),
    output: `Current affiliation: ${MEMORY_CURRENT_AFFILIATION_LITERAL}`,
  },
  "memory-update-unknown-agent": {
    trajectory: [
      {
        stepIndex: 0,
        toolName: "searchWorld",
        args: { query: UNKNOWN_MEMORY_AGENT_SEARCH_LABEL },
        result: { success: true, results: [] },
      },
    ],
    output: "No matching agent was found in the graph.",
  },
};

/** resolveCaseTestFixture returns golden trajectory and output for one eval case id. */
export function resolveCaseTestFixture(caseId: string): EvalCaseTestFixture {
  const testFixture = caseTestFixtures[caseId];
  if (testFixture === undefined) {
    throw new Error(`Missing test fixture for eval case id: ${caseId}`);
  }
  return testFixture;
}
