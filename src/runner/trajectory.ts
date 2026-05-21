import type { EvalToolRecord } from "../types.ts";

/** buildTrajectory flattens the AI SDK step history into a tool sequence. */
export function buildTrajectory(
  steps: Array<{
    toolCalls: Array<{
      toolName: string;
      input: unknown;
      toolCallId: string;
    }>;
    toolResults: Array<{
      toolCallId: string;
      output: unknown;
    }>;
  }>,
): EvalToolRecord[] {
  return steps.flatMap((step, stepIndex) =>
    step.toolCalls.map((toolCall) => ({
      stepIndex,
      toolName: toolCall.toolName,
      args: toolCall.input,
      result: step.toolResults.find((toolResult) =>
        toolResult.toolCallId === toolCall.toolCallId
      )?.output,
    }))
  );
}
