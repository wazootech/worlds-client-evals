import { assertStringIncludes } from "@std/assert";
import { renderCompareReport } from "../../scripts/render-compare-report.ts";
import type { EvalCompareResult } from "../../src/types.ts";

Deno.test("renderCompareReport surfaces case and assertion deltas", () => {
  const compareResult: EvalCompareResult = {
    providerId: "google",
    modelId: "gemini-3.1-flash-lite",
    timestamp: "2026-05-21T00:00:00.000Z",
    trialCount: 10,
    minPassRate: 0.7,
    baselineToolConfigId: "baseline",
    toolConfigIds: ["baseline", "experimental"],
    statsResults: [],
    caseComparisons: [{
      id: "happy-path-search-then-sparql",
      description: "Happy path uses search then SPARQL traversal",
      passRatesByToolConfig: {
        baseline: {
          id: "happy-path-search-then-sparql",
          description: "Happy path uses search then SPARQL traversal",
          passCount: 10,
          trialCount: 10,
          passRate: 1,
          assertionPassRates: [{
            name: "final-answer-correct",
            passCount: 10,
            trialCount: 10,
            passRate: 1,
          }],
        },
        experimental: {
          id: "happy-path-search-then-sparql",
          description: "Happy path uses search then SPARQL traversal",
          passCount: 9,
          trialCount: 10,
          passRate: 0.9,
          assertionPassRates: [{
            name: "final-answer-correct",
            passCount: 9,
            trialCount: 10,
            passRate: 0.9,
          }],
        },
      },
    }],
  };

  const report = renderCompareReport(compareResult);

  assertStringIncludes(report, "## Tool config comparison");
  assertStringIncludes(report, "happy-path-search-then-sparql");
  assertStringIncludes(report, "90.0% | -10.0 pts");
  assertStringIncludes(report, "## Weak assertion deltas");
  assertStringIncludes(report, "final-answer-correct");
});
