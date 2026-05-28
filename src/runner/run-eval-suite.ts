import { applyAssertions } from "@/assertions/index.ts";
import { writeStatsResult, writeSuiteResult } from "@/results/result-store.ts";
import { defaultToolConfigId } from "@/tool-configs/index.ts";
import type { ToolConfig } from "@/tool-configs/types.ts";
import type {
  EvalAssertionPassRate,
  EvalCaseDefinition,
  EvalCasePassRate,
  EvalCaseResult,
  EvalCompareResult,
  EvalModelCompareResult,
  EvalStatsResult,
  EvalSuiteResult,
} from "@/types.ts";
import { runEvalCase } from "./run-eval-case.ts";
import { runParallelTasks } from "./run-parallel-tasks.ts";

/** EvalSuiteRunOptions configures provider metadata for one suite execution. */
export interface EvalSuiteRunOptions {
  providerId: string;
  modelId: string;
  trialCount: number;
  minPassRate?: number;
  compareMode?: boolean;
  modelCompareMode?: boolean;
}

/** EvalToolConfigRunResult stores one tool config's suite and stats outputs. */
export interface EvalToolConfigRunResult {
  suiteResult: EvalSuiteResult;
  statsResult?: EvalStatsResult;
  fatalError?: string;
}

/** isFatalApiError detects unrecoverable API failures that will affect all subsequent calls. */
export function isFatalApiError(errorMessage: string): boolean {
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

/** aggregateEvalStats computes per-case and per-assertion pass rates across trials. */
export function aggregateEvalStats(
  selectedCases: EvalCaseDefinition[],
  trialResults: EvalCaseResult[][],
  providerId: string,
  modelId: string,
  toolConfigId: string,
  minPassRate?: number,
): EvalStatsResult {
  const casePassRates: EvalCasePassRate[] = selectedCases.map((testCase) => {
    const resultsForCase = trialResults.map((trial) =>
      trial.find((result) => result.id === testCase.id),
    );

    const assertionNames = [
      ...new Set(
        resultsForCase.flatMap(
          (result) =>
            result?.assertions.map((assertion) => assertion.name) ?? [],
        ),
      ),
    ];

    const assertionPassRates: EvalAssertionPassRate[] = assertionNames.map(
      (assertionName) => {
        let passCount = 0;
        let observedTrials = 0;

        for (const result of resultsForCase) {
          const assertion = result?.assertions.find(
            (entry) => entry.name === assertionName,
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

  const success =
    minPassRate === undefined
      ? casePassRates.every((caseRate) => caseRate.passRate === 1)
      : casePassRates.every((caseRate) => caseRate.passRate >= minPassRate);

  return {
    providerId,
    modelId,
    toolConfigId,
    timestamp: new Date().toISOString(),
    trialCount: trialResults.length,
    minPassRate,
    success,
    casePassRates,
  };
}

/** synthesizeStatsFromSuite creates one-trial pass rates from a single suite result. */
export function synthesizeStatsFromSuite(
  suiteResult: EvalSuiteResult,
  minPassRate?: number,
): EvalStatsResult {
  return {
    providerId: suiteResult.providerId,
    modelId: suiteResult.modelId,
    toolConfigId: suiteResult.toolConfigId,
    timestamp: suiteResult.timestamp,
    trialCount: 1,
    minPassRate,
    success: suiteResult.success,
    casePassRates: suiteResult.results.map((caseResult) => ({
      id: caseResult.id,
      description: caseResult.description,
      passCount: caseResult.success ? 1 : 0,
      trialCount: 1,
      passRate: caseResult.success ? 1 : 0,
      assertionPassRates: caseResult.assertions.map((assertion) => ({
        name: assertion.name,
        passCount: assertion.pass ? 1 : 0,
        trialCount: 1,
        passRate: assertion.pass ? 1 : 0,
      })),
    })),
  };
}

/** buildCompareResult creates side-by-side stats for multiple tool configs. */
export function buildCompareResult(
  selectedCases: EvalCaseDefinition[],
  statsResults: EvalStatsResult[],
  options: EvalSuiteRunOptions,
): EvalCompareResult {
  const toolConfigIds = statsResults.map(
    (statsResult) => statsResult.toolConfigId ?? defaultToolConfigId,
  );

  return {
    providerId: options.providerId,
    modelId: options.modelId,
    timestamp: new Date().toISOString(),
    trialCount: options.trialCount,
    minPassRate: options.minPassRate,
    baselineToolConfigId: toolConfigIds[0],
    toolConfigIds,
    statsResults,
    caseComparisons: selectedCases.map((testCase) => ({
      id: testCase.id,
      description: testCase.description,
      passRatesByToolConfig: Object.fromEntries(
        statsResults.flatMap((statsResult) => {
          const casePassRate = statsResult.casePassRates.find(
            (entry) => entry.id === testCase.id,
          );
          const toolConfigId = statsResult.toolConfigId ?? defaultToolConfigId;
          return casePassRate ? [[toolConfigId, casePassRate]] : [];
        }),
      ),
    })),
  };
}

/** runEvalSuiteForToolConfig runs selected cases against one named tool set. */
export async function runEvalSuiteForToolConfig(
  selectedEvalCases: EvalCaseDefinition[],
  toolConfig: ToolConfig,
  options: EvalSuiteRunOptions,
): Promise<EvalToolConfigRunResult> {
  const trialSuiteResults: EvalSuiteResult[] = [];
  let fatalError: string | undefined;

  for (let trialIndex = 0; trialIndex < options.trialCount; trialIndex += 1) {
    if (fatalError) {
      break;
    }

    if (options.trialCount > 1) {
      console.log(
        `[${toolConfig.id}] Trial ${trialIndex + 1}/${options.trialCount}`,
      );
      console.log("");
    }

    const results = [];
    for (const testCase of selectedEvalCases) {
      if (fatalError) {
        break;
      }

      const rawResult = await runEvalCase(testCase, {
        providerId: options.providerId,
        modelId: options.modelId,
        toolConfig,
      });

      if (rawResult.error && isFatalApiError(rawResult.error)) {
        fatalError = rawResult.error;
        console.log(
          `\nFatal API error detected — aborting run: ${rawResult.error}`,
        );
        break;
      }

      results.push(applyAssertions(rawResult, testCase.assertions, toolConfig));
    }

    trialSuiteResults.push({
      providerId: options.providerId,
      modelId: options.modelId,
      toolConfigId: toolConfig.id,
      timestamp: new Date().toISOString(),
      success: results.every((result) => result.success),
      results,
    });
  }

  const suiteResult = trialSuiteResults[trialSuiteResults.length - 1];
  const shouldAggregateStats =
    options.trialCount > 1 ||
    options.compareMode === true ||
    options.modelCompareMode === true;
  const statsResult = shouldAggregateStats
    ? aggregateEvalStats(
        selectedEvalCases,
        trialSuiteResults.map((trial) => trial.results),
        options.providerId,
        options.modelId,
        toolConfig.id,
        options.minPassRate,
      )
    : undefined;

  return { suiteResult, statsResult, fatalError };
}

/** buildModelCompareResult creates side-by-side stats for multiple model ids. */
export function buildModelCompareResult(
  selectedCases: EvalCaseDefinition[],
  statsResults: EvalStatsResult[],
  options: EvalSuiteRunOptions & { toolConfigId: string },
): EvalModelCompareResult {
  const modelIds = statsResults.map((statsResult) => statsResult.modelId);

  return {
    providerId: options.providerId,
    toolConfigId: options.toolConfigId,
    timestamp: new Date().toISOString(),
    trialCount: options.trialCount,
    minPassRate: options.minPassRate,
    baselineModelId: modelIds[0] ?? options.modelId,
    modelIds,
    statsResults,
    caseComparisons: selectedCases.map((testCase) => ({
      id: testCase.id,
      description: testCase.description,
      passRatesByModelId: Object.fromEntries(
        statsResults.flatMap((statsResult) => {
          const casePassRate = statsResult.casePassRates.find(
            (entry) => entry.id === testCase.id,
          );
          return casePassRate ? [[statsResult.modelId, casePassRate]] : [];
        }),
      ),
    })),
  };
}

/** runEvalSuiteForModels runs the same cases against multiple models in parallel. */
export async function runEvalSuiteForModels(
  selectedEvalCases: EvalCaseDefinition[],
  toolConfig: ToolConfig,
  modelIds: string[],
  options: Omit<EvalSuiteRunOptions, "modelId"> & { modelConcurrency: number },
): Promise<{
  statsResults: EvalStatsResult[];
  fatalError?: string;
  failed: boolean;
}> {
  const parallelResults = await runParallelTasks(
    modelIds.map((modelId) => async () => {
      const runResult = await runEvalSuiteForToolConfig(
        selectedEvalCases,
        toolConfig,
        {
          ...options,
          modelId,
          modelCompareMode: true,
        },
      );
      return { modelId, runResult };
    }),
    options.modelConcurrency,
  );

  const statsResults: EvalStatsResult[] = [];
  let fatalError: string | undefined;
  let failed = false;

  for (const parallelResult of parallelResults) {
    if (parallelResult.runResult.fatalError) {
      fatalError = parallelResult.runResult.fatalError;
    }
    if (parallelResult.runResult.statsResult) {
      statsResults.push(parallelResult.runResult.statsResult);
      if (!parallelResult.runResult.statsResult.success) {
        failed = true;
      }
    } else if (!parallelResult.runResult.suiteResult.success) {
      failed = true;
    }

    const latestOutputPath = await writeSuiteResult(
      parallelResult.runResult.suiteResult,
      parallelResult.modelId,
    );
    console.log(
      `Wrote ${parallelResult.modelId} results to ${latestOutputPath}`,
    );

    if (parallelResult.runResult.statsResult) {
      const statsOutputPath = await writeStatsResult(
        parallelResult.runResult.statsResult,
        parallelResult.modelId,
      );
      console.log(
        `Wrote ${parallelResult.modelId} statistical results to ${statsOutputPath}`,
      );
    }
  }

  return { statsResults, fatalError, failed };
}
