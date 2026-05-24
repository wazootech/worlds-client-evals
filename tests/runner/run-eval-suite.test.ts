import { expect, test } from "bun:test";
import { evalCases } from "@/cases/index.ts";
import {
  aggregateEvalStats,
  buildCompareResult,
  synthesizeStatsFromSuite,
} from "@/runner/run-eval-suite.ts";
import type { EvalCaseResult, EvalSuiteResult } from "@/types.ts";

/** createEvalCaseResult builds a minimal case result for suite aggregation tests. */
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
      stepCount: overrides.metadata?.stepCount ?? 1,
      latencyMs: overrides.metadata?.latencyMs ?? 0,
      trajectory: overrides.metadata?.trajectory ?? [],
      ...overrides.metadata,
    },
    assertions: overrides.assertions ?? [
      {
        name: "final-answer-correct",
        pass: overrides.success ?? true,
      },
    ],
    toolSequence: overrides.toolSequence ?? [],
    ...overrides,
  };
}

test("aggregateEvalStats computes case and assertion pass rates across trials", () => {
  const selectedCases = evalCases.slice(0, 1);
  const trialResults = [
    [
      createEvalCaseResult({
        id: selectedCases[0].id,
        success: true,
        assertions: [
          { name: "final-answer-correct", pass: true },
          { name: "step-count-bounded", pass: false },
        ],
      }),
    ],
    [
      createEvalCaseResult({
        id: selectedCases[0].id,
        success: false,
        assertions: [
          { name: "final-answer-correct", pass: false },
          { name: "step-count-bounded", pass: true },
        ],
      }),
    ],
  ];

  const statsResult = aggregateEvalStats(
    selectedCases,
    trialResults,
    "google",
    "gemini-3.1-flash-lite",
    "baseline",
    0.5,
  );

  expect(statsResult.trialCount).toBe(2);
  expect(statsResult.success).toBe(true);
  expect(statsResult.casePassRates[0].passCount).toBe(1);
  expect(statsResult.casePassRates[0].passRate).toBe(0.5);
});

test("synthesizeStatsFromSuite mirrors a single successful suite result", () => {
  const suiteResult: EvalSuiteResult = {
    providerId: "google",
    modelId: "gemini-3.1-flash-lite",
    toolConfigId: "baseline",
    timestamp: "2026-05-21T00:00:00.000Z",
    success: true,
    results: [
      createEvalCaseResult({
        id: "happy-path-search-then-sparql",
        success: true,
        assertions: [{ name: "final-answer-correct", pass: true }],
      }),
    ],
  };

  const statsResult = synthesizeStatsFromSuite(suiteResult, 1);
  expect(statsResult.trialCount).toBe(1);
  expect(statsResult.casePassRates[0].passRate).toBe(1);
});

test("buildCompareResult records the first tool config as baseline", () => {
  const selectedCases = evalCases.slice(0, 1);
  const statsResults = [
    aggregateEvalStats(
      selectedCases,
      [
        [
          createEvalCaseResult({
            id: selectedCases[0].id,
            success: true,
            assertions: [{ name: "final-answer-correct", pass: true }],
          }),
        ],
      ],
      "google",
      "gemini-3.1-flash-lite",
      "baseline",
    ),
    aggregateEvalStats(
      selectedCases,
      [
        [
          createEvalCaseResult({
            id: selectedCases[0].id,
            success: false,
            assertions: [{ name: "final-answer-correct", pass: false }],
          }),
        ],
      ],
      "google",
      "gemini-3.1-flash-lite",
      "strict-eval",
    ),
  ];

  const compareResult = buildCompareResult(selectedCases, statsResults, {
    providerId: "google",
    modelId: "gemini-3.1-flash-lite",
    trialCount: 1,
  });

  expect(compareResult.baselineToolConfigId).toBe("baseline");
  expect(compareResult.toolConfigIds).toEqual(["baseline", "strict-eval"]);
});
