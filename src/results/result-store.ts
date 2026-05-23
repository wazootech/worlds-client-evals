import { ensureDir } from "@std/fs";
import { dirname, fromFileUrl, join } from "@std/path";
import type {
  EvalCompareResult,
  EvalStatsResult,
  EvalSuiteResult,
} from "@/types.ts";

/** resolveRepositoryRoot returns the eval harness repository root directory. */
export function resolveRepositoryRoot(): string {
  return join(dirname(fromFileUrl(import.meta.url)), "..", "..");
}

/** resolveResultsDirectory returns the default results output directory. */
export function resolveResultsDirectory(repositoryRoot?: string): string {
  return join(repositoryRoot ?? resolveRepositoryRoot(), "results");
}

/** buildResultFileName creates a stable JSON file name for result artifacts. */
export function buildResultFileName(baseName: string, suffix?: string): string {
  if (!suffix) {
    return `${baseName}.json`;
  }

  const safeSuffix = suffix.replaceAll(/[^a-zA-Z0-9_.-]/g, "-");
  return `${baseName}-${safeSuffix}.json`;
}

/** writeSuiteResult persists the latest eval suite report to disk. */
export async function writeSuiteResult(
  result: EvalSuiteResult,
  suffix?: string,
): Promise<string> {
  const resultsDirectory = resolveResultsDirectory();
  const outputPath = join(
    resultsDirectory,
    buildResultFileName("latest", suffix),
  );
  await ensureDir(resultsDirectory);
  await Deno.writeTextFile(outputPath, JSON.stringify(result, null, 2));
  return outputPath;
}

/** writeStatsResult persists aggregated multi-trial pass rates to disk. */
export async function writeStatsResult(
  result: EvalStatsResult,
  suffix?: string,
): Promise<string> {
  const resultsDirectory = resolveResultsDirectory();
  const outputPath = join(
    resultsDirectory,
    buildResultFileName("stats-latest", suffix),
  );
  await ensureDir(resultsDirectory);
  await Deno.writeTextFile(outputPath, JSON.stringify(result, null, 2));
  return outputPath;
}

/** writeCompareResult persists side-by-side tool config comparison data. */
export async function writeCompareResult(
  result: EvalCompareResult,
): Promise<string> {
  const resultsDirectory = resolveResultsDirectory();
  const outputPath = join(
    resultsDirectory,
    buildResultFileName("compare", result.toolConfigIds.join("-vs-")),
  );
  await ensureDir(resultsDirectory);
  await Deno.writeTextFile(outputPath, JSON.stringify(result, null, 2));
  return outputPath;
}

/** findNewestCompareResultPath locates the newest comparison JSON artifact. */
export async function findNewestCompareResultPath(
  resultsDirectory = resolveResultsDirectory(),
): Promise<string | undefined> {
  const configuredPath = Deno.env.get("COMPARE_RESULT_PATH");
  if (configuredPath) {
    return configuredPath;
  }

  let newestPath: string | undefined;
  let newestModifiedAt = 0;
  for await (const entry of Deno.readDir(resultsDirectory)) {
    if (
      !entry.isFile || !entry.name.startsWith("compare-") ||
      !entry.name.endsWith(".json")
    ) {
      continue;
    }

    const entryPath = join(resultsDirectory, entry.name);
    const fileInfo = await Deno.stat(entryPath);
    if (fileInfo.mtime && fileInfo.mtime.getTime() > newestModifiedAt) {
      newestModifiedAt = fileInfo.mtime.getTime();
      newestPath = entryPath;
    }
  }

  return newestPath;
}
