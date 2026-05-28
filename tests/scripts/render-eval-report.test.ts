import { expect, test } from "bun:test";
import { renderEvalReport } from "../../scripts/render-eval-report.ts";
import type { EvalStatsResult, EvalSuiteResult } from "@/types.ts";

test("renderEvalReport surfaces regressions and near misses", () => {
  const statsResult: EvalStatsResult = {
    providerId: "google",
    modelId: "gemini-3.1-flash-lite",
    timestamp: "2026-05-21T00:00:00.000Z",
    trialCount: 10,
    minPassRate: 0.7,
    success: false,
    casePassRates: [
      {
        id: "stable-case",
        description: "Stable case",
        passCount: 10,
        trialCount: 10,
        passRate: 1,
        assertionPassRates: [],
      },
      {
        id: "near-miss-case",
        description: "Near miss case",
        passCount: 9,
        trialCount: 10,
        passRate: 0.9,
        assertionPassRates: [
          {
            name: "tool-sequence",
            passCount: 9,
            trialCount: 10,
            passRate: 0.9,
          },
        ],
      },
      {
        id: "failing-case",
        description: "Failing case",
        passCount: 6,
        trialCount: 10,
        passRate: 0.6,
        assertionPassRates: [
          {
            name: "final-answer",
            passCount: 6,
            trialCount: 10,
            passRate: 0.6,
          },
        ],
      },
    ],
  };

  const report = renderEvalReport({ statsResult });

  expect(report).toContain(
    "Cases: 1 stable, 1 near miss, 1 failing. Weak assertions: 2.",
  );
  expect(report).toContain("failing-case<br>Failing case | FAIL | 6/10");
  expect(report).toContain(
    "near-miss-case<br>Near miss case | NEAR MISS | 9/10",
  );
  expect(report).toContain("below threshold by 10.0 pts");
  expect(report).toContain("near miss: 1 failed trial(s)");
  expect(report).toContain("## Weak assertions");
});

test("renderEvalReport falls back to latest suite results", () => {
  const suiteResult: EvalSuiteResult = {
    providerId: "google",
    modelId: "gemini-3.1-flash-lite",
    timestamp: "2026-05-21T00:00:00.000Z",
    success: false,
    results: [
      {
        id: "single-trial-failure",
        description: "Single trial failure",
        prompt: "prompt",
        output: "model output with | pipe",
        runCompleted: true,
        success: false,
        metadata: {
          providerId: "google",
          modelId: "gemini-3.1-flash-lite",
          stepCount: 2,
          latencyMs: 10,
          trajectory: [
            {
              stepIndex: 0,
              toolName: "searchWorld",
              args: { query: "example" },
              result: { success: true, results: [] },
            },
            {
              stepIndex: 1,
              toolName: "executeSparql",
              args: { query: "SELECT ?house WHERE { ?s ?p ?house }" },
              result: { success: true, bindings: [] },
            },
          ],
        },
        assertions: [
          {
            name: "final-answer",
            pass: false,
            message: "Expected output to contain literal",
          },
        ],
        toolSequence: ["searchWorld", "executeSparql"],
      },
    ],
  };

  const report = renderEvalReport({
    suiteResult,
    environment: { minPassRate: "1", artifactName: "eval-results" },
  });

  expect(report).toContain("single-trial-failure<br>Single trial failure");
  expect(report).toContain("## Final-trial failures");
  expect(report).toContain("searchWorld -> executeSparql");
  expect(report).toContain("SPARQL excerpt");
  expect(report).toContain("SELECT ?house");
  expect(report).toContain("Expected output to contain literal");
  expect(report).toContain("model output with \\| pipe");
});
