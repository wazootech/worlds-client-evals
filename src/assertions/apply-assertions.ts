import type { AssertionSpec, EvalCaseResult } from "../types.ts";
import {
  defaultToolConfigId,
  resolveToolConfig,
} from "../tool-configs/index.ts";
import type { ToolConfig } from "../tool-configs/types.ts";
import { runAssertionSpecs } from "./assertion-registry.ts";

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
  const success = result.runCompleted &&
    assertions.every((assertion) => assertion.pass);
  return {
    ...result,
    success,
    assertions,
    toolSequence: result.metadata.trajectory.map((record) => record.toolName),
  };
}
