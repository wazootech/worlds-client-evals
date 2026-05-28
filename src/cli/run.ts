import { parseArgs as nodeParseArgs } from "node:util";
import { evalCases } from "@/cases/index.ts";
import { buildCriticalPathFilterRegex } from "@/cases/critical-path.ts";
import {
  writeCompareResult,
  writeModelCompareResult,
  writeStatsResult,
  writeSuiteResult,
} from "@/results/result-store.ts";
import { runReplayFile } from "@/replay/run-replay.ts";
import {
  buildCompareResult,
  buildModelCompareResult,
  runEvalSuiteForModels,
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
  EvalModelCompareResult,
  EvalStatsResult,
  EvalSuiteResult,
} from "@/types.ts";

const providerId = process.env.EVAL_PROVIDER_ID ?? "google";
const modelId = process.env.EVAL_MODEL_ID ?? "gemini-3.1-flash-lite";
const supportedProviderIds = new Set(["google"]);

interface EvalCliOptions {
  filter?: RegExp;
  list: boolean;
  permitNoFiles: boolean;
  trialCount: number;
  minPassRate?: number;
  toolConfigId: string;
  compareToolConfigIds?: string[];
  compareModelIds?: string[];
  modelConcurrency: number;
  replayPath?: string;
  criticalPath: boolean;
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

const supportedCliFlags =
  "--filter <pattern>, --list, --permit-no-files, --trials <N>, --min-pass-rate <0-1>, --tool-config <name>, --compare <a,b>, --compare-models <a,b>, --replay <path>, --critical-path";

/** parseCliOptions reads supported targeting flags from process.argv. */
export function parseCliOptions(args: string[]): EvalCliOptions {
  let parsedArgs: Record<string, string | boolean | undefined>;
  try {
    const parseResult = nodeParseArgs({
      args,
      options: {
        filter: { type: "string" },
        list: { type: "boolean", default: false },
        "permit-no-files": { type: "boolean", default: false },
        trials: { type: "string" },
        "min-pass-rate": { type: "string" },
        "tool-config": { type: "string" },
        compare: { type: "string" },
        "compare-models": { type: "string" },
        replay: { type: "string" },
        "critical-path": { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    });
    parsedArgs = parseResult.values;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unknownOptionMatch = message.match(/'(--[^']+)'/);
    const unsupportedArgument =
      unknownOptionMatch?.[1] ?? message.match(/'([^']+)'/)?.[1] ?? message;
    throw new Error(
      `Unsupported argument: ${unsupportedArgument}. Supported flags: ${supportedCliFlags}`,
    );
  }

  const filter = parsedArgs.filter
    ? parseFilter(String(parsedArgs.filter))
    : undefined;
  const list = parsedArgs.list === true;
  const permitNoFiles = parsedArgs["permit-no-files"] === true;
  let trialCount = parsedArgs.trials
    ? parsePositiveIntegerOption("--trials", String(parsedArgs.trials))
    : Number.parseInt(process.env.EVAL_TRIALS ?? "1", 10);
  const minPassRate = parsedArgs["min-pass-rate"]
    ? parsePassRateOption(
        "--min-pass-rate",
        String(parsedArgs["min-pass-rate"]),
      )
    : undefined;
  const toolConfigId = parsedArgs["tool-config"]
    ? String(parsedArgs["tool-config"])
    : defaultToolConfigId;
  const compareToolConfigIds = parsedArgs.compare
    ? String(parsedArgs.compare)
        .split(",")
        .map((toolConfigId) => toolConfigId.trim())
        .filter((toolConfigId) => toolConfigId.length > 0)
    : undefined;
  const compareModelIds = parsedArgs["compare-models"]
    ? String(parsedArgs["compare-models"])
        .split(",")
        .map((compareModelId) => compareModelId.trim())
        .filter((compareModelId) => compareModelId.length > 0)
    : undefined;
  const replayPath = parsedArgs.replay ? String(parsedArgs.replay) : undefined;
  const criticalPath = parsedArgs["critical-path"] === true;

  if (compareToolConfigIds && compareToolConfigIds.length < 2) {
    throw new Error("--compare must include at least two tool config ids");
  }
  if (
    compareToolConfigIds &&
    new Set(compareToolConfigIds).size !== compareToolConfigIds.length
  ) {
    throw new Error("--compare tool config ids must be unique");
  }
  if (compareModelIds && compareModelIds.length < 2) {
    throw new Error("--compare-models must include at least two model ids");
  }
  if (
    compareModelIds &&
    new Set(compareModelIds).size !== compareModelIds.length
  ) {
    throw new Error("--compare-models model ids must be unique");
  }
  if (compareToolConfigIds && compareModelIds) {
    throw new Error("Use either --compare or --compare-models, not both");
  }
  if (replayPath && (compareToolConfigIds || compareModelIds)) {
    throw new Error(
      "--replay cannot be combined with --compare or --compare-models",
    );
  }

  let resolvedFilter = filter;
  if (criticalPath) {
    if (filter) {
      throw new Error("--critical-path cannot be combined with --filter");
    }
    resolvedFilter = buildCriticalPathFilterRegex();
  }

  const modelConcurrency = Number.parseInt(
    process.env.EVAL_MODEL_CONCURRENCY ?? "2",
    10,
  );

  if (!Number.isFinite(trialCount) || trialCount < 1) {
    trialCount = 1;
  }

  return {
    filter: resolvedFilter,
    list,
    permitNoFiles,
    trialCount,
    minPassRate,
    toolConfigId,
    compareToolConfigIds,
    compareModelIds,
    modelConcurrency:
      Number.isFinite(modelConcurrency) && modelConcurrency > 0
        ? modelConcurrency
        : 2,
    replayPath,
    criticalPath,
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

  return cases.filter(
    (testCase) =>
      options.filter?.test(testCase.id) ||
      options.filter?.test(testCase.description),
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
    const tools = testResult.metadata.trajectory
      .map((record) => record.toolName)
      .join(", ");
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

/** printModelCompareSummary renders a compact terminal model comparison table. */
function printModelCompareSummary(compareResult: EvalModelCompareResult): void {
  console.log(`Models: ${compareResult.modelIds.join(", ")}`);
  console.log(`Tool config: ${compareResult.toolConfigId}`);
  console.log(`Trials per case: ${compareResult.trialCount}`);
  console.log("");

  for (const comparison of compareResult.caseComparisons) {
    const rates = compareResult.modelIds.map((compareModelId) => {
      const casePassRate = comparison.passRatesByModelId[compareModelId];
      const percentage = casePassRate
        ? `${(casePassRate.passRate * 100).toFixed(1)}%`
        : "n/a";
      return `${compareModelId}=${percentage}`;
    });
    console.log(`${comparison.id}: ${rates.join(", ")}`);
  }
}

/** printReplaySummary renders replay assertion outcomes. */
function printReplaySummary(
  replayPath: string,
  results: Awaited<ReturnType<typeof runReplayFile>>,
): void {
  console.log(`Replay source: ${replayPath}`);
  console.log(`Replay success: ${results.success}`);
  console.log("");

  for (const replayResult of results.results) {
    console.log(
      `[${replayResult.success ? "PASS" : "FAIL"}] ${replayResult.caseId}`,
    );
    for (const assertion of replayResult.assertions) {
      console.log(`  - ${assertion.pass ? "PASS" : "FAIL"}: ${assertion.name}`);
      if (!assertion.pass && assertion.message) {
        console.log(`    ${assertion.message}`);
      }
    }
    console.log("");
  }
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

  const cliOptions = parseCliOptions(process.argv.slice(2));

  if (cliOptions.replayPath) {
    const replayResult = await runReplayFile(cliOptions.replayPath);
    printReplaySummary(cliOptions.replayPath, replayResult);
    if (!replayResult.success) {
      process.exitCode = 1;
    }
    process.exit();
  }

  const selectedEvalCases = selectEvalCases(evalCases, cliOptions);

  if (cliOptions.list) {
    printAvailableCases(selectedEvalCases);
    process.exit();
  }

  if (selectedEvalCases.length === 0) {
    const message = "No eval cases matched the provided filter.";
    if (cliOptions.permitNoFiles) {
      console.log(message);
      process.exit();
    }

    throw new Error(message);
  }

  if (cliOptions.compareModelIds) {
    const toolConfig = resolveToolConfig(cliOptions.toolConfigId);
    const modelRunResult = await runEvalSuiteForModels(
      selectedEvalCases,
      toolConfig,
      cliOptions.compareModelIds,
      {
        providerId,
        trialCount: cliOptions.trialCount,
        minPassRate: cliOptions.minPassRate,
        modelConcurrency: cliOptions.modelConcurrency,
      },
    );

    if (modelRunResult.fatalError) {
      console.log(
        `\nRun aborted due to fatal API error: ${modelRunResult.fatalError}`,
      );
      process.exitCode = 2;
      process.exit();
    }

    const modelCompareResult = buildModelCompareResult(
      selectedEvalCases,
      modelRunResult.statsResults,
      {
        providerId,
        modelId: cliOptions.compareModelIds[0] ?? modelId,
        trialCount: cliOptions.trialCount,
        minPassRate: cliOptions.minPassRate,
        toolConfigId: toolConfig.id,
      },
    );
    printModelCompareSummary(modelCompareResult);
    const modelCompareOutputPath =
      await writeModelCompareResult(modelCompareResult);
    console.log(`Wrote model comparison results to ${modelCompareOutputPath}`);

    if (modelRunResult.failed) {
      process.exitCode = 1;
    }
    process.exit();
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
        process.exitCode = 2;
        process.exit();
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
      process.exitCode = 1;
    }
    process.exit();
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
    process.exitCode = 2;
    process.exit();
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
      process.exitCode = 1;
    }
  } else if (!runResult.suiteResult.success) {
    process.exitCode = 1;
  }
}
