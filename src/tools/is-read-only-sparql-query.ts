/** isReadOnlySparqlQuery reports whether a query begins with an allowed read-only form. */
export function isReadOnlySparqlQuery(query: string): boolean {
  const normalizedQuery = query.trim().replace(/^(?:#.*\n\s*)+/, "");
  return /^(SELECT|ASK)\b/i.test(normalizedQuery);
}
