import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildTable, formatPercent } from "@/reporting/markdown-table.ts";
import type { EvalModelCompareResult } from "@/types.ts";

const DEFAULT_RESULTS_DIRECTORY = "results";

/** readModelCompareResult loads the newest compare-models artifact when present. */
async function readModelCompareResult(): Promise<
  EvalModelCompareResult | undefined
> {
  const configuredPath = process.env.MODEL_COMPARE_RESULT_PATH;
  if (configuredPath) {
    return JSON.parse(
      await readFile(configuredPath, "utf8"),
    ) as EvalModelCompareResult;
  }

  const resultsDirectory =
    process.env.RESULTS_DIRECTORY ?? DEFAULT_RESULTS_DIRECTORY;
  const { readdir } = await import("node:fs/promises");
  const entryNames = await readdir(resultsDirectory);
  const compareFileName = entryNames.find((entryName) =>
    entryName.startsWith("compare-models-"),
  );
  if (!compareFileName) {
    return undefined;
  }

  return JSON.parse(
    await readFile(join(resultsDirectory, compareFileName), "utf8"),
  ) as EvalModelCompareResult;
}

/** renderModelCompareReport renders model comparison JSON as Markdown. */
export function renderModelCompareReport(
  compareResult: EvalModelCompareResult,
): string {
  const reportSections: string[] = [];
  reportSections.push("## Model comparison report");
  reportSections.push(
    buildTable(
      ["Field", "Value"],
      [
        ["Provider", compareResult.providerId],
        ["Tool config", compareResult.toolConfigId],
        ["Models", compareResult.modelIds.join(", ")],
        ["Trials", String(compareResult.trialCount)],
        [
          "Minimum pass rate",
          compareResult.minPassRate === undefined
            ? "100%"
            : formatPercent(compareResult.minPassRate),
        ],
      ],
    ),
  );
  reportSections.push("## Case pass rates by model");
  reportSections.push(
    buildTable(
      ["Case", ...compareResult.modelIds],
      compareResult.caseComparisons.map((caseComparison) => [
        caseComparison.id,
        ...compareResult.modelIds.map((compareModelId) => {
          const casePassRate =
            caseComparison.passRatesByModelId[compareModelId];
          if (!casePassRate) {
            return "n/a";
          }
          return `${casePassRate.passCount}/${casePassRate.trialCount} (${formatPercent(casePassRate.passRate)})`;
        }),
      ]),
    ),
  );

  return `${reportSections.join("\n\n")}\n`;
}

if (import.meta.main) {
  const compareResult = await readModelCompareResult();
  if (!compareResult) {
    console.log("No model comparison result JSON was found.");
    process.exit(1);
  }
  console.log(renderModelCompareReport(compareResult));
}
