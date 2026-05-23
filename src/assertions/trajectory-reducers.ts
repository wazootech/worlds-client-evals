import type { EvalCaseResult, EvalToolRecord } from "@/types.ts";
import type { ToolConfig } from "@/tool-configs/types.ts";

/** normalizeOutputText canonicalizes free-form final text before tolerant comparison. */
export function normalizeOutputText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** extractSearchSubjects collects subject IRIs from a discovery tool result. */
export function extractSearchSubjects(searchResult: unknown): string[] {
  if (
    typeof searchResult !== "object" || searchResult === null ||
    !("results" in searchResult)
  ) {
    return [];
  }

  const results = (searchResult as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return [];
  }

  const subjects: string[] = [];
  for (const hit of results) {
    if (
      typeof hit === "object" && hit !== null && "subject" in hit &&
      typeof (hit as { subject: unknown }).subject === "string"
    ) {
      subjects.push((hit as { subject: string }).subject);
    }
  }
  return subjects;
}

/** extractSearchTextLiterals collects object literal text from discovery tool hits. */
export function extractSearchTextLiterals(searchResult: unknown): string[] {
  if (
    typeof searchResult !== "object" || searchResult === null ||
    !("results" in searchResult)
  ) {
    return [];
  }

  const results = (searchResult as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return [];
  }

  const textLiterals: string[] = [];
  for (const hit of results) {
    if (
      typeof hit === "object" && hit !== null && "text" in hit &&
      typeof (hit as { text: unknown }).text === "string"
    ) {
      textLiterals.push((hit as { text: string }).text);
    }
  }
  return textLiterals;
}

/** extractSparqlBindingLiterals collects literal values from a successful executeSparql result. */
export function extractSparqlBindingLiterals(sparqlResult: unknown): string[] {
  if (typeof sparqlResult !== "object" || sparqlResult === null) {
    return [];
  }

  const toolResult = sparqlResult as { success?: boolean; data?: unknown };
  if (!toolResult.success || toolResult.data === null) {
    return [];
  }

  if (typeof toolResult.data !== "object" || toolResult.data === null) {
    return [];
  }

  const bindings = (toolResult.data as {
    results?: { bindings?: Array<Record<string, unknown>> };
  }).results?.bindings;

  if (!Array.isArray(bindings)) {
    return [];
  }

  const literals: string[] = [];
  for (const binding of bindings) {
    for (const variable of Object.values(binding)) {
      if (
        typeof variable !== "object" || variable === null ||
        !("value" in variable) || typeof variable.value !== "string"
      ) {
        continue;
      }
      const bindingValue = variable as { type?: string; value: string };
      if (!bindingValue.type || bindingValue.type === "literal") {
        literals.push(bindingValue.value);
      }
    }
  }
  return literals;
}

/** extractSparqlRejectedQuery extracts the query that triggered a SPARQL guard rejection. */
export function extractSparqlRejectedQuery(
  trajectory: EvalToolRecord[],
  queryName: string,
): string | undefined {
  const blockedStep = trajectory.find((record) =>
    record.toolName === queryName &&
    typeof record.result === "object" && record.result !== null &&
    "success" in record.result &&
    (record.result as { success: boolean }).success === false &&
    typeof record.args === "object" && record.args !== null &&
    "query" in record.args
  );
  if (!blockedStep) {
    return undefined;
  }
  return (blockedStep.args as { query?: string }).query;
}

/** collectToolOutputLiterals unions discovery text and SPARQL binding literals from a trajectory. */
export function collectToolOutputLiterals(
  trajectory: EvalToolRecord[],
  toolConfig: ToolConfig,
): string[] {
  const literalSet = new Set<string>();
  for (const record of trajectory) {
    if (record.toolName === toolConfig.discoveryName) {
      for (const textLiteral of extractSearchTextLiterals(record.result)) {
        literalSet.add(textLiteral);
      }
    }
    if (record.toolName === toolConfig.queryName) {
      for (
        const bindingLiteral of extractSparqlBindingLiterals(record.result)
      ) {
        literalSet.add(bindingLiteral);
      }
    }
  }
  return [...literalSet];
}

/** formatTrajectoryDiagnostic summarizes tool usage for assertion failure messages. */
export function formatTrajectoryDiagnostic(result: EvalCaseResult): string {
  const toolSequence = result.metadata.trajectory.map((record) =>
    record.toolName
  ).join(", ");
  return `toolSequence=[${toolSequence || "(empty)"}]`;
}
