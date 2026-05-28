import { expect, test } from "bun:test";
import {
  buildCriticalPathFilterRegex,
  criticalPathCaseIds,
} from "@/cases/critical-path.ts";
import { evalCases } from "@/cases/index.ts";

test("criticalPathCaseIds resolve to catalog entries", () => {
  for (const caseId of criticalPathCaseIds) {
    expect(evalCases.some((evalCase) => evalCase.id === caseId)).toBe(true);
  }
});

test("buildCriticalPathFilterRegex matches only critical-path ids", () => {
  const criticalPathFilter = buildCriticalPathFilterRegex();
  const matchedIds = evalCases
    .filter((evalCase) => criticalPathFilter.test(evalCase.id))
    .map((evalCase) => evalCase.id);

  expect(matchedIds.toSorted()).toEqual([...criticalPathCaseIds].toSorted());
});
