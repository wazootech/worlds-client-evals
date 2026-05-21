import { ensureDir } from "@std/fs";
import { dirname, fromFileUrl, join } from "@std/path";
import type {
  EvalCaseDefinition,
  EvalCaseResult,
  EvalJournalCaseRecord,
  EvalJournalManifest,
  EvalSuiteResult,
} from "../types.ts";

const FILTER_SLUG_MAX_LENGTH = 48;

/** getRepositoryRoot resolves the eval harness repository root directory. */
export function getRepositoryRoot(): string {
  return join(dirname(fromFileUrl(import.meta.url)), "..", "..");
}

/** getJournalDirectory resolves the committed eval journal directory. */
export function getJournalDirectory(): string {
  return join(getRepositoryRoot(), "journal");
}

/** sanitizeJournalCaseRecord drops volatile metadata before journal storage. */
export function sanitizeJournalCaseRecord(
  result: EvalCaseResult,
): EvalJournalCaseRecord {
  return {
    id: result.id,
    description: result.description,
    prompt: result.prompt,
    output: result.output,
    success: result.success,
    metadata: {
      providerId: result.metadata.providerId,
      modelId: result.metadata.modelId,
      stepCount: result.metadata.stepCount,
      finishReason: result.metadata.finishReason,
      trajectory: result.metadata.trajectory,
    },
    assertions: result.assertions,
    toolSequence: result.toolSequence,
    error: result.error,
  };
}

/** hashString computes a short deterministic hex digest for path fallbacks. */
function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").slice(0, 8);
}

/** buildFilterSlug converts a raw CLI filter into a filesystem-safe path segment. */
export function buildFilterSlug(filterRaw: string): string {
  const trimmedFilter = filterRaw.trim();
  if (trimmedFilter.length === 0) {
    return "empty";
  }

  if (
    !trimmedFilter.startsWith("/") &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trimmedFilter)
  ) {
    return trimmedFilter.slice(0, FILTER_SLUG_MAX_LENGTH);
  }

  let slug = trimmedFilter
    .replace(/^\/|\/[gimsuy]*$/g, "")
    .replace(/[^a-zA-Z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  if (slug.length === 0) {
    return `hash-${hashString(trimmedFilter)}`;
  }

  if (slug.length > FILTER_SLUG_MAX_LENGTH) {
    slug = slug.slice(0, FILTER_SLUG_MAX_LENGTH);
  }

  return slug;
}

/** formatUtcJournalTimestamp formats a Date as a compact UTC journal timestamp segment. */
export function formatUtcJournalTimestamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/** buildJournalEntrySuffix generates a short random suffix for journal entry directory names. */
export function buildJournalEntrySuffix(): string {
  return crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(
    8,
    "0",
  ).slice(0, 4);
}

/** buildJournalEntryId composes a unique journal entry directory name from a timestamp and optional filter. */
export function buildJournalEntryId(
  timestamp: Date,
  filterRaw?: string,
): string {
  const baseEntryId = `${
    formatUtcJournalTimestamp(timestamp)
  }-${buildJournalEntrySuffix()}`;
  if (!filterRaw) {
    return baseEntryId;
  }

  return `${baseEntryId}-filter-${buildFilterSlug(filterRaw)}`;
}

/** resolveGitSha returns the current git short SHA when available. */
export async function resolveGitSha(): Promise<string | undefined> {
  const command = new Deno.Command("git", {
    args: ["rev-parse", "--short", "HEAD"],
    stdout: "piped",
    stderr: "null",
  });
  const { success, stdout } = await command.output();
  if (!success) {
    return undefined;
  }

  const gitSha = new TextDecoder().decode(stdout).trim();
  return gitSha.length > 0 ? gitSha : undefined;
}

/** buildJournalManifest assembles entry-level metadata for a committed journal folder. */
export function buildJournalManifest(
  suiteResult: EvalSuiteResult,
  selectedCases: EvalCaseDefinition[],
  options: {
    filterRaw?: string;
    trialCount: number;
    gitSha?: string;
    importedFrom?: string;
  },
): EvalJournalManifest {
  const manifest: EvalJournalManifest = {
    timestamp: suiteResult.timestamp,
    filter: options.filterRaw ?? null,
    providerId: suiteResult.providerId,
    modelId: suiteResult.modelId,
    caseIds: selectedCases.map((testCase) => testCase.id),
    suiteSuccess: suiteResult.success,
    trialCount: options.trialCount,
  };

  if (options.gitSha) {
    manifest.gitSha = options.gitSha;
  }

  if (options.importedFrom) {
    manifest.importedFrom = options.importedFrom;
  }

  return manifest;
}

/** writeJournalEntry persists a journal folder under journal/{entryId}/. */
export async function writeJournalEntry(
  suiteResult: EvalSuiteResult,
  selectedCases: EvalCaseDefinition[],
  options: {
    filterRaw?: string;
    trialCount: number;
    entryId?: string;
    importedFrom?: string;
    journalDirectory?: string;
  },
): Promise<string> {
  const journalDirectory = options.journalDirectory ?? getJournalDirectory();
  const entryTimestamp = new Date(suiteResult.timestamp);
  const entryId = options.entryId ??
    buildJournalEntryId(entryTimestamp, options.filterRaw);
  const entryDirectory = join(journalDirectory, entryId);
  await ensureDir(entryDirectory);

  const gitSha = await resolveGitSha();
  const manifest = buildJournalManifest(suiteResult, selectedCases, {
    filterRaw: options.filterRaw,
    trialCount: options.trialCount,
    gitSha,
    importedFrom: options.importedFrom,
  });

  await Deno.writeTextFile(
    join(entryDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  for (const testCase of selectedCases) {
    const caseResult = suiteResult.results.find((result) =>
      result.id === testCase.id
    );
    if (!caseResult) {
      throw new Error(`Missing suite result for case id: ${testCase.id}`);
    }

    const caseRecord = sanitizeJournalCaseRecord(caseResult);
    await Deno.writeTextFile(
      join(entryDirectory, `${testCase.id}.json`),
      `${JSON.stringify(caseRecord, null, 2)}\n`,
    );
  }

  await Deno.writeTextFile(
    join(journalDirectory, ".last-entry-id"),
    `${entryId}\n`,
  );

  return entryDirectory;
}
