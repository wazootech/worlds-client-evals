import { expect, test } from "bun:test";
import { buildTrajectory } from "@/runner/build-trajectory.ts";

test("buildTrajectory pairs tool results by toolCallId", () => {
  const trajectory = buildTrajectory([
    {
      toolCalls: [
        {
          toolName: "searchWorld",
          input: { query: "q7Xm9pRw" },
          toolCallId: "call-search",
        },
        {
          toolName: "executeSparql",
          input: { query: "SELECT ?house WHERE {}" },
          toolCallId: "call-sparql",
        },
      ],
      toolResults: [
        { toolCallId: "call-sparql", output: { success: true, data: null } },
        { toolCallId: "call-search", output: { success: true, results: [] } },
      ],
    },
  ]);

  expect(trajectory).toEqual([
    {
      stepIndex: 0,
      toolName: "searchWorld",
      args: { query: "q7Xm9pRw" },
      result: { success: true, results: [] },
    },
    {
      stepIndex: 0,
      toolName: "executeSparql",
      args: { query: "SELECT ?house WHERE {}" },
      result: { success: true, data: null },
    },
  ]);
});

test("buildTrajectory leaves result undefined when toolCallId is missing", () => {
  const trajectory = buildTrajectory([
    {
      toolCalls: [
        {
          toolName: "searchWorld",
          input: { query: "missing-result" },
          toolCallId: "orphan-call",
        },
      ],
      toolResults: [],
    },
  ]);

  expect(trajectory).toEqual([
    {
      stepIndex: 0,
      toolName: "searchWorld",
      args: { query: "missing-result" },
      result: undefined,
    },
  ]);
});

test("buildTrajectory flattens multiple steps in order", () => {
  const trajectory = buildTrajectory([
    {
      toolCalls: [
        {
          toolName: "searchWorld",
          input: { query: "step-0" },
          toolCallId: "step-0-call",
        },
      ],
      toolResults: [
        {
          toolCallId: "step-0-call",
          output: { step: 0 },
        },
      ],
    },
    {
      toolCalls: [
        {
          toolName: "executeSparql",
          input: { query: "SELECT ?x WHERE {}" },
          toolCallId: "step-1-call",
        },
      ],
      toolResults: [
        {
          toolCallId: "step-1-call",
          output: { step: 1 },
        },
      ],
    },
  ]);

  expect(trajectory.map((record) => record.stepIndex)).toEqual([0, 1]);
  expect(trajectory.map((record) => record.toolName)).toEqual([
    "searchWorld",
    "executeSparql",
  ]);
});
