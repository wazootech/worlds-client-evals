import { parseArgs } from "@std/cli/parse-args";
import { evalCases } from "@/cases/index.ts";
import {
  writeCompareResult,
  writeStatsResult,
  writeSuiteResult,
} from "@/results/result-store.ts";
import {
  buildCompareResult,
  runEvalSuiteForToolConfig,
} from "@/runner/run-eval-suite.ts";
import {
  defaultToolConfigId,
  resolveToolConfig,
  resolveToolConfigs,
} from "@/tool-configs/index.ts";
import type {
  EvalCaseDefinition,
  EvalCompareResult,
  EvalStatsResult,
  EvalSuiteResult,
} from "@/types.ts";

const providerId = Deno.env.get("EVAL_PROVIDER_ID") ?? "google";
const modelId = Deno.env.get("EVAL_MODEL_ID") ?? "gemini-3.1-flash-lite";
const supportedProviderIds = new Set(["google"]);

interface EvalCliOptions {
  filter?: RegExp;
  list: boolean;
  permitNoFiles: boolean;
  trialCount: number;
  minPassRate?: number;
  toolConfigId: string;
  compareToolConfigIds?: string[];
}

/** validateProviderId prevents mislabeled provider metadata in eval results. */
function validateProviderId(provider: string): void {
  if (!supportedProviderIds.has(provider)) {
    throw new Error(
      `Unsupported EVAL_PROVIDER_ID: ${provider}. Supported providers: google`,
    );
  }
}

/** escapeRegExp escapes a literal string for safe regex matching. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** parseFilter compiles a Deno-test-like string-or-regexp filter. */
function parseFilter(rawFilter: string): RegExp {
  if (rawFilter.startsWith("/") && rawFilter.lastIndexOf("/") > 0) {
    const trailingSlashIndex = rawFilter.lastIndexOf("/");
    const pattern = rawFilter.slice(1, trailingSlashIndex);
    const flags = rawFilter.slice(trailingSlashIndex + 1);
    return new RegExp(pattern, flags);
  }

  return new RegExp(escapeRegExp(rawFilter), "i");
}

/** parsePositiveIntegerOption validates a CLI numeric flag value. */
function parsePositiveIntegerOption(
  flagName: string,
  rawValue: string | undefined,
): number {
  if (!rawValue) {
    throw new Error(`Missing value for ${flagName}`);
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    throw new Error(`${flagName} must be a positive integer; got: ${rawValue}`);
  }

  return parsedValue;
}

/** parsePassRateOption validates an optional minimum pass-rate threshold. */
function parsePassRateOption(
  flagName: string,
  rawValue: string | undefined,
): number {
  if (!rawValue) {
    throw new Error(`Missing value for ${flagName}`);
  }

  const parsedValue = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 1) {
    throw new Error(`${flagName} must be between 0 and 1; got: ${rawValue}`);
  }

  return parsedValue;
}

/** parseCliOptions reads supported targeting flags from Deno.args. */
export function parseCliOptions(args: string[]): EvalCliOptions {
  const parsedArgs = parseArgs(args, {
    boolean: ["list", "permit-no-files"],
    string: ["filter", "trials", "min-pass-rate", "tool-config", "compare"],
    unknown: (argument) => {
      if (argument === "--") {
        return true;
      }

      throw new Error(
        `Unsupported argument: ${argument}. Supported flags: --filter <pattern>, --list, --permit-no-files, --trials <N>, --min-pass-rate <0-1>, --tool-config <name>, --compare <a,b>`,
      );
    },
  });

  if (parsedArgs._.length > 0) {
    throw new Error(
      `Unsupported argument: ${
        parsedArgs._[0]
      }. Supported flags: --filter <pattern>, --list, --permit-no-files, --trials <N>, --min-pass-rate <0-1>, --tool-config <name>, --compare <a,b>`,
    );
  }

  const filter = parsedArgs.filter ? parseFilter(parsedArgs.filter) : undefined;
  const list = parsedArgs.list;
  const permitNoFiles = parsedArgs["permit-no-files"];
  let trialCount = parsedArgs.trials
    ? parsePositiveIntegerOption("--trials", parsedArgs.trials)
    : Number.parseInt(Deno.env.get("EVAL_TRIALS") ?? "1", 10);
  const minPassRate = parsedArgs["min-pass-rate"]
    ? parsePassRateOption("--min-pass-rate", parsedArgs["min-pass-rate"])
    : undefined;
  const toolConfigId = parsedArgs["tool-config"] ?? defaultToolConfigId;
  const compareToolConfigIds = parsedArgs.compare
    ? parsedArgs.compare.split(",").map((toolConfigId) => toolConfigId.trim())
      .filter((toolConfigId) => toolConfigId.length > 0)
    : undefined;

  if (compareToolConfigIds && compareToolConfigIds.length < 2) {
    throw new Error("--compare must include at least two tool config ids");
  }
  if (
    compareToolConfigIds &&
    new Set(compareToolConfigIds).size !== compareToolConfigIds.length
  ) {
    throw new Error("--compare tool config ids must be unique");
  }

  if (!Number.isFinite(trialCount) || trialCount < 1) {
    trialCount = 1;
  }

  return {
    filter,
    list,
    permitNoFiles,
    trialCount,
    minPassRate,
    toolConfigId,
    compareToolConfigIds,
  };
}

