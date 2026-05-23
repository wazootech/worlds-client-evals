import type { AssertionSpec, EvalCaseResult } from "../types.ts";
import {
  defaultToolConfigId,
  resolveToolConfig,
} from "../tool-configs/index.ts";
import type { ToolConfig } from "../tool-configs/types.ts";
import { runAssertionSpecs } from "./assertion-registry.ts";
import {
  collectToolOutputLiterals,
  extractSearchSubjects,
  extractSparqlBindingLiterals,
  normalizeOutputText,
} from "./trajectory-reducers.ts";

export {
  collectToolOutputLiterals,
  extractSearchSubjects,
  extractSparqlBindingLiterals,
  normalizeOutputText,
};

/** assertOutputExcludesLiteral verifies the final answer does not contain a forbidden literal. */
export function assertOutputExcludesLiteral(
  result: EvalCaseResult,
  forbiddenLiteral: string,
  assertionName: string,
): { name: string; pass: boolean; message?: string } {
  const normalizedOutput = normalizeOutputText(result.output);
  const forbiddenSubstring = normalizeOutputText(forbiddenLiteral);
  const pass = !normalizedOutput.includes(forbiddenSubstring);
  return {
    name: assertionName,
    pass,
    message: pass
      ? undefined
      : `Final answer must not contain "${forbiddenLiteral}"; got: ${
        result.output.slice(0, 200)
      }`,
  };
}

/** applyAssertions runs declarative specs for one evaluation result. */
export function applyAssertions(
  result: EvalCaseResult,
  specs: AssertionSpec[],
  toolConfig: ToolConfig = resolveToolConfig(defaultToolConfigId),
): EvalCaseResult {
  if (specs.length === 0) {
    throw new Error(
      `No assertion specs provided for case id: ${result.id}`,
    );
  }

  const assertions = runAssertionSpecs(result, specs, toolConfig);
  const success = result.success &&
    assertions.every((assertion) => assertion.pass);
  return {
    ...result,
    success,
    assertions,
    toolSequence: result.metadata.trajectory.map((record) => record.toolName),
  };
}
