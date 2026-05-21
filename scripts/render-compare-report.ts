import { join } from "@std/path";
import type { EvalAssertionPassRate, EvalCompareResult } from "../src/types.ts";

const DEFAULT_RESULTS_DIRECTORY = "results";

/** formatPercent renders a pass rate as a one-decimal percentage. */
function formatPercent(passRate: number): string {
  return `${(passRate * 100).toFixed(1)}%`;
}

/** formatDelta renders a pass-rate delta in percentage points. */
function formatDelta(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${(delta * 100).toFixed(1)} pts`;
}

/** escapeTableCell protects Markdown tables from pipes and line breaks. */
function escapeTableCell(value: unknown): string {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\r\n", "<br>")
    .replaceAll("\n", "<br>")
    .trim();
}

/** buildTable renders a GitHub-flavored Markdown table. */
function buildTable(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.map(escapeTableCell).join(" | ")} |`;
  const separatorRow = `| ${headers.map(() => ":---").join(" | ")} |`;
  const bodyRows = rows.map((row) =>
    `| ${row.map((cell) => escapeTableCell(cell)).join(" | ")} |`
  );
  return [headerRow, separatorRow, ...bodyRows].join("\n");
}

/** findCompareResultPath locates the newest comparison JSON artifact. */
async function findCompareResultPath(
  resultsDirectory: string,
): Promise<string> {
  const configuredPath = Deno.env.get("COMPARE_RESULT_PATH");
  if (configuredPath) {
    return configuredPath;
  }

  let newestPath: string | undefined;
  let newestModifiedAt = 0;
  for await (const entry of Deno.readDir(resultsDirectory)) {
    if (
      !entry.isFile || !entry.name.startsWith("compare-") ||
      !entry.name.endsWith(".json")
    ) {
      continue;
    }
    const filePath = join(resultsDirectory, entry.name);
    const fileInfo = await Deno.stat(filePath);
    const modifiedAt = fileInfo.mtime?.getTime() ?? 0;
    if (modifiedAt >= newestModifiedAt) {
      newestModifiedAt = modifiedAt;
      newestPath = filePath;
    }
  }

  if (!newestPath) {
    throw new Error(`No compare-*.json result found in ${resultsDirectory}`);
  }
  return newestPath;
}

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
  const [baselineToolConfigId, ...candidateToolConfigIds] =
    compareResult.toolConfigIds;
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
  const compareResultPath = await findCompareResultPath(resultsDirectory);
  const compareResult = JSON.parse(
    await Deno.readTextFile(compareResultPath),
  ) as EvalCompareResult;
  console.log(renderCompareReport(compareResult));
}
