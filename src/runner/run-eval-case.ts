import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs } from "ai";
import {
  compileEvalPrompt,
  defaultToolConfigId,
  resolveToolConfig,
} from "../tool-configs/index.ts";
import type { ToolConfig } from "../tool-configs/types.ts";
import type { EvalCaseDefinition, EvalCaseResult } from "../types.ts";
import { resolveFixture } from "../fixtures/index.ts";
import { EVAL_AGENT_SYSTEM_PROMPT } from "./eval-agent-system-prompt.ts";
import { buildTrajectory } from "./build-trajectory.ts";

/** runEvalCase executes one evaluation scenario against the seeded world. */
export async function runEvalCase(
  testCase: EvalCaseDefinition,
  options?: { providerId?: string; modelId?: string; toolConfig?: ToolConfig },
): Promise<EvalCaseResult> {
  const providerId = options?.providerId ?? "google";
  const modelId = options?.modelId ?? "gemini-3.1-flash-lite";
  const toolConfig = options?.toolConfig ??
    resolveToolConfig(defaultToolConfigId);
  const prompt = compileEvalPrompt(
    testCase.promptTemplate ?? testCase.prompt ?? "",
    toolConfig,
  );
  const compiledSystemPrompt = compileEvalPrompt(
    EVAL_AGENT_SYSTEM_PROMPT,
    toolConfig,
  );
  const systemPrompt = toolConfig.systemPromptAdditions
    ? `${compiledSystemPrompt}\n\n${toolConfig.systemPromptAdditions}`
    : compiledSystemPrompt;
  const startedAt = Date.now();
  const emptyMetadata = {
    providerId,
    modelId,
    stepCount: 0,
    latencyMs: 0,
    trajectory: [],
  };

  try {
    const google = createGoogleGenerativeAI();
    const client = await resolveFixture(testCase.fixtureId)();
    const tools = toolConfig.factory(client);
    const result = await generateText({
      model: google(modelId),
      tools,
      system: systemPrompt,
      stopWhen: stepCountIs(testCase.maxSteps ?? 5),
      prompt,
    });
    const latencyMs = Date.now() - startedAt;

    return {
      id: testCase.id,
      description: testCase.description,
      prompt,
      output: result.text,
      runCompleted: true,
      success: false,
      metadata: {
        providerId,
        modelId,
        stepCount: result.steps.length,
        finishReason: result.finishReason,
        latencyMs,
        tokenUsage: result.usage
          ? {
            prompt: result.usage.inputTokens,
            completion: result.usage.outputTokens,
            total: result.usage.totalTokens,
          }
          : undefined,
        trajectory: buildTrajectory(result.steps),
      },
      assertions: [],
      toolSequence: [],
    };
  } catch (error) {
    return {
      id: testCase.id,
      description: testCase.description,
      prompt,
      output: "",
      runCompleted: false,
      success: false,
      metadata: {
        ...emptyMetadata,
        latencyMs: Date.now() - startedAt,
      },
      assertions: [],
      toolSequence: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
