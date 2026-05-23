import { assertEquals, assertFalse, assertThrows } from "@std/assert";
import { applyAssertions } from "@/assertions/apply-assertions.ts";
import {
  extractSearchSubjects,
  extractSparqlBindingLiterals,
} from "@/assertions/trajectory-reducers.ts";
import { evalCases } from "@/cases/index.ts";
import { resolveCaseTestFixture } from "@/cases/test-fixtures.ts";
import type { EvalCaseResult, EvalToolRecord } from "@/types.ts";
import {
  DISTRACTOR_EXPECTED_HOUSE_LITERAL,
  EXPECTED_HOUSE_LITERAL,
  WORK_SUBJECT_URI,
} from "@/fixtures/primary-world.ts";

/** createEvalCaseResult builds a minimal case result for assertion routing tests. */
function createEvalCaseResult(
  overrides: Partial<EvalCaseResult> & Pick<EvalCaseResult, "id">,
): EvalCaseResult {
  return {
    description: overrides.description ?? overrides.id,
    prompt: overrides.prompt ?? "",
    output: overrides.output ?? "",
    runCompleted: overrides.runCompleted ?? true,
    success: overrides.success ?? true,
    metadata: {
      providerId: "google",
      modelId: "gemini-3.1-flash-lite",
      stepCount: overrides.metadata?.stepCount ?? 2,
      latencyMs: overrides.metadata?.latencyMs ?? 0,
      trajectory: overrides.metadata?.trajectory ?? [],
      ...overrides.metadata,
    },
    assertions: [],
    toolSequence: [],
    ...overrides,
  };
}

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
            bindings: [{
              house: { type: "literal", value: EXPECTED_HOUSE_LITERAL },
            }],
          },
        },
      },
    },
  ];
}

/** resolveEvalCase returns the catalog entry for a case id. */
function resolveEvalCase(caseId: string) {
  const evalCase = evalCases.find((entry) => entry.id === caseId);
  if (evalCase === undefined) {
    throw new Error(`Unknown eval case id: ${caseId}`);
  }
  return evalCase;
}

Deno.test("evalCases defines non-empty assertion specs for every catalog entry", () => {
  for (const evalCase of evalCases) {
    assertEquals(evalCase.assertions.length > 0, true);
  }
});

for (const evalCase of evalCases) {
  Deno.test(`applyAssertions runs declarative specs for ${evalCase.id}`, () => {
    const { trajectory, output } = resolveCaseTestFixture(evalCase.id);

    const result = applyAssertions(
      createEvalCaseResult({
        id: evalCase.id,
        output,
        metadata: {
          providerId: "google",
          modelId: "gemini-3.1-flash-lite",
          stepCount: trajectory.length,
          latencyMs: 0,
          trajectory,
        },
      }),
      evalCase.assertions,
    );

    assertEquals(
      result.assertions.map((assertion) => assertion.name),
      evalCase.assertions.map((spec) => spec.name),
    );
    assertEquals(result.success, true);
  });
}

Deno.test("applyAssertions throws when assertion specs are empty", () => {
  assertThrows(
    () =>
      applyAssertions(
        createEvalCaseResult({
          id: "unknown-eval-case",
          metadata: {
            providerId: "google",
            modelId: "gemini-3.1-flash-lite",
            stepCount: 0,
            latencyMs: 0,
            trajectory: [],
          },
        }),
        [],
      ),
    Error,
    "No assertion specs provided",
  );
});

Deno.test("applyAssertions clears success when a routed assertion fails", () => {
  const evalCase = resolveEvalCase("happy-path-search-then-sparql");
  const result = applyAssertions(
    createEvalCaseResult({
      id: "happy-path-search-then-sparql",
      output: "no house literal here",
      metadata: {
        providerId: "google",
        modelId: "gemini-3.1-flash-lite",
        stepCount: 2,
        latencyMs: 0,
        trajectory: createPassingHappyPathTrajectory(),
      },
    }),
    evalCase.assertions,
  );

  assertFalse(result.success);
  assertFalse(
    result.assertions.find((assertion) =>
      assertion.name === "final-answer-correct"
    )?.pass,
  );
});

Deno.test("extractSearchSubjects collects subject IRIs from searchWorld results", () => {
  const subjects = extractSearchSubjects({
    success: true,
    results: [
      { subject: WORK_SUBJECT_URI },
      { subject: "https://example.org/other" },
      { notASubject: true },
    ],
  });

  assertEquals(subjects, [
    WORK_SUBJECT_URI,
    "https://example.org/other",
  ]);
});

Deno.test("extractSearchSubjects returns empty array for malformed input", () => {
  assertEquals(extractSearchSubjects(null), []);
  assertEquals(extractSearchSubjects({}), []);
  assertEquals(extractSearchSubjects({ results: "not-an-array" }), []);
  assertEquals(extractSearchSubjects({ results: [{ subject: 42 }] }), []);
});

Deno.test("extractSparqlBindingLiterals collects literal binding values", () => {
  const literals = extractSparqlBindingLiterals({
    success: true,
    data: {
      results: {
        bindings: [
          {
            house: { type: "literal", value: EXPECTED_HOUSE_LITERAL },
            work: {
              type: "uri",
              value: WORK_SUBJECT_URI,
            },
          },
          {
            label: { value: "untagged-literal" },
          },
        ],
      },
    },
  });

  assertEquals(literals, [EXPECTED_HOUSE_LITERAL, "untagged-literal"]);
});

Deno.test("extractSparqlBindingLiterals returns empty array for failed or missing data", () => {
  assertEquals(extractSparqlBindingLiterals({ success: false }), []);
  assertEquals(extractSparqlBindingLiterals({ success: true, data: null }), []);
  assertEquals(extractSparqlBindingLiterals("not-an-object"), []);
});

Deno.test("applyAssertions search-miss fails when model invents the house literal", () => {
  const evalCase = resolveEvalCase("search-miss-unknown-label");
  const result = applyAssertions(
    createEvalCaseResult({
      id: "search-miss-unknown-label",
      output: `The house is ${EXPECTED_HOUSE_LITERAL}.`,
      metadata: {
        providerId: "google",
        modelId: "gemini-3.1-flash-lite",
        stepCount: 1,
        latencyMs: 0,
        trajectory: [{
          stepIndex: 0,
          toolName: "searchWorld",
          args: { query: "z9Qk4WnP" },
          result: { success: true, results: [] },
        }],
      },
    }),
    evalCase.assertions,
  );

  assertFalse(result.success);
  assertFalse(
    result.assertions.find((assertion) =>
      assertion.name === "does-not-invent-house"
    )?.pass,
  );
  assertFalse(
    result.assertions.find((assertion) =>
      assertion.name === "literals-subset-of-tools"
    )?.pass,
  );
});

Deno.test("applyAssertions not-distractor-house rejects distractor literal in output", () => {
  const evalCase = resolveEvalCase("distractor-work-disambiguation");
  const result = applyAssertions(
    createEvalCaseResult({
      id: "distractor-work-disambiguation",
      output: `House: ${DISTRACTOR_EXPECTED_HOUSE_LITERAL}`,
      metadata: {
        providerId: "google",
        modelId: "gemini-3.1-flash-lite",
        stepCount: 2,
        latencyMs: 0,
        trajectory: createPassingHappyPathTrajectory(),
      },
    }),
    evalCase.assertions,
  );

  assertFalse(
    result.assertions.find((assertion) =>
      assertion.name === "not-distractor-house"
    )?.pass,
  );
  assertFalse(result.success);
});
