import { assertEquals, assertFalse } from "@std/assert";
import { runAssertionSpecs } from "../../src/assertions/assertion-registry.ts";
import { resolveToolConfig } from "../../src/tool-configs/index.ts";
import type { EvalCaseResult, EvalToolRecord } from "../../src/types.ts";
import {
  EXPECTED_HOUSE_LITERAL,
  WORK_SUBJECT_URI,
} from "../../src/fixtures/primary-world.ts";

const toolConfig = resolveToolConfig("baseline");

/** createEvalCaseResult builds a minimal case result for registry tests. */
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

/** createHappyPathTrajectory returns a search-then-SPARQL trajectory with house binding. */
function createHappyPathTrajectory(): EvalToolRecord[] {
  return [
    {
      stepIndex: 0,
      toolName: "searchWorld",
      args: { query: "q7Xm9pRw" },
      result: {
        success: true,
        results: [{
          subject: WORK_SUBJECT_URI,
          text: "q7Xm9pRw",
        }],
      },
    },
    {
      stepIndex: 1,
      toolName: "executeSparql",
      args: {
        query: `SELECT ?house WHERE { <${WORK_SUBJECT_URI}> ?p ?house }`,
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

Deno.test("runAssertionSpecs literals-subset-of-tools passes when output only cites tool literals", () => {
  const result = createEvalCaseResult({
    id: "search-miss-unknown-label",
    output: "No matching work was found.",
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
  });

  const assertions = runAssertionSpecs(result, [{
    name: "literals-subset-of-tools",
    kind: "literals-subset-of-tools",
  }], toolConfig);

  assertEquals(assertions[0].pass, true);
});

Deno.test("runAssertionSpecs literals-subset-of-tools fails when output cites uninvented fixture literal", () => {
  const result = createEvalCaseResult({
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
  });

  const assertions = runAssertionSpecs(result, [{
    name: "literals-subset-of-tools",
    kind: "literals-subset-of-tools",
  }], toolConfig);

  assertFalse(assertions[0].pass);
  assertEquals(
    assertions[0].message?.includes(EXPECTED_HOUSE_LITERAL),
    true,
  );
  assertEquals(assertions[0].message?.includes("toolSequence="), true);
});

Deno.test("runAssertionSpecs final-answer-contains passes when output includes bound literal", () => {
  const result = createEvalCaseResult({
    id: "happy-path-search-then-sparql",
    output: `The house is ${EXPECTED_HOUSE_LITERAL}.`,
    metadata: {
      providerId: "google",
      modelId: "gemini-3.1-flash-lite",
      stepCount: 2,
      latencyMs: 0,
      trajectory: createHappyPathTrajectory(),
    },
  });

  const assertions = runAssertionSpecs(result, [{
    name: "final-answer-correct",
    kind: "final-answer-contains",
    literal: EXPECTED_HOUSE_LITERAL,
  }], toolConfig);

  assertEquals(assertions[0].pass, true);
});

Deno.test("runAssertionSpecs output-excludes rejects forbidden literal in output", () => {
  const result = createEvalCaseResult({
    id: "search-miss-unknown-label",
    output: `House: ${EXPECTED_HOUSE_LITERAL}`,
  });

  const [assertion] = runAssertionSpecs(
    result,
    [{
      name: "does-not-invent-house",
      kind: "output-excludes",
      literal: EXPECTED_HOUSE_LITERAL,
    }],
    toolConfig,
  );

  assertFalse(assertion.pass);
});

Deno.test("runAssertionSpecs sparql-handoff-valid fails without subject in SPARQL args", () => {
  const result = createEvalCaseResult({
    id: "happy-path-search-then-sparql",
    output: "",
    metadata: {
      providerId: "google",
      modelId: "gemini-3.1-flash-lite",
      stepCount: 2,
      latencyMs: 0,
      trajectory: [
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
          args: { query: "SELECT ?house WHERE { ?s ?p ?o }" },
          result: { success: true, data: { results: { bindings: [] } } },
        },
      ],
    },
  });

  const assertions = runAssertionSpecs(result, [{
    name: "sparql-handoff-valid",
    kind: "sparql-handoff-valid",
  }], toolConfig);

  assertFalse(assertions[0].pass);
  assertEquals(assertions[0].message?.includes("toolSequence="), true);
});
