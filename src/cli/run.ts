import { parseArgs } from "@std/cli/parse-args";
import { ensureDir } from "@std/fs";
import { dirname, fromFileUrl, join } from "@std/path";
import { applyAssertions } from "../assertions/index.ts";
import { evalCases } from "../cases/index.ts";
import { runEvalCase } from "../runner/agent-runner.ts";
import type {
  EvalAssertionPassRate,
  EvalCaseDefinition,
  EvalCasePassRate,
  EvalCaseResult,
  EvalStatsResult,
  EvalSuiteResult,
} from "../types.ts";

const providerId = Deno.env.get("EVAL_PROVIDER_ID") ?? "google";
const modelId = Deno.env.get("EVAL_MODEL_ID") ?? "gemini-3.1-flash-lite";
const supportedProviderIds = new Set(["google"]);

interface EvalCliOptions {
  filter?: RegExp;
  filterRaw?: string;
  list: boolean;
  permitNoFiles: boolean;
  trialCount: number;
  minPassRate?: number;
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
    string: ["filter", "trials", "min-pass-rate"],
    unknown: (argument) => {
      if (argument === "--") {
        return true;
      }

      throw new Error(
        `Unsupported argument: ${argument}. Supported flags: --filter <pattern>, --list, --permit-no-files, --trials <N>, --min-pass-rate <0-1>`,
      );
    },
  });

  if (parsedArgs._.length > 0) {
    throw new Error(
      `Unsupported argument: ${
        parsedArgs._[0]
      }. Supported flags: --filter <pattern>, --list, --permit-no-files, --trials <N>, --min-pass-rate <0-1>`,
    );
  }

  const filterRaw = parsedArgs.filter;
  const filter = filterRaw ? parseFilter(filterRaw) : undefined;
  const list = parsedArgs.list;
  const permitNoFiles = parsedArgs["permit-no-files"];
  let trialCount = parsedArgs.trials
    ? parsePositiveIntegerOption("--trials", parsedArgs.trials)
    : Number.parseInt(Deno.env.get("EVAL_TRIALS") ?? "1", 10);
  const minPassRate = parsedArgs["min-pass-rate"]
    ? parsePassRateOption("--min-pass-rate", parsedArgs["min-pass-rate"])
    : undefined;

  if (!Number.isFinite(trialCount) || trialCount < 1) {
    trialCount = 1;
  }

  return {
    filter,
    filterRaw,
    list,
    permitNoFiles,
    trialCount,
    minPassRate,
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

/** writeResults persists the latest eval suite report to disk. */
async function writeResults(result: EvalSuiteResult): Promise<string> {
  const repositoryRoot = join(
    dirname(fromFileUrl(import.meta.url)),
    "..",
    "..",
  );
  const resultsDirectory = join(repositoryRoot, "results");
  const outputPath = join(resultsDirectory, "latest.json");
  await ensureDir(resultsDirectory);
  await Deno.writeTextFile(outputPath, JSON.stringify(result, null, 2));
  return outputPath;
}

/** writeStatsResults persists aggregated multi-trial pass rates to disk. */
async function writeStatsResults(result: EvalStatsResult): Promise<string> {
  const repositoryRoot = join(
    dirname(fromFileUrl(import.meta.url)),
    "..",
    "..",
  );
  const resultsDirectory = join(repositoryRoot, "results");
  const outputPath = join(resultsDirectory, "stats-latest.json");
  await ensureDir(resultsDirectory);
  await Deno.writeTextFile(outputPath, JSON.stringify(result, null, 2));
  return outputPath;
}

/** aggregateEvalStats computes per-case and per-assertion pass rates across trials. */
function aggregateEvalStats(
  selectedCases: EvalCaseDefinition[],
  trialResults: EvalCaseResult[][],
  provider: string,
  model: string,
  minPassRate?: number,
): EvalStatsResult {
  const casePassRates: EvalCasePassRate[] = selectedCases.map((testCase) => {
    const resultsForCase = trialResults.map((trial) =>
      trial.find((result) => result.id === testCase.id)
    );

    const assertionNames = [
      ...new Set(
        resultsForCase.flatMap((result) =>
          result?.assertions.map((assertion) => assertion.name) ?? []
        ),
      ),
    ];

    const assertionPassRates: EvalAssertionPassRate[] = assertionNames.map(
      (assertionName) => {
        let passCount = 0;
        let observedTrials = 0;

        for (const result of resultsForCase) {
          const assertion = result?.assertions.find((entry) =>
            entry.name === assertionName
          );
          if (!assertion) {
            continue;
          }
          observedTrials += 1;
          if (assertion.pass) {
            passCount += 1;
          }
        }

        const trialCount = observedTrials;
        return {
          name: assertionName,
          passCount,
          trialCount,
          passRate: trialCount === 0 ? 0 : passCount / trialCount,
        };
      },
    );

    const passCount = resultsForCase.filter((result) => result?.success).length;
    const trialCount = resultsForCase.length;

    return {
      id: testCase.id,
      description: testCase.description,
      passCount,
      trialCount,
      passRate: trialCount === 0 ? 0 : passCount / trialCount,
      assertionPassRates,
    };
  });

  const success = minPassRate === undefined
    ? casePassRates.every((caseRate) => caseRate.passRate === 1)
    : casePassRates.every((caseRate) => caseRate.passRate >= minPassRate);

  return {
    providerId: provider,
    modelId: model,
    timestamp: new Date().toISOString(),
    trialCount: trialResults.length,
    minPassRate,
    success,
    casePassRates,
  };
}

/** printStatsSummary renders aggregated pass rates for multi-trial runs. */
function printStatsSummary(statsResult: EvalStatsResult): void {
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

/** isFatalApiError detects unrecoverable API failures that will affect all subsequent calls. */
function isFatalApiError(errorMessage: string): boolean {
  const fatalPatterns = [
    "prepayment credits are depleted",
    "quota exceeded",
    "rate limit exceeded",
    "api key not valid",
    "api key invalid",
    "authentication error",
    "permission denied",
    "billing account",
    "payment required",
  ];
  const lowerMessage = errorMessage.toLowerCase();
  return fatalPatterns.some((pattern) => lowerMessage.includes(pattern));
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

  const trialSuiteResults: EvalSuiteResult[] = [];

  let fatalError: string | undefined;

  for (
    let trialIndex = 0;
    trialIndex < cliOptions.trialCount;
    trialIndex += 1
  ) {
    if (fatalError) {
      break;
    }

    if (cliOptions.trialCount > 1) {
      console.log(`Trial ${trialIndex + 1}/${cliOptions.trialCount}`);
      console.log("");
    }

    const results = [];
    for (const testCase of selectedEvalCases) {
      if (fatalError) {
        break;
      }

      const rawResult = await runEvalCase(testCase, { providerId, modelId });

      if (rawResult.error && isFatalApiError(rawResult.error)) {
        fatalError = rawResult.error;
        console.log(
          `\nFatal API error detected — aborting run: ${rawResult.error}`,
        );
        break;
      }

      results.push(applyAssertions(rawResult));
    }

    trialSuiteResults.push({
      providerId,
      modelId,
      timestamp: new Date().toISOString(),
      success: results.every((result) => result.success),
      results,
    });
  }

  if (fatalError) {
    console.log(`\nRun aborted due to fatal API error: ${fatalError}`);
    Deno.exitCode = 2;
    Deno.exit();
  }

  const suiteResult = trialSuiteResults[trialSuiteResults.length - 1];
  const statsResult = cliOptions.trialCount > 1
    ? aggregateEvalStats(
      selectedEvalCases,
      trialSuiteResults.map((trial) => trial.results),
      providerId,
      modelId,
      cliOptions.minPassRate,
    )
    : undefined;

  if (statsResult) {
    printStatsSummary(statsResult);
    const statsOutputPath = await writeStatsResults(statsResult);
    console.log(`Wrote statistical results to ${statsOutputPath}`);
  } else {
    printSummary(suiteResult);
  }

  const outputPath = await writeResults(suiteResult);
  console.log(`Wrote results to ${outputPath}`);

  if (statsResult) {
    if (!statsResult.success) {
      Deno.exitCode = 1;
    }
  } else if (!suiteResult.success) {
    Deno.exitCode = 1;
  }
}
