import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs } from "ai";
import { createEvalTools } from "../tools/eval-tools.ts";
import type { EvalCaseDefinition, EvalCaseResult } from "../types.ts";
import type { Client } from "@worlds/client";
import { createSeededWorldClient } from "../fixtures/primary-world.ts";
import { createSeededScholarWorldClient } from "../fixtures/scholar-world.ts";
import { EVAL_AGENT_SYSTEM_PROMPT } from "./prompt.ts";
import { buildTrajectory } from "./trajectory.ts";

/** fixtureFactories maps fixtureId to an async factory that returns a seeded world client. */
const fixtureFactories: Record<string, () => Promise<Client>> = {
  primary: createSeededWorldClient,
  scholar: createSeededScholarWorldClient,
};

/** resolveFixture resolves the world client factory for a given test case. */
function resolveFixture(
  testCase: { fixtureId?: string },
): () => Promise<Client> {
  const fixtureId = testCase.fixtureId ?? "primary";
  const factory = fixtureFactories[fixtureId];
  if (!factory) {
    throw new Error(
      `Unknown fixtureId: "${fixtureId}". Available fixtures: ${
        Object.keys(fixtureFactories).join(", ")
      }`,
    );
  }
  return factory;
}

/** runEvalCase executes one evaluation scenario against the seeded world. */
export async function runEvalCase(
  testCase: EvalCaseDefinition,
  options?: { providerId?: string; modelId?: string },
): Promise<EvalCaseResult> {
  const providerId = options?.providerId ?? "google";
  const modelId = options?.modelId ?? "gemini-3.1-flash-lite";
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
    const client = await resolveFixture(testCase)();
    const tools = createEvalTools(client);
    const result = await generateText({
      model: google(modelId),
      tools,
      system: EVAL_AGENT_SYSTEM_PROMPT,
      stopWhen: stepCountIs(testCase.maxSteps ?? 5),
      prompt: testCase.prompt,
    });
    const latencyMs = Date.now() - startedAt;

    return {
      id: testCase.id,
      description: testCase.description,
      prompt: testCase.prompt,
      output: result.text,
      success: true,
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
      prompt: testCase.prompt,
      output: "",
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
