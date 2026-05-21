import { assertEquals, assertThrows } from "@std/assert";
import { evalCases } from "../../src/cases/index.ts";
import { parseCliOptions, selectEvalCases } from "../../src/cli/run.ts";

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
