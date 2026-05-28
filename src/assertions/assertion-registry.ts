import type {
  AssertionSpec,
  EvalAssertionResult,
  EvalCaseResult,
} from "@/types.ts";
import type { ToolConfig } from "@/tool-configs/types.ts";
import { TRACKED_FIXTURE_LITERALS } from "@/fixtures/tracked-fixture-literals.ts";
import {
  collectToolOutputLiterals,
  extractSearchSubjects,
  extractSparqlBindingLiterals,
  extractSparqlRejectedQuery,
  formatTrajectoryDiagnostic,
  normalizeOutputText,
} from "./trajectory-reducers.ts";

/** runAssertionSpec evaluates one declarative assertion spec. */
function runAssertionSpec(
  result: EvalCaseResult,
  spec: AssertionSpec,
  toolConfig: ToolConfig,
): EvalAssertionResult {
  const diagnosticSuffix = formatTrajectoryDiagnostic(result);

  switch (spec.kind) {
    case "used-required-tools": {
      const toolNames = result.metadata.trajectory.map(
        (record) => record.toolName,
      );
      const pass = toolConfig.requiredToolNames.every((toolName) =>
        toolNames.includes(toolName),
      );
      return {
        name: spec.name,
        pass,
        message: pass
          ? undefined
          : `Observed tools: ${toolNames.join(", ")}; ${diagnosticSuffix}`,
      };
    }
    case "search-before-sparql": {
      const searchIndex = result.metadata.trajectory.findIndex(
        (record) => record.toolName === toolConfig.discoveryName,
      );
      const sparqlIndex = result.metadata.trajectory.findIndex(
        (record) => record.toolName === toolConfig.queryName,
      );
      const pass =
        searchIndex !== -1 && sparqlIndex !== -1 && searchIndex < sparqlIndex;
      return {
        name: spec.name,
        pass,
        message: pass
          ? undefined
          : `searchIndex=${searchIndex}, sparqlIndex=${sparqlIndex}; ${diagnosticSuffix}`,
      };
    }
    case "sparql-handoff-valid": {
      const searchStep = result.metadata.trajectory.find(
        (record) => record.toolName === toolConfig.discoveryName,
      );
      const sparqlStep = result.metadata.trajectory.find(
        (record) => record.toolName === toolConfig.queryName,
      );
      const discoveredSubjects = extractSearchSubjects(searchStep?.result);
      const sparqlInput = JSON.stringify(sparqlStep?.args ?? {});
      const pass =
        discoveredSubjects.length > 0 &&
        discoveredSubjects.some((subject) => sparqlInput.includes(subject));
      return {
        name: spec.name,
        pass,
        message: pass
          ? undefined
          : discoveredSubjects.length === 0
            ? `${toolConfig.discoveryName} returned no subject URIs to hand off into ${toolConfig.queryName}; ${diagnosticSuffix}`
            : `Discovered subjects not found in first ${toolConfig.queryName} args: ${discoveredSubjects.join(
                ", ",
              )}; SPARQL args: ${sparqlInput.slice(0, 200)}; ${diagnosticSuffix}`,
      };
    }
    case "step-count-bounded": {
      const pass = result.metadata.stepCount <= spec.maxSteps;
      return {
        name: spec.name,
        pass,
        message: pass
          ? undefined
          : `Observed ${result.metadata.stepCount} steps (max ${spec.maxSteps}); ${diagnosticSuffix}`,
      };
    }
    case "updates-blocked": {
      const blockedRecord = result.metadata.trajectory.find(
        (record) => record.toolName === toolConfig.queryName,
      );
      const guardErrorSubstring =
        toolConfig.guardErrorSubstring ??
        "Only read-only SPARQL queries are allowed";
      const blocked =
        blockedRecord !== undefined &&
        JSON.stringify(blockedRecord.result ?? {}).includes(
          guardErrorSubstring,
        );
      const rejectedQuery = extractSparqlRejectedQuery(
        result.metadata.trajectory,
        toolConfig.queryName,
      );
      return {
        name: spec.name,
        pass: blocked,
        message: blocked
          ? undefined
          : blockedRecord === undefined
            ? `No ${toolConfig.queryName} call was made; ${diagnosticSuffix}`
            : `SPARQL guard did not reject the query${
                rejectedQuery ? `: "${rejectedQuery.slice(0, 120)}"` : ""
              }; observed result: ${JSON.stringify(
                blockedRecord.result ?? {},
              ).slice(0, 200)}; ${diagnosticSuffix}`,
      };
    }
    case "final-answer-contains": {
      const normalizedOutput = normalizeOutputText(result.output);
      const expectedSubstring = normalizeOutputText(spec.literal);
      const pass = normalizedOutput.includes(expectedSubstring);
      return {
        name: spec.name,
        pass,
        message: pass
          ? undefined
          : `Expected output to contain "${spec.literal}"; got: ${result.output.slice(
              0,
              200,
            )}; ${diagnosticSuffix}`,
      };
    }
    case "final-answer-matches-one-of": {
      const normalizedOutput = normalizeOutputText(result.output);
      const matchedPhrase = spec.phrases.find((phrase) =>
        normalizedOutput.includes(normalizeOutputText(phrase)),
      );
      const pass = matchedPhrase !== undefined;
      return {
        name: spec.name,
        pass,
        message: pass
          ? undefined
          : `Expected output to include one of [${spec.phrases.join(", ")}]; got: ${result.output.slice(
              0,
              200,
            )}; ${diagnosticSuffix}`,
      };
    }
    case "output-excludes": {
      const normalizedOutput = normalizeOutputText(result.output);
      const forbiddenSubstring = normalizeOutputText(spec.literal);
      const pass = !normalizedOutput.includes(forbiddenSubstring);
      return {
        name: spec.name,
        pass,
        message: pass
          ? undefined
          : `Final answer must not contain "${spec.literal}"; got: ${result.output.slice(
              0,
              200,
            )}; ${diagnosticSuffix}`,
      };
    }
    case "sparql-answer-grounded": {
      const bindingLiterals = result.metadata.trajectory
        .filter((record) => record.toolName === toolConfig.queryName)
        .flatMap((record) => extractSparqlBindingLiterals(record.result));
      const pass = bindingLiterals.includes(spec.literal);
      return {
        name: spec.name,
        pass,
        message: pass
          ? undefined
          : `Expected ${toolConfig.queryName} binding literal "${spec.literal}"; observed literals: ${
              bindingLiterals.length > 0 ? bindingLiterals.join(", ") : "(none)"
            }; ${diagnosticSuffix}`,
      };
    }
    case "sparql-answer-excludes": {
      const bindingLiterals = result.metadata.trajectory
        .filter((record) => record.toolName === toolConfig.queryName)
        .flatMap((record) => extractSparqlBindingLiterals(record.result));
      const pass = !bindingLiterals.includes(spec.literal);
      return {
        name: spec.name,
        pass,
        message: pass
          ? undefined
          : `Expected ${toolConfig.queryName} bindings to exclude "${spec.literal}"; observed literals: ${bindingLiterals.join(
              ", ",
            )}; ${diagnosticSuffix}`,
      };
    }
    case "literals-subset-of-tools": {
      const allowlist = collectToolOutputLiterals(
        result.metadata.trajectory,
        toolConfig,
      );
      const normalizedOutput = normalizeOutputText(result.output);
      const offendingLiteral = TRACKED_FIXTURE_LITERALS.find((literal) => {
        const normalizedLiteral = normalizeOutputText(literal);
        return (
          normalizedOutput.includes(normalizedLiteral) &&
          !allowlist.some(
            (allowed) => normalizeOutputText(allowed) === normalizedLiteral,
          )
        );
      });
      const pass = offendingLiteral === undefined;
      const allowlistPreview =
        allowlist.length > 0 ? allowlist.slice(0, 8).join(", ") : "(none)";
      return {
        name: spec.name,
        pass,
        message: pass
          ? undefined
          : `Output cited fixture literal "${offendingLiteral}" not present in tool outputs; allowlist preview: ${allowlistPreview}; ${diagnosticSuffix}`,
      };
    }
  }
}

/** runAssertionSpecs evaluates declarative specs against one case result. */
export function runAssertionSpecs(
  result: EvalCaseResult,
  specs: AssertionSpec[],
  toolConfig: ToolConfig,
): EvalAssertionResult[] {
  return specs.map((spec) => runAssertionSpec(result, spec, toolConfig));
}
