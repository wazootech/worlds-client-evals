import { assertEquals, assertThrows } from "@std/assert";
import { evalCases } from "../../src/cases/index.ts";
import {
  parseCliOptions,
  selectEvalCases,
} from "../../src/cli/parse-cli-options.ts";

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

Deno.test("parseCliOptions compiles filter regex from raw string", () => {
  const cliOptions = parseCliOptions(["--filter", "happy-path"]);
  const selectedEvalCases = selectEvalCases(evalCases, cliOptions);

  assertEquals(selectedEvalCases.length, 1);
  assertEquals(selectedEvalCases[0]?.id, "happy-path-search-then-sparql");
});

Deno.test("parseCliOptions reads tool config and compare flags", () => {
  const cliOptions = parseCliOptions([
    "--tool-config",
    "baseline",
    "--compare",
    "baseline,with-resolve-resource",
  ]);

  assertEquals(cliOptions.toolConfigId, "baseline");
  assertEquals(cliOptions.compareToolConfigIds, [
    "baseline",
    "with-resolve-resource",
  ]);
});

Deno.test("parseCliOptions rejects duplicate compare ids", () => {
  assertThrows(
    () => parseCliOptions(["--compare", "baseline,baseline"]),
    Error,
    "must be unique",
  );
});
