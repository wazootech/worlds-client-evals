import { expect, test } from "bun:test";
import { runParallelTasks } from "@/runner/run-parallel-tasks.ts";

test("runParallelTasks preserves result order", async () => {
  const results = await runParallelTasks(
    [0, 1, 2, 3, 4].map((taskIndex) => async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, (4 - taskIndex) * 5);
      });
      return taskIndex;
    }),
    2,
  );

  expect(results).toEqual([0, 1, 2, 3, 4]);
});
