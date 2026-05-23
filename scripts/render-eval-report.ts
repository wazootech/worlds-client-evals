import { join } from "@std/path";
import { buildTable, formatPercent } from "../src/reporting/markdown-table.ts";
import { synthesizeStatsFromSuite } from "../src/runner/run-eval-suite.ts";
import type {
  EvalAssertionPassRate,
  EvalCasePassRate,
  EvalCaseResult,
  EvalStatsResult,
  EvalSuiteResult,
} from "../src/types.ts";

const DEFAULT_RESULTS_DIRECTORY = "results";
const DEFAULT_EXCERPT_LENGTH = 220;

/** EvalReportEnvironment stores workflow metadata injected into the rendered report. */
export interface EvalReportEnvironment {
  status?: string;
  trigger?: string;
  filter?: string;
  trials?: string;
  minPassRate?: string;
  workflowUrl?: string;
  artifactName?: string;
  artifactUrl?: string;
}

/** EvalReportInput contains optional result documents used to render a report. */
export interface EvalReportInput {
  statsResult?: EvalStatsResult;
  suiteResult?: EvalSuiteResult;
  environment?: EvalReportEnvironment;
}

/** readJsonIfExists reads a JSON document and returns undefined when it is absent. */
async function readJsonIfExists<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await Deno.readTextFile(filePath)) as T;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return undefined;
    }
    throw error;
  }
}

/** parseOptionalPassRate parses a pass-rate string when it is a valid threshold. */
function parseOptionalPassRate(
  rawValue: string | undefined,
): number | undefined {
  if (!rawValue) {
    return undefined;
  }

  const parsedValue = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 1) {
    return undefined;
  }

  return parsedValue;
}

