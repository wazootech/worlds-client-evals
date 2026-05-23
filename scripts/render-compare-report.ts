import {
  buildTable,
  formatDelta,
  formatPercent,
} from "../src/reporting/markdown-table.ts";
import { findNewestCompareResultPath } from "../src/results/result-store.ts";
import type { EvalAssertionPassRate, EvalCompareResult } from "../src/types.ts";

const DEFAULT_RESULTS_DIRECTORY = "results";

/** collectAssertionRate returns a named assertion's rate for a case when present. */
function collectAssertionRate(
  assertionPassRates: EvalAssertionPassRate[],
  assertionName: string,
): EvalAssertionPassRate | undefined {
  return assertionPassRates.find((assertionPassRate) =>
    assertionPassRate.name === assertionName
  );
}

/** renderCompareReport renders tool config comparison JSON as Markdown. */
export function renderCompareReport(compareResult: EvalCompareResult): string {
  const baselineToolConfigId = compareResult.baselineToolConfigId;
  const candidateToolConfigIds = compareResult.toolConfigIds.filter(
    (toolConfigId) => toolConfigId !== baselineToolConfigId,
  );
  const caseRows = compareResult.caseComparisons.map((comparison) => {
    const baselineRate = comparison.passRatesByToolConfig[baselineToolConfigId];
    const candidateCells = candidateToolConfigIds.flatMap((toolConfigId) => {
      const candidateRate = comparison.passRatesByToolConfig[toolConfigId];
      if (!candidateRate || !baselineRate) {
        return ["n/a", "n/a"];
      }
      return [
        formatPercent(candidateRate.passRate),
        formatDelta(candidateRate.passRate - baselineRate.passRate),
      ];
    });

    return [
      `${comparison.id}<br>${comparison.description}`,
      baselineRate ? formatPercent(baselineRate.passRate) : "n/a",
      ...candidateCells,
    ];
  });

  const weakAssertionRows = compareResult.caseComparisons.flatMap(
    (comparison) => {
      const baselineRate =
        comparison.passRatesByToolConfig[baselineToolConfigId];
      return candidateToolConfigIds.flatMap((toolConfigId) => {
        const candidateRate = comparison.passRatesByToolConfig[toolConfigId];
        if (!candidateRate) {
          return [];
        }

        return candidateRate.assertionPassRates
          .filter((assertionPassRate) => assertionPassRate.passRate < 1)
          .map((assertionPassRate) => {
            const baselineAssertionRate = baselineRate
              ? collectAssertionRate(
                baselineRate.assertionPassRates,
                assertionPassRate.name,
              )
              : undefined;
            return [
              comparison.id,
              toolConfigId,
              assertionPassRate.name,
              formatPercent(assertionPassRate.passRate),
              baselineAssertionRate
                ? formatPercent(baselineAssertionRate.passRate)
                : "n/a",
            ];
          });
      });
    },
  );

  const headers = [
    "Case",
    baselineToolConfigId,
    ...candidateToolConfigIds.flatMap((toolConfigId) => [
      toolConfigId,
      `${toolConfigId} delta`,
    ]),
  ];
  const sections = [
    "## Tool config comparison",
    buildTable(["Field", "Value"], [
      ["Provider", compareResult.providerId],
      ["Model", compareResult.modelId],
      ["Trials", String(compareResult.trialCount)],
      [
        "Minimum pass rate",
        compareResult.minPassRate === undefined
          ? "100.0%"
          : formatPercent(compareResult.minPassRate),
      ],
      ["Tool configs", compareResult.toolConfigIds.join(", ")],
    ]),
    "## Case pass-rate deltas",
    buildTable(headers, caseRows),
  ];

  if (weakAssertionRows.length > 0) {
    sections.push("## Weak assertion deltas");
    sections.push(
      buildTable(
        ["Case", "Tool config", "Assertion", "Pass rate", "Baseline"],
        weakAssertionRows,
      ),
    );
  }

  return `${sections.join("\n\n")}\n`;
}

if (import.meta.main) {
  const resultsDirectory = Deno.env.get("RESULTS_DIRECTORY") ??
    DEFAULT_RESULTS_DIRECTORY;
  const compareResultPath = await findNewestCompareResultPath(resultsDirectory);
  if (!compareResultPath) {
    throw new Error(`No compare-*.json result found in ${resultsDirectory}`);
  }
  const compareResult = JSON.parse(
    await Deno.readTextFile(compareResultPath),
  ) as EvalCompareResult;
  console.log(renderCompareReport(compareResult));
}
