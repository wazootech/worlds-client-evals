import { expect, test } from "bun:test";
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
