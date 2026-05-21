import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import {
  buildJournalManifest,
  getJournalDirectory,
  getRepositoryRoot,
} from "../src/cli/eval-journal.ts";
import type { EvalCaseDefinition, EvalSuiteResult } from "../src/types.ts";

const goldenProviderMarker = ".google.";

/** parseGoldenFileName extracts case, provider, and model ids from a golden filename. */
function parseGoldenFileName(
  fileName: string,
): { caseId: string; providerId: string; modelId: string } {
  if (!fileName.endsWith(".json")) {
    throw new Error(`Unrecognized golden filename: ${fileName}`);
  }

  const markerIndex = fileName.indexOf(goldenProviderMarker);
  if (markerIndex < 1) {
    throw new Error(`Unrecognized golden filename: ${fileName}`);
  }

  const caseId = fileName.slice(0, markerIndex);
  const modelId = fileName.slice(
    markerIndex + goldenProviderMarker.length,
    -".json".length,
  );

  return {
    caseId,
    providerId: "google",
    modelId,
  };
}

/** importGoldens copies committed goldens into an inaugural journal/{entryId}/ folder. */
async function importGoldens(): Promise<void> {
  const repositoryRoot = getRepositoryRoot();
  const goldensDirectory = join(repositoryRoot, "goldens");
  const journalDirectory = getJournalDirectory();
  const importDate = new Date().toISOString().slice(0, 10);
  const entryId = `import-goldens-${importDate}T000000Z`;
  const entryDirectory = join(journalDirectory, entryId);

  const goldenEntries: Array<{
    caseId: string;
    providerId: string;
    modelId: string;
    body: string;
  }> = [];

  for await (const entry of Deno.readDir(goldensDirectory)) {
    if (!entry.isFile || !entry.name.endsWith(".json")) {
      continue;
    }

    const parsedName = parseGoldenFileName(entry.name);
    const body = await Deno.readTextFile(join(goldensDirectory, entry.name));
    goldenEntries.push({
      caseId: parsedName.caseId,
      providerId: parsedName.providerId,
      modelId: parsedName.modelId,
      body,
    });
  }

  if (goldenEntries.length === 0) {
    throw new Error(`No golden JSON files found in ${goldensDirectory}`);
  }

  const providerId = goldenEntries[0].providerId;
  const modelId = goldenEntries[0].modelId;
  const mismatchedProvider = goldenEntries.find((entry) =>
    entry.providerId !== providerId || entry.modelId !== modelId
  );
  if (mismatchedProvider) {
    throw new Error(
      "Goldens import requires a single provider/model pair across all files.",
    );
  }

  const caseIds = goldenEntries.map((entry) => entry.caseId).sort();
  const selectedCases: EvalCaseDefinition[] = caseIds.map((caseId) => ({
    id: caseId,
    description: caseId,
    prompt: "",
  }));

  const suiteResult: EvalSuiteResult = {
    providerId,
    modelId,
    timestamp: `${importDate}T00:00:00.000Z`,
    success: goldenEntries.every((entry) => {
      const parsed = JSON.parse(entry.body) as { success?: boolean };
      return parsed.success === true;
    }),
    results: [],
  };

  await ensureDir(entryDirectory);

  const manifest = buildJournalManifest(suiteResult, selectedCases, {
    trialCount: 1,
    importedFrom: "goldens/",
  });
  await Deno.writeTextFile(
    join(entryDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  for (const entry of goldenEntries) {
    await Deno.writeTextFile(
      join(entryDirectory, `${entry.caseId}.json`),
      entry.body.endsWith("\n") ? entry.body : `${entry.body}\n`,
    );
  }

  console.log(`Imported ${goldenEntries.length} cases to ${entryDirectory}`);
}

if (import.meta.main) {
  await importGoldens();
}
