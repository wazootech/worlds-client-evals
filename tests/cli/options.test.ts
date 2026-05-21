import { assertEquals, assertThrows } from "@std/assert";
import { join } from "@std/path";
import { evalCases } from "../../src/cases/index.ts";
import {
  buildFilterSlug,
  buildJournalEntryId,
  getJournalDirectory,
  writeJournalEntry,
} from "../../src/cli/eval-journal.ts";
import { parseCliOptions, selectEvalCases } from "../../src/cli/run.ts";
import type { EvalCaseDefinition, EvalSuiteResult } from "../../src/types.ts";

Deno.test("parseCliOptions rejects removed golden flags", () => {
  assertThrows(
    () => parseCliOptions(["--check-goldens"]),
    Error,
    "Unsupported argument",
  );
  assertThrows(
    () => parseCliOptions(["--update-goldens"]),
    Error,
    "Unsupported argument",
  );
});

Deno.test("parseCliOptions preserves raw filter alongside compiled regex", () => {
  const cliOptions = parseCliOptions(["--filter", "happy-path"]);
  const selectedEvalCases = selectEvalCases(evalCases, cliOptions);

  assertEquals(cliOptions.filterRaw, "happy-path");
  assertEquals(selectedEvalCases.length, 1);
  assertEquals(selectedEvalCases[0]?.id, "happy-path-search-then-sparql");
});

Deno.test("buildFilterSlug keeps simple case ids and hashes regex patterns", () => {
  assertEquals(
    buildFilterSlug("happy-path-search-then-sparql"),
    "happy-path-search-then-sparql",
  );
  assertEquals(buildFilterSlug("/sparql/i").startsWith("sparql"), true);
  assertEquals(buildFilterSlug("???").startsWith("hash-"), true);
});

Deno.test("buildJournalEntryId appends filter slug when a filter is provided", () => {
  const timestamp = new Date("2026-05-21T14:32:01.000Z");
  const entryId = buildJournalEntryId(timestamp, "happy-path");
  assertEquals(entryId.startsWith("20260521T143201Z-"), true);
  assertEquals(entryId.includes("-filter-happy-path"), true);
});

Deno.test("writeJournalEntry writes manifest and per-case records", async () => {
  const temporaryDirectory = await Deno.makeTempDir();
  const selectedCases: EvalCaseDefinition[] = [{
    id: "sample-case",
    description: "Sample case",
    prompt: "Sample prompt",
  }];
  const suiteResult: EvalSuiteResult = {
    providerId: "google",
    modelId: "gemini-3.1-flash-lite",
    timestamp: "2026-05-21T14:32:01.000Z",
    success: true,
    results: [{
      id: "sample-case",
      description: "Sample case",
      prompt: "Sample prompt",
      output: "sample-output",
      success: true,
      metadata: {
        providerId: "google",
        modelId: "gemini-3.1-flash-lite",
        stepCount: 1,
        finishReason: "stop",
        latencyMs: 10,
        trajectory: [],
      },
      assertions: [{ name: "sample-assertion", pass: true }],
      toolSequence: ["searchWorld"],
    }],
  };

  const entryDirectory = await writeJournalEntry(suiteResult, selectedCases, {
    filterRaw: "sample-case",
    trialCount: 1,
    entryId: "test-entry-id",
    journalDirectory: join(temporaryDirectory, "journal"),
  });

  const manifestText = await Deno.readTextFile(
    join(entryDirectory, "manifest.json"),
  );
  const manifest = JSON.parse(manifestText) as {
    filter: string | null;
    caseIds: string[];
    trialCount: number;
  };
  assertEquals(manifest.filter, "sample-case");
  assertEquals(manifest.caseIds, ["sample-case"]);
  assertEquals(manifest.trialCount, 1);

  const caseText = await Deno.readTextFile(
    join(entryDirectory, "sample-case.json"),
  );
  const caseRecord = JSON.parse(caseText) as { output: string };
  assertEquals(caseRecord.output, "sample-output");

  await Deno.remove(temporaryDirectory, { recursive: true });
});

Deno.test("getJournalDirectory resolves the repository journal folder", () => {
  assertEquals(
    getJournalDirectory().replaceAll("\\", "/").endsWith("/journal"),
    true,
  );
});