/** truncateCell keeps verbose model output readable inside the discussion. */
function truncateCell(value: unknown): string {
  const normalizedValue = String(value ?? "").trim();
  if (normalizedValue.length <= DEFAULT_EXCERPT_LENGTH) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, DEFAULT_EXCERPT_LENGTH - 3)}...`;
}

/** caseRiskRank returns a sort bucket where lower values are riskier. */
function caseRiskRank(
  casePassRate: EvalCasePassRate,
  requiredPassRate: number,
): number {
  if (casePassRate.passRate < requiredPassRate) {
    return 0;
  }
  if (casePassRate.passRate < 1) {
    return 1;
  }
  return 2;
}

/** sortCasePassRates orders cases so regressions and near misses are visible first. */
function sortCasePassRates(
  casePassRates: EvalCasePassRate[],
  requiredPassRate: number,
): EvalCasePassRate[] {
  return [...casePassRates].sort((leftCase, rightCase) => {
    const riskDifference = caseRiskRank(leftCase, requiredPassRate) -
      caseRiskRank(rightCase, requiredPassRate);
    if (riskDifference !== 0) {
      return riskDifference;
    }

    const passRateDifference = leftCase.passRate - rightCase.passRate;
    if (passRateDifference !== 0) {
      return passRateDifference;
    }

    return leftCase.id.localeCompare(rightCase.id);
  });
}

/** describeCaseResult labels a case relative to the hard threshold and perfect stability. */
function describeCaseResult(
  casePassRate: EvalCasePassRate,
  requiredPassRate: number,
): string {
  if (casePassRate.passRate < requiredPassRate) {
    return "FAIL";
  }
  if (casePassRate.passRate < 1) {
    return "NEAR MISS";
  }
  return "PASS";
}

/** describeCaseGap explains whether a case is unstable, failing, or stable. */
function describeCaseGap(
  casePassRate: EvalCasePassRate,
  requiredPassRate: number,
): string {
  if (casePassRate.passRate < requiredPassRate) {
    const gapPoints = (requiredPassRate - casePassRate.passRate) * 100;
    return `below threshold by ${gapPoints.toFixed(1)} pts`;
  }
  if (casePassRate.passRate < 1) {
    const failedTrialCount = casePassRate.trialCount - casePassRate.passCount;
    return `near miss: ${failedTrialCount} failed trial(s)`;
  }
  return "stable";
}

/** buildCasePassRateRows renders all cases sorted by regression risk. */
function buildCasePassRateRows(
  statsResult: EvalStatsResult,
  requiredPassRate: number,
): string[][] {
  return sortCasePassRates(statsResult.casePassRates, requiredPassRate).map(
    (casePassRate) => [
      `${casePassRate.id}<br>${casePassRate.description}`,
      describeCaseResult(casePassRate, requiredPassRate),
      `${casePassRate.passCount}/${casePassRate.trialCount}`,
      formatPercent(casePassRate.passRate),
      describeCaseGap(casePassRate, requiredPassRate),
    ],
  );
}

/** collectWeakAssertionRows returns every assertion that missed perfect reliability. */
function collectWeakAssertionRows(statsResult: EvalStatsResult): string[][] {
  const weakAssertionRows: Array<{
    caseId: string;
    assertionPassRate: EvalAssertionPassRate;
  }> = [];

  for (const casePassRate of statsResult.casePassRates) {
    for (const assertionPassRate of casePassRate.assertionPassRates) {
      if (assertionPassRate.passRate < 1) {
        weakAssertionRows.push({ caseId: casePassRate.id, assertionPassRate });
      }
    }
  }

  weakAssertionRows.sort((leftRow, rightRow) => {
    const passRateDifference = leftRow.assertionPassRate.passRate -
      rightRow.assertionPassRate.passRate;
    if (passRateDifference !== 0) {
      return passRateDifference;
    }

    const caseDifference = leftRow.caseId.localeCompare(rightRow.caseId);
    if (caseDifference !== 0) {
      return caseDifference;
    }

    return leftRow.assertionPassRate.name.localeCompare(
      rightRow.assertionPassRate.name,
    );
  });

  return weakAssertionRows.map(({ caseId, assertionPassRate }) => [
    caseId,
    assertionPassRate.name,
    `${assertionPassRate.passCount}/${assertionPassRate.trialCount}`,
    formatPercent(assertionPassRate.passRate),
  ]);
}

/** buildFinalFailureRows renders the latest failed cases with compact diagnostic details. */
function buildFinalFailureRows(
  suiteResult: EvalSuiteResult | undefined,
): string[][] {
  if (!suiteResult) {
    return [];
  }

  return suiteResult.results
    .filter((caseResult: EvalCaseResult) => !caseResult.success)
    .map((caseResult) => {
      const failedAssertions = caseResult.assertions
        .filter((assertion) => !assertion.pass)
        .map((assertion) => assertion.name)
        .join(", ");
      const toolSequence = caseResult.toolSequence.length > 0
        ? caseResult.toolSequence.join(" -> ")
        : "(none)";
      const diagnosticExcerpt = caseResult.error || caseResult.output ||
        "(empty)";

      return [
        caseResult.id,
        failedAssertions || "(none)",
        toolSequence,
        truncateCell(diagnosticExcerpt),
      ];
    });
}

/** countCases summarizes failing, near-miss, and stable case totals. */
function countCases(
  casePassRates: EvalCasePassRate[],
  requiredPassRate: number,
): { failingCount: number; nearMissCount: number; stableCount: number } {
  let failingCount = 0;
  let nearMissCount = 0;
  let stableCount = 0;

  for (const casePassRate of casePassRates) {
    if (casePassRate.passRate < requiredPassRate) {
      failingCount += 1;
    } else if (casePassRate.passRate < 1) {
      nearMissCount += 1;
    } else {
      stableCount += 1;
    }
  }

  return { failingCount, nearMissCount, stableCount };
}

/** resolveStatus converts the workflow exit code into a readable status. */
function resolveStatus(
  statsResult: EvalStatsResult | undefined,
  suiteResult: EvalSuiteResult | undefined,
  environment: EvalReportEnvironment,
): string {
  if (environment.status) {
    return environment.status;
  }
  if (statsResult) {
    return statsResult.success ? "pass" : "fail";
  }
  if (suiteResult) {
    return suiteResult.success ? "pass" : "fail";
  }
  return "unknown";
}

/** renderEvalReport renders eval result JSON as GitHub-flavored Markdown. */
export function renderEvalReport(input: EvalReportInput): string {
  const environment = input.environment ?? {};
  const environmentPassRate = parseOptionalPassRate(environment.minPassRate);
  const statsResult = input.statsResult ??
    (input.suiteResult
      ? synthesizeStatsFromSuite(input.suiteResult, environmentPassRate)
      : undefined);
  const requiredPassRate = statsResult?.minPassRate ?? environmentPassRate ?? 1;
  const status = resolveStatus(statsResult, input.suiteResult, environment);
  const weakAssertionRows = statsResult
    ? collectWeakAssertionRows(statsResult)
    : [];
  const caseCounts = statsResult
    ? countCases(statsResult.casePassRates, requiredPassRate)
    : { failingCount: 0, nearMissCount: 0, stableCount: 0 };
  const reportSections: string[] = [];

  reportSections.push("## Eval report");
  reportSections.push(
    buildTable(["Field", "Value"], [
      ["Status", status],
      [
        "Provider",
        statsResult?.providerId ?? input.suiteResult?.providerId ?? "unknown",
      ],
      [
        "Model",
        statsResult?.modelId ?? input.suiteResult?.modelId ?? "unknown",
      ],
      [
        "Tool config",
        statsResult?.toolConfigId ?? input.suiteResult?.toolConfigId ??
          "unknown",
      ],
      ["Trigger", environment.trigger || "unknown"],
      ["Filter", environment.filter || "full suite"],
      [
        "Trials",
        String(statsResult?.trialCount ?? environment.trials ?? "unknown"),
      ],
      ["Minimum pass rate", formatPercent(requiredPassRate)],
      ["Workflow run", environment.workflowUrl || "unknown"],
      [
        "Artifact",
        environment.artifactUrl && environment.artifactName
          ? `[${environment.artifactName}](${environment.artifactUrl})`
          : environment.artifactName || "unknown",
      ],
    ]),
  );
  reportSections.push(
    `Cases: ${caseCounts.stableCount} stable, ${caseCounts.nearMissCount} near miss, ${caseCounts.failingCount} failing. Weak assertions: ${weakAssertionRows.length}.`,
  );

  if (statsResult) {
    reportSections.push("## Case pass rates");
    reportSections.push(
      buildTable(
        ["Case", "Result", "Passes", "Pass rate", "Gap"],
        buildCasePassRateRows(statsResult, requiredPassRate),
      ),
    );
  } else {
    reportSections.push(
      "No eval result JSON files were available to summarize.",
    );
  }

  if (weakAssertionRows.length > 0) {
    reportSections.push("## Weak assertions");
    reportSections.push(
      buildTable(
        ["Case", "Assertion", "Passes", "Pass rate"],
        weakAssertionRows,
      ),
    );
  }

  const finalFailureRows = buildFinalFailureRows(input.suiteResult);
  if (finalFailureRows.length > 0) {
    reportSections.push("## Final-trial failures");
    reportSections.push(
      buildTable(
        ["Case", "Failed assertions", "Tools", "Error/output"],
        finalFailureRows,
      ),
    );
  }

  reportSections.push(
    "Full trajectories are available in the workflow artifact and are not committed to this repository.",
  );

  return `${reportSections.join("\n\n")}\n`;
}

/** readReportInput loads result files and workflow metadata from the current environment. */
async function readReportInput(): Promise<EvalReportInput> {
  const resultsDirectory = Deno.env.get("RESULTS_DIRECTORY") ??
    DEFAULT_RESULTS_DIRECTORY;
  const exitCode = Deno.env.get("EXIT_CODE");
  const status = exitCode === "1"
    ? "fail"
    : exitCode === "0"
    ? "pass"
    : undefined;

  return {
    statsResult: await readJsonIfExists<EvalStatsResult>(
      join(resultsDirectory, "stats-latest.json"),
    ),
    suiteResult: await readJsonIfExists<EvalSuiteResult>(
      join(resultsDirectory, "latest.json"),
    ),
    environment: {
      status,
      trigger: Deno.env.get("GITHUB_EVENT_NAME") ?? undefined,
      filter: Deno.env.get("FILTER") ?? undefined,
      trials: Deno.env.get("TRIALS") ?? undefined,
      minPassRate: Deno.env.get("MIN_PASS_RATE") ?? undefined,
      workflowUrl: Deno.env.get("WORKFLOW_URL") ?? undefined,
      artifactName: Deno.env.get("ARTIFACT_NAME") ?? undefined,
      artifactUrl: Deno.env.get("ARTIFACT_URL") ?? undefined,
    },
  };
}

if (import.meta.main) {
  console.log(renderEvalReport(await readReportInput()));
}
