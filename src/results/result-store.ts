import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  EvalCompareResult,
  EvalModelCompareResult,
  EvalStatsResult,
  EvalSuiteResult,
} from "@/types.ts";

/** resolveRepositoryRoot returns the eval harness repository root directory. */
export function resolveRepositoryRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
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
  await mkdir(resultsDirectory, { recursive: true });
  await writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
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
  await mkdir(resultsDirectory, { recursive: true });
  await writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
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
  await mkdir(resultsDirectory, { recursive: true });
  await writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
  return outputPath;
}

/** writeModelCompareResult persists side-by-side model comparison data. */
export async function writeModelCompareResult(
  result: EvalModelCompareResult,
): Promise<string> {
  const resultsDirectory = resolveResultsDirectory();
  const outputPath = join(
    resultsDirectory,
    buildResultFileName("compare-models", result.modelIds.join("-vs-")),
  );
  await mkdir(resultsDirectory, { recursive: true });
  await writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
  return outputPath;
}

/** findNewestCompareResultPath locates the newest comparison JSON artifact. */
export async function findNewestCompareResultPath(
  resultsDirectory = resolveResultsDirectory(),
): Promise<string | undefined> {
  const configuredPath = process.env.COMPARE_RESULT_PATH;
  if (configuredPath) {
    return configuredPath;
  }

  let newestPath: string | undefined;
  let newestModifiedAt = 0;
  for (const entryName of await readdir(resultsDirectory)) {
    if (!entryName.startsWith("compare-") || !entryName.endsWith(".json")) {
      continue;
    }

    const entryPath = join(resultsDirectory, entryName);
    const fileInfo = await stat(entryPath);
    if (fileInfo.mtime && fileInfo.mtime.getTime() > newestModifiedAt) {
      newestModifiedAt = fileInfo.mtime.getTime();
      newestPath = entryPath;
    }
  }

  return newestPath;
}