/** selectEvalCases filters eval cases by id and description. */
export function selectEvalCases(
  cases: EvalCaseDefinition[],
  options: EvalCliOptions,
): EvalCaseDefinition[] {
  if (!options.filter) {
    return cases;
  }

  return cases.filter((testCase) =>
    options.filter?.test(testCase.id) ||
    options.filter?.test(testCase.description)
  );
}

/** printAvailableCases lists the available eval case IDs and names. */
function printAvailableCases(cases: EvalCaseDefinition[]): void {
  console.log("Available eval cases:");
  for (const testCase of cases) {
    console.log(`- ${testCase.id}: ${testCase.description}`);
  }
}

/** printStatsSummary renders aggregated pass rates for multi-trial runs. */
function printStatsSummary(statsResult: EvalStatsResult): void {
  if (statsResult.toolConfigId) {
    console.log(`Tool config: ${statsResult.toolConfigId}`);
  }
  console.log(`Trials per case: ${statsResult.trialCount}`);
  if (statsResult.minPassRate !== undefined) {
    console.log(`Minimum pass rate: ${statsResult.minPassRate}`);
  }
  console.log(`Statistical suite success: ${statsResult.success}`);
  console.log("");

  const requiredPassRate = statsResult.minPassRate ?? 1;
  for (const caseRate of statsResult.casePassRates) {
    const casePercent = (caseRate.passRate * 100).toFixed(1);
    console.log(
      `[${
        caseRate.passRate >= requiredPassRate ? "PASS" : "FAIL"
      }] ${caseRate.description} — case pass rate ${caseRate.passCount}/${caseRate.trialCount} (${casePercent}%)`,
    );
    for (const assertionRate of caseRate.assertionPassRates) {
      const assertionPercent = (assertionRate.passRate * 100).toFixed(1);
      console.log(
        `  - ${assertionRate.name}: ${assertionRate.passCount}/${assertionRate.trialCount} (${assertionPercent}%)`,
      );
    }
    console.log("");
  }
}

/** printSummary renders a concise terminal summary for local debugging. */
function printSummary(result: EvalSuiteResult): void {
  console.log(`Provider: ${result.providerId}`);
  console.log(`Model: ${result.modelId}`);
  if (result.toolConfigId) {
    console.log(`Tool config: ${result.toolConfigId}`);
  }
  console.log(`Suite success: ${result.success}`);
  console.log("");

  for (const testResult of result.results) {
    const tools = testResult.metadata.trajectory.map((record) =>
      record.toolName
    ).join(
      ", ",
    );
    console.log(
      `[${testResult.success ? "PASS" : "FAIL"}] ${testResult.description}`,
    );
    console.log(`  Steps: ${testResult.metadata.stepCount}`);
    console.log(`  Tools: ${tools || "(none)"}`);
    if (testResult.error) {
      console.log(`  Error: ${testResult.error}`);
    }
    for (const assertion of testResult.assertions) {
      console.log(`  - ${assertion.pass ? "PASS" : "FAIL"}: ${assertion.name}`);
    }
    console.log("");
  }
}

