/** criticalPathCaseIds lists eval cases that must pass live before shipping agent changes. */
export const criticalPathCaseIds = [
  "happy-path-search-then-sparql",
  "search-miss-unknown-label",
  "distractor-work-disambiguation",
  "sparql-updates-blocked",
  "memory-update-current-affiliation",
] as const;

/** CriticalPathCaseId names one ship-gate eval case id. */
export type CriticalPathCaseId = (typeof criticalPathCaseIds)[number];

/** buildCriticalPathFilterRegex compiles a filter that matches only critical-path case ids. */
export function buildCriticalPathFilterRegex(): RegExp {
  const escapedCaseIds = criticalPathCaseIds.map((caseId) =>
    caseId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return new RegExp(`^(${escapedCaseIds.join("|")})$`);
}
