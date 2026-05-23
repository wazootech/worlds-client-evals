import type { FixtureId } from "./fixtures/index.ts";

/** EvalTokenUsage captures token accounting for a single agent run. */
export interface EvalTokenUsage {
  prompt?: number;
  completion?: number;
  total?: number;
}

/** EvalToolRecord stores one tool call and its corresponding output. */
export interface EvalToolRecord {
  stepIndex: number;
  toolName: string;
  args: unknown;
  result: unknown;
}

/** EvalRunMetadata collects execution details for one evaluation case. */
export interface EvalRunMetadata {
  providerId: string;
  modelId: string;
  stepCount: number;
  finishReason?: string;
  latencyMs: number;
  tokenUsage?: EvalTokenUsage;
  trajectory: EvalToolRecord[];
}

/** EvalAssertionResult reports whether a single assertion passed. */
export interface EvalAssertionResult {
  name: string;
  pass: boolean;
  message?: string;
}

/** AssertionSpecKind identifies a composable assertion implementation in the registry. */
export type AssertionSpecKind =
  | "used-required-tools"
  | "search-before-sparql"
  | "sparql-handoff-valid"
  | "step-count-bounded"
  | "updates-blocked"
  | "final-answer-contains"
  | "output-excludes"
  | "sparql-answer-grounded"
  | "sparql-answer-excludes"
  | "literals-subset-of-tools";

/** AssertionSpec names one composable invariant and its parameters for a case. */
export type AssertionSpec =
  | { name: string; kind: "used-required-tools" }
  | { name: string; kind: "search-before-sparql" }
  | { name: string; kind: "sparql-handoff-valid" }
  | { name: string; kind: "step-count-bounded"; maxSteps: number }
  | { name: string; kind: "updates-blocked" }
  | { name: string; kind: "final-answer-contains"; literal: string }
  | { name: string; kind: "output-excludes"; literal: string }
  | { name: string; kind: "sparql-answer-grounded"; literal: string }
  | { name: string; kind: "sparql-answer-excludes"; literal: string }
  | { name: string; kind: "literals-subset-of-tools" };

/** EvalCaseTestFixture supplies deterministic trajectory and output for unit tests. */
export interface EvalCaseTestFixture {
  trajectory: EvalToolRecord[];
  output: string;
}

/** EvalCaseDefinition describes one agent evaluation scenario. */
export interface EvalCaseDefinition {
  id: string;
  description: string;
  prompt?: string;
  promptTemplate?: string;
  maxSteps?: number;
  fixtureId?: FixtureId;
  assertions: AssertionSpec[];
}

/** EvalCaseResult stores the output and assertion results for one scenario. */
export interface EvalCaseResult {
  id: string;
  description: string;
  prompt: string;
  output: string;
  /** runCompleted is true when the agent run finished without throwing. */
  runCompleted: boolean;
  /** success is true when the run completed and every assertion passed. */
  success: boolean;
  metadata: EvalRunMetadata;
  assertions: EvalAssertionResult[];
  toolSequence: string[];
  error?: string;
}

/** EvalSuiteResult represents one complete eval run across multiple cases. */
export interface EvalSuiteResult {
  providerId: string;
  modelId: string;
  toolConfigId?: string;
  timestamp: string;
  success: boolean;
  results: EvalCaseResult[];
}

/** EvalAssertionPassRate summarizes how often one assertion passed across trials. */
export interface EvalAssertionPassRate {
  name: string;
  passCount: number;
  trialCount: number;
  passRate: number;
}

/** EvalCasePassRate summarizes per-case success across trials. */
export interface EvalCasePassRate {
  id: string;
  description: string;
  passCount: number;
  trialCount: number;
  passRate: number;
  assertionPassRates: EvalAssertionPassRate[];
}

/** EvalStatsResult aggregates multi-trial behavioral reliability for selected cases. */
export interface EvalStatsResult {
  providerId: string;
  modelId: string;
  toolConfigId?: string;
  timestamp: string;
  trialCount: number;
  minPassRate?: number;
  success: boolean;
  casePassRates: EvalCasePassRate[];
}

/** EvalCaseComparison summarizes one case across multiple tool configs. */
export interface EvalCaseComparison {
  id: string;
  description: string;
  passRatesByToolConfig: Record<string, EvalCasePassRate>;
}

/** EvalCompareResult stores side-by-side statistics for tool config experiments. */
export interface EvalCompareResult {
  providerId: string;
  modelId: string;
  timestamp: string;
  trialCount: number;
  minPassRate?: number;
  baselineToolConfigId: string;
  toolConfigIds: string[];
  statsResults: EvalStatsResult[];
  caseComparisons: EvalCaseComparison[];
}