/** buildSuiteRunOptions compiles CLI options into suite runner configuration. */
function buildSuiteRunOptions(cliOptions: EvalCliOptions) {
  return {
    providerId,
    modelId,
    trialCount: cliOptions.trialCount,
    minPassRate: cliOptions.minPassRate,
    compareMode: cliOptions.compareToolConfigIds !== undefined,
  };
}

/** printCompareSummary renders a compact terminal comparison table. */
function printCompareSummary(compareResult: EvalCompareResult): void {
  console.log(`Tool configs: ${compareResult.toolConfigIds.join(", ")}`);
  console.log(`Trials per case: ${compareResult.trialCount}`);
  console.log("");

  for (const comparison of compareResult.caseComparisons) {
    const rates = compareResult.toolConfigIds.map((toolConfigId) => {
      const casePassRate = comparison.passRatesByToolConfig[toolConfigId];
      const percentage = casePassRate
        ? `${(casePassRate.passRate * 100).toFixed(1)}%`
        : "n/a";
      return `${toolConfigId}=${percentage}`;
    });
    console.log(`${comparison.id}: ${rates.join(", ")}`);
  }
}

if (import.meta.main) {
  validateProviderId(providerId);

  const cliOptions = parseCliOptions(Deno.args);
  const selectedEvalCases = selectEvalCases(evalCases, cliOptions);

  if (cliOptions.list) {
    printAvailableCases(selectedEvalCases);
    Deno.exit();
  }

  if (selectedEvalCases.length === 0) {
    const message = "No eval cases matched the provided filter.";
    if (cliOptions.permitNoFiles) {
      console.log(message);
      Deno.exit();
    }

    throw new Error(message);
  }

  if (cliOptions.compareToolConfigIds) {
    const toolConfigs = resolveToolConfigs(cliOptions.compareToolConfigIds);
    const statsResults: EvalStatsResult[] = [];
    let compareFailed = false;

    for (const toolConfig of toolConfigs) {
      const runResult = await runEvalSuiteForToolConfig(
        selectedEvalCases,
        toolConfig,
        buildSuiteRunOptions(cliOptions),
      );
      if (runResult.fatalError) {
        console.log(
          `\nRun aborted due to fatal API error: ${runResult.fatalError}`,
        );
        Deno.exitCode = 2;
        Deno.exit();
      }

      const latestOutputPath = await writeSuiteResult(
        runResult.suiteResult,
        toolConfig.id,
      );
      console.log(`Wrote ${toolConfig.id} results to ${latestOutputPath}`);

      if (runResult.statsResult) {
        statsResults.push(runResult.statsResult);
        const statsOutputPath = await writeStatsResult(
          runResult.statsResult,
          toolConfig.id,
        );
        console.log(
          `Wrote ${toolConfig.id} statistical results to ${statsOutputPath}`,
        );
        if (!runResult.statsResult.success) {
          compareFailed = true;
        }
      } else if (!runResult.suiteResult.success) {
        compareFailed = true;
      }
    }

    const compareResult = buildCompareResult(
      selectedEvalCases,
      statsResults,
      buildSuiteRunOptions(cliOptions),
    );
    printCompareSummary(compareResult);
    const compareOutputPath = await writeCompareResult(compareResult);
    console.log(`Wrote comparison results to ${compareOutputPath}`);

    if (compareFailed) {
      Deno.exitCode = 1;
    }
    Deno.exit();
  }

  const toolConfig = resolveToolConfig(cliOptions.toolConfigId);
  const runResult = await runEvalSuiteForToolConfig(
    selectedEvalCases,
    toolConfig,
    buildSuiteRunOptions(cliOptions),
  );

  if (runResult.fatalError) {
    console.log(
      `\nRun aborted due to fatal API error: ${runResult.fatalError}`,
    );
    Deno.exitCode = 2;
    Deno.exit();
  }

  if (runResult.statsResult) {
    printStatsSummary(runResult.statsResult);
    const statsOutputPath = await writeStatsResult(runResult.statsResult);
    console.log(`Wrote statistical results to ${statsOutputPath}`);
  } else {
    printSummary(runResult.suiteResult);
  }

  const outputPath = await writeSuiteResult(runResult.suiteResult);
  console.log(`Wrote results to ${outputPath}`);

  if (runResult.statsResult) {
    if (!runResult.statsResult.success) {
      Deno.exitCode = 1;
    }
  } else if (!runResult.suiteResult.success) {
    Deno.exitCode = 1;
  }
}
