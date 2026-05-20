# worlds-client-evals

AI agent evaluation harness for `@worlds/client`. Runs deterministic assertion
checks and live model trials against a seeded in-memory LibSQL world.

This repository is a **consumer** of the `@worlds/client` package. It tests
whether an AI agent can successfully use the client's public API (`search`,
`sparql`, `import`) through AI SDK tool adapters.

## Design direction

This stays a **targeted smoke harness**, not a general eval framework. It
verifies tool-use behavior, SPARQL handoff quality, step budgets, and read-only
guard enforcement through deterministic code checks rather than LLM judging.

## Quickstart

```bash
# Install dependencies
deno install

# Run unit tests (no API key needed)
deno task test

# Run live evals (requires GOOGLE_GENERATIVE_AI_API_KEY)
deno task evals
```

## Environment

| Variable                       |  Required  | Default                 |
| :----------------------------- | :--------: | :---------------------- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes (live) | —                       |
| `EVAL_PROVIDER_ID`             |     No     | `google`                |
| `EVAL_MODEL_ID`                |     No     | `gemini-3.1-flash-lite` |

Unit tests (`evals/*.test.ts`) do not use these variables and run without an API
key.

## Flags

| Flag                 | Description                                                                                     |
| :------------------- | :---------------------------------------------------------------------------------------------- |
| `--list`             | Print matching case ids and descriptions, then exit                                             |
| `--filter <pattern>` | Deno-test-like filter on case `id` or `description` (literal or `/regex/i`)                     |
| `--permit-no-files`  | Exit 0 when the filter matches no cases (default: error)                                        |
| `--update-goldens`   | Write blessed snapshots under `evals/goldens/` (requires `--filter`; case must pass assertions) |
| `--check-goldens`    | Compare run output to committed goldens (requires `--filter`)                                   |
| `--trials <N>`       | Run each selected case `N` times and aggregate pass rates (default `1`)                         |
| `--min-pass-rate`    | With `--trials`, require each case pass rate ≥ threshold (0–1); default requires 100%           |

## Output

- **Summary:** per-case pass/fail, step count, tool names, assertion lines
- **Artifacts:** `evals/results/latest.json` (gitignored)
- **Exit code:** `0` when all cases pass; `1` on failure

## CI

| Layer              | Command           | API key | When                   |
| :----------------- | :---------------- | :------ | :--------------------- |
| Unit tests         | `deno task ci`    | No      | Every push             |
| Live agent evals   | `deno task evals` | Yes     | Manual dispatch        |
| Scheduled baseline | `--trials 10`     | Yes     | Weekly (Mon 06:00 UTC) |

## Layout

| Path                             | Role                                           |
| :------------------------------- | :--------------------------------------------- |
| `evals/run-evals.ts`             | CLI entry, filtering, golden update/check      |
| `evals/agent-runner.ts`          | One case execution via AI SDK                  |
| `evals/tools.ts`                 | Eval-isolated tools and SPARQL read-only guard |
| `evals/assertions.ts`            | Per-case deterministic assertions              |
| `evals/test-cases.ts`            | Scenario catalog                               |
| `evals/world-fixture.ts`         | Primary fixture (work → protagonist → house)   |
| `evals/world-fixture-scholar.ts` | Scholar fixture (paper → author/venue/year)    |
| `evals/goldens/`                 | Committed provider/model snapshots             |
| `evals/results/`                 | Local run output (gitignored)                  |

Read `evals/README.md` for full policy, free-tier quota planning, and epic
status.
