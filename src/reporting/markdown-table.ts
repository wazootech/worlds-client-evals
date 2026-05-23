/** formatPercent renders a pass rate as a one-decimal percentage. */
export function formatPercent(passRate: number): string {
  return `${(passRate * 100).toFixed(1)}%`;
}

/** formatDelta renders a pass-rate delta in percentage points. */
export function formatDelta(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${(delta * 100).toFixed(1)} pts`;
}

/** escapeTableCell protects Markdown tables from pipes and line breaks. */
export function escapeTableCell(value: unknown): string {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\r\n", "<br>")
    .replaceAll("\n", "<br>")
    .trim();
}

/** buildTable renders a GitHub-flavored Markdown table. */
export function buildTable(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.map(escapeTableCell).join(" | ")} |`;
  const separatorRow = `| ${headers.map(() => ":---").join(" | ")} |`;
  const bodyRows = rows.map((row) =>
    `| ${row.map((cell) => escapeTableCell(cell)).join(" | ")} |`
  );

  return [headerRow, separatorRow, ...bodyRows].join("\n");
}
