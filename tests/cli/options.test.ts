import { expect, test } from "bun:test";
import { criticalPathCaseIds } from "@/cases/critical-path.ts";
import { evalCases } from "@/cases/index.ts";
import { parseCliOptions, selectEvalCases } from "@/cli/run.ts";

test("parseCliOptions rejects removed golden flags", () => {
  expect(() => parseCliOptions(["--check-goldens"])).toThrow(
    "Unsupported argument",
  );
  expect(() => parseCliOptions(["--update-goldens"])).toThrow(
    "Unsupported argument",
  );
});

test("parseCliOptions compiles filter regex from raw string", () => {
  const cliOptions = parseCliOptions(["--filter", "happy-path"]);
  const selectedEvalCases = selectEvalCases(evalCases, cliOptions);

  expect(selectedEvalCases.length).toBe(1);
  expect(selectedEvalCases[0]?.id).toBe("happy-path-search-then-sparql");
});

test("parseCliOptions reads tool config and compare flags", () => {
  const cliOptions = parseCliOptions([
    "--tool-config",
    "baseline",
    "--compare",
    "baseline,strict-eval",
  ]);

  expect(cliOptions.toolConfigId).toBe("baseline");
  expect(cliOptions.compareToolConfigIds).toEqual(["baseline", "strict-eval"]);
});

test("parseCliOptions rejects duplicate compare ids", () => {
  expect(() => parseCliOptions(["--compare", "baseline,baseline"])).toThrow(
    "must be unique",
  );
});

test("parseCliOptions reads compare-models flag", () => {
  const cliOptions = parseCliOptions([
    "--compare-models",
    "gemini-3.1-flash-lite,gemini-3.1-pro",
  ]);

  expect(cliOptions.compareModelIds).toEqual([
    "gemini-3.1-flash-lite",
    "gemini-3.1-pro",
  ]);
});

test("parseCliOptions reads replay flag", () => {
  const cliOptions = parseCliOptions(["--replay", "results/latest.json"]);
  expect(cliOptions.replayPath).toBe("results/latest.json");
});

test("parseCliOptions rejects compare and compare-models together", () => {
  expect(() =>
    parseCliOptions([
      "--compare",
      "baseline,strict-eval",
      "--compare-models",
      "gemini-a,gemini-b",
    ]),
  ).toThrow("not both");
});

test("parseCliOptions critical-path filter selects ship-gate cases", () => {
  const cliOptions = parseCliOptions(["--critical-path"]);
  const selectedEvalCases = selectEvalCases(evalCases, cliOptions);

  expect(selectedEvalCases.map((evalCase) => evalCase.id).toSorted()).toEqual(
    [...criticalPathCaseIds].toSorted(),
  );
});
