import { readFile } from "node:fs/promises";
import { applyAssertions } from "@/assertions/apply-assertions.ts";
import { evalCases } from "@/cases/index.ts";
import { compileEvalPrompt, resolveToolConfig } from "@/tool-configs/index.ts";
import type {
  EvalCaseResult,
  EvalReplayDocument,
  EvalSuiteResult,
  EvalToolRecord,
} from "@/types.ts";

/** ReplayRunResult stores one replayed case outcome. */
export interface ReplayRunResult {
  caseId: string;
  success: boolean;
  assertions: EvalCaseResult["assertions"];
  output: string;
}

/** ReplaySuiteResult stores outcomes for every replayed case in one file. */
export interface ReplaySuiteResult {
  sourcePath: string;
  success: boolean;
  results: ReplayRunResult[];
}

/** isEvalSuiteResult narrows parsed JSON to a full suite artifact shape. */
function isEvalSuiteResult(value: unknown): value is EvalSuiteResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "results" in value &&
    Array.isArray((value as EvalSuiteResult).results)
  );
}

/** isEvalReplayDocument narrows parsed JSON to a replay document shape. */
function isEvalReplayDocument(value: unknown): value is EvalReplayDocument {
  return (
    typeof value === "object" &&
    value !== null &&
    "caseId" in value &&
    "trajectory" in value &&
    "output" in value &&
    Array.isArray((value as EvalReplayDocument).trajectory)
  );
}

/** buildEvalCaseResultFromReplay constructs a case result for assertion replay. */
function buildEvalCaseResultFromReplay(
  replayDocument: EvalReplayDocument,
  description: string,
  prompt: string,
): EvalCaseResult {
  const trajectory: EvalToolRecord[] = replayDocument.trajectory;
  const stepCount =
    replayDocument.stepCount ??
    (trajectory.length > 0
      ? Math.max(...trajectory.map((record) => record.stepIndex)) + 1
      : 0);

  return {
    id: replayDocument.caseId,
    description,
    prompt,
    output: replayDocument.output,
    runCompleted:
      replayDocument.runCompleted ?? replayDocument.error === undefined,
    success: false,
    metadata: {
      providerId: replayDocument.providerId ?? "replay",
      modelId: replayDocument.modelId ?? "replay",
      stepCount,
      latencyMs: replayDocument.latencyMs ?? 0,
      trajectory,
    },
    assertions: [],
    toolSequence: trajectory.map((record) => record.toolName),
    error: replayDocument.error,
  };
}

/** replayEvalCase applies assertions to one replay document without calling Gemini. */
export function replayEvalCase(
  replayDocument: EvalReplayDocument,
): ReplayRunResult {
  const evalCase = evalCases.find(
    (testCase) => testCase.id === replayDocument.caseId,
  );
  if (!evalCase) {
    throw new Error(
      `Unknown replay case id "${replayDocument.caseId}"; add it to src/cases/index.ts first.`,
    );
  }

  const toolConfig = resolveToolConfig(
    replayDocument.toolConfigId ?? "baseline",
  );
  const prompt = compileEvalPrompt(
    evalCase.promptTemplate ?? evalCase.prompt ?? "",
    toolConfig,
  );

  const rawResult = buildEvalCaseResultFromReplay(
    replayDocument,
    evalCase.description,
    prompt,
  );
  const assertedResult = applyAssertions(
    rawResult,
    evalCase.assertions,
    toolConfig,
  );

  return {
    caseId: assertedResult.id,
    success: assertedResult.success,
    assertions: assertedResult.assertions,
    output: assertedResult.output,
  };
}

/** loadReplayDocuments reads one suite artifact or one replay document from disk. */
export async function loadReplayDocuments(
  replayPath: string,
): Promise<EvalReplayDocument[]> {
  const fileContents = await readFile(replayPath, "utf8");
  const parsedJson: unknown = JSON.parse(fileContents);

  if (isEvalSuiteResult(parsedJson)) {
    return parsedJson.results.map((caseResult) => ({
      caseId: caseResult.id,
      toolConfigId: parsedJson.toolConfigId,
      output: caseResult.output,
      runCompleted: caseResult.runCompleted,
      trajectory: caseResult.metadata.trajectory,
      providerId: caseResult.metadata.providerId,
      modelId: caseResult.metadata.modelId,
      stepCount: caseResult.metadata.stepCount,
      latencyMs: caseResult.metadata.latencyMs,
      error: caseResult.error,
    }));
  }

  if (isEvalReplayDocument(parsedJson)) {
    return [parsedJson];
  }

  throw new Error(
    `Unsupported replay JSON at ${replayPath}; expected EvalSuiteResult or EvalReplayDocument.`,
  );
}

/** runReplayFile replays every case encoded in one JSON file. */
export async function runReplayFile(
  replayPath: string,
): Promise<ReplaySuiteResult> {
  const replayDocuments = await loadReplayDocuments(replayPath);
  const results = replayDocuments.map((replayDocument) =>
    replayEvalCase(replayDocument),
  );

  return {
    sourcePath: replayPath,
    success: results.every((result) => result.success),
    results,
  };
}
