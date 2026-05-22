import type { EvalAssertionResult, EvalCaseResult } from "../types.ts";
import {
  defaultToolConfigId,
  resolveToolConfig,
} from "../tool-configs/index.ts";
import type { ToolConfig } from "../tool-configs/types.ts";
import {
  AUTHOR_LITERAL,
  DISTRACTOR_EXPECTED_HOUSE_LITERAL,
  EXPECTED_HOUSE_LITERAL,
} from "../fixtures/primary-world.ts";
import {
  PAPER_AUTHOR_LITERAL as SCHOLAR_AUTHOR_LITERAL,
  PAPER_VENUE_LITERAL as SCHOLAR_VENUE_LITERAL,
} from "../fixtures/scholar-world.ts";
import {
  CREATURE_LABEL as HIERARCHY_CREATURE_LABEL,
  NEST_LOCATION_LITERAL as HIERARCHY_NEST_LOCATION_LITERAL,
  WYVERN_LABEL as HIERARCHY_WYVERN_LABEL,
} from "../fixtures/hierarchy-world.ts";

/** normalizeOutputText canonicalizes free-form final text before tolerant comparison. */
function normalizeOutputText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** extractSearchSubjects collects subject IRIs from a searchWorld tool result. */
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

/** extractSparqlRejectedQuery extracts the query that triggered a SPARQL guard rejection. */
function extractSparqlRejectedQuery(
  trajectory: EvalCaseResult["metadata"]["trajectory"],
): string | undefined {
  const blockedStep = trajectory.find((record) =>
    record.toolName === "executeSparql" &&
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

/** assertUsedRequiredTools verifies that both phase-one tools were called. */
function assertUsedRequiredTools(
  result: EvalCaseResult,
  toolConfig: ToolConfig,
): EvalAssertionResult {
  const toolNames = result.metadata.trajectory.map((record) => record.toolName);
  const pass = toolConfig.requiredToolNames.every((toolName) =>
    toolNames.includes(toolName)
  );
  return {
    name: "used-required-tools",
    pass,
    message: pass ? undefined : `Observed tools: ${toolNames.join(", ")}`,
  };
}

/** assertSearchBeforeSparql ensures discovery happens before graph traversal. */
function assertSearchBeforeSparql(
  result: EvalCaseResult,
  toolConfig: ToolConfig,
): EvalAssertionResult {
  const searchIndex = result.metadata.trajectory.findIndex((record) =>
    record.toolName === toolConfig.discoveryName
  );
  const sparqlIndex = result.metadata.trajectory.findIndex((record) =>
    record.toolName === toolConfig.queryName
  );
  const pass = searchIndex !== -1 && sparqlIndex !== -1 &&
    searchIndex < sparqlIndex;
  return {
    name: "search-before-sparql",
    pass,
    message: pass
      ? undefined
      : `searchIndex=${searchIndex}, sparqlIndex=${sparqlIndex}`,
  };
}

/** assertSparqlHandoffValid checks that a discovered subject URI flows into SPARQL. */
function assertSparqlHandoffValid(
  result: EvalCaseResult,
  toolConfig: ToolConfig,
): EvalAssertionResult {
  const searchStep = result.metadata.trajectory.find((record) =>
    record.toolName === toolConfig.discoveryName
  );
  const sparqlStep = result.metadata.trajectory.find((record) =>
    record.toolName === toolConfig.queryName
  );
  const discoveredSubjects = extractSearchSubjects(searchStep?.result);
  const sparqlInput = JSON.stringify(sparqlStep?.args ?? {});
  const pass = discoveredSubjects.length > 0 &&
    discoveredSubjects.some((subject) => sparqlInput.includes(subject));
  return {
    name: "sparql-handoff-valid",
    pass,
    message: pass
      ? undefined
      : discoveredSubjects.length === 0
      ? `${toolConfig.discoveryName} returned no subject URIs to hand off into ${toolConfig.queryName}`
      : `Discovered subjects not found in first ${toolConfig.queryName} args: ${
        discoveredSubjects.join(", ")
      }; SPARQL args: ${sparqlInput.slice(0, 200)}`,
  };
}

/** assertStepCountBounded verifies the agent stayed within the scenario limit. */
function assertStepCountBounded(
  result: EvalCaseResult,
  maxSteps: number,
): EvalAssertionResult {
  const pass = result.metadata.stepCount <= maxSteps;
  return {
    name: "step-count-bounded",
    pass,
    message: pass ? undefined : `Observed ${result.metadata.stepCount} steps`,
  };
}

/** assertFinalAnswerCorrect validates the seeded happy-path answer. */
function assertFinalAnswerCorrect(result: EvalCaseResult): EvalAssertionResult {
  const normalizedOutput = normalizeOutputText(result.output);
  const expectedSubstring = normalizeOutputText(EXPECTED_HOUSE_LITERAL);
  const pass = normalizedOutput.includes(expectedSubstring);
  return {
    name: "final-answer-correct",
    pass,
    message: pass
      ? undefined
      : `Expected output to contain "${EXPECTED_HOUSE_LITERAL}"; got: ${
        result.output.slice(0, 200)
      }`,
  };
}

/** assertSparqlAnswerGrounded verifies the expected house literal appears in SPARQL bindings. */
function assertSparqlAnswerGrounded(
  result: EvalCaseResult,
  toolConfig: ToolConfig,
  expectedLiteral: string = EXPECTED_HOUSE_LITERAL,
): EvalAssertionResult {
  const bindingLiterals = result.metadata.trajectory
    .filter((record) => record.toolName === toolConfig.queryName)
    .flatMap((record) => extractSparqlBindingLiterals(record.result));

  const pass = bindingLiterals.includes(expectedLiteral);
  return {
    name: "sparql-answer-grounded",
    pass,
    message: pass
      ? undefined
      : `Expected ${toolConfig.queryName} binding literal "${expectedLiteral}"; observed literals: ${
        bindingLiterals.length > 0 ? bindingLiterals.join(", ") : "(none)"
      }`,
  };
}

/** assertNotDistractorHouse verifies the final answer does not report the distractor house. */
function assertNotDistractorHouse(result: EvalCaseResult): EvalAssertionResult {
  const normalizedOutput = normalizeOutputText(result.output);
  const distractorSubstring = normalizeOutputText(
    DISTRACTOR_EXPECTED_HOUSE_LITERAL,
  );
  const pass = !normalizedOutput.includes(distractorSubstring);
  return {
    name: "not-distractor-house",
    pass,
    message: pass
      ? undefined
      : `Final answer must not contain distractor house "${DISTRACTOR_EXPECTED_HOUSE_LITERAL}"; got: ${
        result.output.slice(0, 200)
      }`,
  };
}

/** assertUpdatesBlocked verifies the update guard produced the expected error. */
function assertUpdatesBlocked(
  result: EvalCaseResult,
  toolConfig: ToolConfig,
): EvalAssertionResult {
  const blockedRecord = result.metadata.trajectory.find((record) =>
    record.toolName === toolConfig.queryName
  );
  const guardErrorSubstring = toolConfig.guardErrorSubstring ??
    "Only read-only SPARQL queries are allowed";
  const blocked = blockedRecord !== undefined &&
    JSON.stringify(blockedRecord.result ?? {}).includes(
      guardErrorSubstring,
    );
  const rejectedQuery = extractSparqlRejectedQuery(
    result.metadata.trajectory,
  );
  return {
    name: "updates-blocked",
    pass: blocked,
    message: blocked
      ? undefined
      : blockedRecord === undefined
      ? `No ${toolConfig.queryName} call was made in the trajectory`
      : `SPARQL guard did not reject the query${
        rejectedQuery ? `: "${rejectedQuery.slice(0, 120)}"` : ""
      }; observed result: ${
        JSON.stringify(blockedRecord.result ?? {}).slice(0, 200)
      }`,
  };
}

/** assertOutputExcludesLiteral verifies the final answer does not contain a forbidden literal. */
export function assertOutputExcludesLiteral(
  result: EvalCaseResult,
  forbiddenLiteral: string,
  assertionName: string,
): EvalAssertionResult {
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

/** assertSearchMissNoGroundedSuccess verifies the agent did not ground a happy-path house answer. */
function assertSearchMissNoGroundedSuccess(
  result: EvalCaseResult,
  toolConfig: ToolConfig,
): EvalAssertionResult {
  const handoffResult = assertSparqlHandoffValid(result, toolConfig);
  const answerResult = assertFinalAnswerCorrect(result);
  const pass = !handoffResult.pass || !answerResult.pass;
  return {
    name: "search-miss-no-grounded-success",
    pass,
    message: pass
      ? undefined
      : "Search miss should fail handoff or final answer, but both assertions passed",
  };
}

/** assertFinalAnswerContainsLiteral validates that the final answer includes an expected literal. */
function assertFinalAnswerContainsLiteral(
  result: EvalCaseResult,
  expectedLiteral: string,
  assertionName: string,
): EvalAssertionResult {
  const normalizedOutput = normalizeOutputText(result.output);
  const expectedSubstring = normalizeOutputText(expectedLiteral);
  const pass = normalizedOutput.includes(expectedSubstring);
  return {
    name: assertionName,
    pass,
    message: pass
      ? undefined
      : `Expected output to contain "${expectedLiteral}"; got: ${
        result.output.slice(0, 200)
      }`,
  };
}

/** applyAssertions runs the deterministic checks for one evaluation result. */
export function applyAssertions(
  result: EvalCaseResult,
  toolConfig: ToolConfig = resolveToolConfig(defaultToolConfigId),
): EvalCaseResult {
  const assertions: EvalAssertionResult[] = [];

  switch (result.id) {
    case "happy-path-search-then-sparql":
      assertions.push(assertUsedRequiredTools(result, toolConfig));
      assertions.push(assertSearchBeforeSparql(result, toolConfig));
      assertions.push(assertSparqlHandoffValid(result, toolConfig));
      assertions.push(assertStepCountBounded(result, 6));
      assertions.push(assertSparqlAnswerGrounded(result, toolConfig));
      assertions.push(assertFinalAnswerCorrect(result));
      break;
    case "sparql-updates-blocked":
      assertions.push(assertUpdatesBlocked(result, toolConfig));
      assertions.push(assertStepCountBounded(result, 5));
      break;
    case "avoid-excessive-tool-loops":
      assertions.push(assertUsedRequiredTools(result, toolConfig));
      assertions.push(assertStepCountBounded(result, 3));
      assertions.push(assertSparqlAnswerGrounded(result, toolConfig));
      assertions.push(assertFinalAnswerCorrect(result));
      break;
    case "discovery-efficient-search-then-sparql":
      assertions.push(assertUsedRequiredTools(result, toolConfig));
      assertions.push(assertSearchBeforeSparql(result, toolConfig));
      assertions.push(assertSparqlHandoffValid(result, toolConfig));
      assertions.push(assertStepCountBounded(result, 3));
      assertions.push(assertSparqlAnswerGrounded(result, toolConfig));
      assertions.push(assertFinalAnswerCorrect(result));
      break;
    case "distractor-work-disambiguation":
      assertions.push(assertUsedRequiredTools(result, toolConfig));
      assertions.push(assertSearchBeforeSparql(result, toolConfig));
      assertions.push(assertSparqlHandoffValid(result, toolConfig));
      assertions.push(assertSparqlAnswerGrounded(result, toolConfig));
      assertions.push(assertFinalAnswerCorrect(result));
      assertions.push(assertNotDistractorHouse(result));
      break;
    case "search-miss-unknown-label":
      assertions.push(
        assertOutputExcludesLiteral(
          result,
          EXPECTED_HOUSE_LITERAL,
          "does-not-invent-house",
        ),
      );
      assertions.push(assertSearchMissNoGroundedSuccess(result, toolConfig));
      assertions.push(assertStepCountBounded(result, 5));
      break;
    case "sparql-delete-blocked":
      assertions.push(assertUpdatesBlocked(result, toolConfig));
      assertions.push(assertStepCountBounded(result, 5));
      break;
    case "alternate-question-author":
      assertions.push(assertUsedRequiredTools(result, toolConfig));
      assertions.push(assertSearchBeforeSparql(result, toolConfig));
      assertions.push(assertSparqlHandoffValid(result, toolConfig));
      assertions.push(assertStepCountBounded(result, 5));
      assertions.push(
        assertFinalAnswerContainsLiteral(
          result,
          AUTHOR_LITERAL,
          "final-answer-author-correct",
        ),
      );
      break;
    case "no-tool-shortcut-resisted":
      assertions.push(assertUsedRequiredTools(result, toolConfig));
      assertions.push(assertStepCountBounded(result, 3));
      break;
    case "scholar-paper-author":
      assertions.push(assertUsedRequiredTools(result, toolConfig));
      assertions.push(assertSearchBeforeSparql(result, toolConfig));
      assertions.push(assertSparqlHandoffValid(result, toolConfig));
      assertions.push(assertStepCountBounded(result, 5));
      assertions.push(
        assertFinalAnswerContainsLiteral(
          result,
          SCHOLAR_AUTHOR_LITERAL,
          "final-answer-author-correct",
        ),
      );
      break;
    case "scholar-paper-venue":
      assertions.push(assertUsedRequiredTools(result, toolConfig));
      assertions.push(assertSearchBeforeSparql(result, toolConfig));
      assertions.push(assertSparqlHandoffValid(result, toolConfig));
      assertions.push(assertStepCountBounded(result, 5));
      assertions.push(
        assertFinalAnswerContainsLiteral(
          result,
          SCHOLAR_VENUE_LITERAL,
          "final-answer-venue-correct",
        ),
      );
      break;
    case "scholar-paper-properties":
      assertions.push(assertUsedRequiredTools(result, toolConfig));
      assertions.push(assertSearchBeforeSparql(result, toolConfig));
      assertions.push(assertStepCountBounded(result, 5));
      break;
    case "hierarchy-type-discovery":
      assertions.push(assertUsedRequiredTools(result, toolConfig));
      assertions.push(assertSearchBeforeSparql(result, toolConfig));
      assertions.push(assertSparqlHandoffValid(result, toolConfig));
      assertions.push(assertStepCountBounded(result, 5));
      assertions.push(
        assertFinalAnswerContainsLiteral(
          result,
          HIERARCHY_CREATURE_LABEL,
          "final-answer-superclass-correct",
        ),
      );
      break;
    case "hierarchy-multi-hop":
      assertions.push(assertUsedRequiredTools(result, toolConfig));
      assertions.push(assertSearchBeforeSparql(result, toolConfig));
      assertions.push(assertSparqlHandoffValid(result, toolConfig));
      assertions.push(assertStepCountBounded(result, 5));
      assertions.push(
        assertFinalAnswerContainsLiteral(
          result,
          HIERARCHY_NEST_LOCATION_LITERAL,
          "final-answer-location-correct",
        ),
      );
      assertions.push(
        assertSparqlAnswerGrounded(
          result,
          toolConfig,
          HIERARCHY_NEST_LOCATION_LITERAL,
        ),
      );
      break;
    case "hierarchy-no-join-invent":
      assertions.push(
        assertOutputExcludesLiteral(
          result,
          HIERARCHY_NEST_LOCATION_LITERAL,
          "does-not-invent-location",
        ),
      );
      assertions.push(assertSearchMissNoGroundedSuccess(result, toolConfig));
      assertions.push(assertStepCountBounded(result, 5));
      break;
    case "hierarchy-sibling-class":
      assertions.push(assertUsedRequiredTools(result, toolConfig));
      assertions.push(assertSearchBeforeSparql(result, toolConfig));
      assertions.push(assertSparqlHandoffValid(result, toolConfig));
      assertions.push(assertStepCountBounded(result, 5));
      break;
    case "hierarchy-optional-pattern":
      assertions.push(assertUsedRequiredTools(result, toolConfig));
      assertions.push(assertSearchBeforeSparql(result, toolConfig));
      assertions.push(assertSparqlHandoffValid(result, toolConfig));
      assertions.push(assertStepCountBounded(result, 5));
      break;
    default:
      assertions.push({
        name: "recognized-case-id",
        pass: false,
        message: `No assertion plan registered for case id: ${result.id}`,
      });
      break;
  }

  const success = result.success &&
    assertions.every((assertion) => assertion.pass);
  return {
    ...result,
    success,
    assertions,
    toolSequence: result.metadata.trajectory.map((record) => record.toolName),
  };
}
