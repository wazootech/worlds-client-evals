import { assertStringIncludes } from "@std/assert";
import { renderEvalReport } from "../../scripts/render-eval-report.ts";
import type { EvalStatsResult, EvalSuiteResult } from "../../src/types.ts";

Deno.test("renderEvalReport surfaces regressions and near misses", () => {
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
        assertionPassRates: [{
          name: "tool-sequence",
          passCount: 9,
          trialCount: 10,
          passRate: 0.9,
        }],
      },
      {
        id: "failing-case",
        description: "Failing case",
        passCount: 6,
        trialCount: 10,
        passRate: 0.6,
        assertionPassRates: [{
          name: "final-answer",
          passCount: 6,
          trialCount: 10,
          passRate: 0.6,
        }],
      },
    ],
  };

  const report = renderEvalReport({ statsResult });

  assertStringIncludes(
    report,
    "Cases: 1 stable, 1 near miss, 1 failing. Weak assertions: 2.",
  );
  assertStringIncludes(report, "failing-case<br>Failing case | FAIL | 6/10");
  assertStringIncludes(
    report,
    "near-miss-case<br>Near miss case | NEAR MISS | 9/10",
  );
  assertStringIncludes(report, "below threshold by 10.0 pts");
  assertStringIncludes(report, "near miss: 1 failed trial(s)");
  assertStringIncludes(report, "## Weak assertions");
});

Deno.test("renderEvalReport falls back to latest suite results", () => {
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
        success: false,
        metadata: {
          providerId: "google",
          modelId: "gemini-3.1-flash-lite",
          stepCount: 1,
          latencyMs: 10,
          trajectory: [],
        },
        assertions: [{ name: "final-answer", pass: false }],
        toolSequence: ["searchWorld"],
      },
    ],
  };

  const report = renderEvalReport({
    suiteResult,
    environment: { minPassRate: "1", artifactName: "eval-results" },
  });

  assertStringIncludes(report, "single-trial-failure<br>Single trial failure");
  assertStringIncludes(report, "## Final-trial failures");
  assertStringIncludes(report, "searchWorld");
  assertStringIncludes(report, "model output with \\| pipe");
});
