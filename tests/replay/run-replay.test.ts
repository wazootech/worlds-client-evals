import { expect, test } from "bun:test";
import { join } from "node:path";
import { replayEvalCase, runReplayFile } from "@/replay/run-replay.ts";
import type { EvalReplayDocument } from "@/types.ts";

test("replayEvalCase applies assertions without calling Gemini", () => {
  const replayDocument: EvalReplayDocument = {
    caseId: "search-miss-unknown-label",
    toolConfigId: "baseline",
    output: "No matching work was found in the graph.",
    runCompleted: true,
    trajectory: [
      {
        stepIndex: 0,
        toolName: "searchWorld",
        args: { query: "z9Qk4WnP" },
        result: { success: true, results: [] },
      },
    ],
  };

  const replayResult = replayEvalCase(replayDocument);
  expect(replayResult.success).toBe(true);
  expect(
    replayResult.assertions.find(
      (assertion) => assertion.name === "states-not-found",
    )?.pass,
  ).toBe(true);
});

test("runReplayFile loads committed replay documents", async () => {
  const replayPath = join(
    import.meta.dir,
    "..",
    "..",
    "replays",
    "search-miss-unknown-label.replay.json",
  );
  const replaySuiteResult = await runReplayFile(replayPath);
  expect(replaySuiteResult.success).toBe(true);
  expect(replaySuiteResult.results).toHaveLength(1);
});
