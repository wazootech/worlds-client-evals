# worlds-client-evals

> [!IMPORTANT]
> **Archived — read-only.** This repository is archived and no longer
> maintained, and its issue/PR trackers are locked. Agent evaluation and memory
> benchmarking now lives in the Wazoo organization — see
> [github.com/wazootech](https://github.com/wazootech), in particular
> [wazoo-memorybench](https://github.com/wazootech/wazoo-memorybench), for our
> most up-to-date eval efforts.

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
# Install dependencies (Bun runs npm lifecycle scripts for @worlds/client TensorFlow hooks)
bun install

# Run unit tests (no API key needed)
bun run test

# Run live evals (requires GOOGLE_GENERATIVE_AI_API_KEY in .env)
bun run evals

# Smoke one case after assertion changes
bun run evals --filter search-miss-unknown-label
```

Node.js users can run the CLI with `bunx tsx src/cli/run.ts` (requires a local
`.env` or exported environment variables).

## Environment

| Variable                       |  Required  | Default                 |
| :----------------------------- | :--------: | :---------------------- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes (live) | —                       |
| `EVAL_PROVIDER_ID`             |     No     | `google`                |
| `EVAL_MODEL_ID`                |     No     | `gemini-3.1-flash-lite` |

Unit tests (`tests/**/*.test.ts`) do not use these variables and run without an
API key.

## Flags

| Flag                 | Description                                                                           |
| :------------------- | :------------------------------------------------------------------------------------ |
| `--list`             | Print matching case ids and descriptions, then exit                                   |
| `--filter <pattern>` | Test-runner-like filter on case `id` or `description` (literal or `/regex/i`)           |
| `--permit-no-files`  | Exit 0 when the filter matches no cases (default: error)                              |
| `--trials <N>`       | Run each selected case `N` times and aggregate pass rates (default `1`)               |
| `--min-pass-rate`    | With `--trials`, require each case pass rate ≥ threshold (0–1); default requires 100% |
| `--tool-config <id>` | Run with a named tool configuration (default `baseline`)                              |
| `--compare <a,b>`    | Run the same selected cases against multiple tool configs and write a diff artifact   |

## Output

- **Summary:** per-case pass/fail, step count, tool names, assertion lines
- **Local scratch:** `results/latest.json`, `results/stats-latest.json`, and
  `results/compare-*.json` (gitignored)
- **Exit code:** `0` when all cases pass; `1` on failure; `2` on fatal API abort
  before a full result is available

## CI

| Layer              | Command          | API key | When                                                                                                             |
| :----------------- | :--------------- | :------ | :--------------------------------------------------------------------------------------------------------------- |
| Unit tests         | `bun run ci`     | No      | Every push and pull request (GitHub `CI` workflow)                                                               |
| Live agent evals   | `bun run evals`  | Yes     | Local dev; GitHub `Agent evals` workflow (manual dispatch)                                                       |
| Scheduled baseline | `--trials 10`     | Yes     | Weekly (Mon 06:00 UTC), skipped if no harness commits in 7 days; uploads `results/*.json` as a workflow artifact |
| Manual dispatch    | configurable      | Yes     | Same workflow artifact flow as the scheduled baseline                                                            |

## Layout

| Path                                    | Role                                             |
| :-------------------------------------- | :----------------------------------------------- |
| `src/cli/run.ts`                        | CLI entry, filtering, suite execution            |
| `src/runner/`                           | Agent execution, system prompt, trajectory       |
| `src/tool-configs/`                     | Named tool-set registry for tool iteration       |
| `src/tools/`                            | Eval-isolated tools and SPARQL read-only guard   |
| `src/assertions/assertion-registry.ts`  | Composable assertion kinds (`runAssertionSpecs`) |
| `src/assertions/trajectory-reducers.ts` | Shared trajectory extractors and diagnostics     |
| `src/cases/index.ts`                    | Eval case catalog (prompts + assertion specs)    |
| `src/cases/test-fixtures.ts`            | Golden trajectories and outputs for case tests   |
| `src/fixtures/index.ts`                 | Seeded world fixture registry                    |
| `src/runner/run-eval-suite.ts`          | Suite orchestration, stats, and compare assembly |
| `src/results/result-store.ts`           | Result artifact paths and JSON persistence       |
| `src/reporting/markdown-table.ts`       | Shared Markdown table helpers for CI reports     |
| `src/fixtures/primary-world.ts`         | Primary fixture (work -> protagonist -> house)   |
| `src/fixtures/scholar-world.ts`         | Scholar fixture (paper -> author/venue/year)     |
| `tests/`                                | Deterministic unit tests                         |
| `results/`                              | Local run output (gitignored)                    |

## Eval artifacts from CI

The [Agent evals](.github/workflows/evals.yml) workflow uploads `results/*.json`
as a workflow artifact for each credentialed run. Generated trajectories are not
committed and do not open pull requests. The workflow also publishes a
best-effort GitHub Discussion in the `Evals` category with links to the workflow
run and artifact.

Repository setup: enable GitHub Discussions and create a dedicated category
named `Evals`. If the category is missing, CI still uploads artifacts and skips
discussion publication with a warning.

## Evaluation policy

- Full eval-driven iteration loop: [AGENTS.md — Eval iteration](AGENTS.md#eval-iteration).
- Deterministic assertions are the pass/fail gate. Prefer proofs (SPARQL guard,
  tool descriptions, `@worlds/client` invariants) over new eval code; when tests
  are needed, add a registry `kind` once and wire cases in `src/cases/index.ts`.
  See [AGENTS.md](AGENTS.md) for the full proof-vs-test policy.
- Generated trajectories are external artifacts, not source-controlled history.
- Incomplete, rate-limited, or credential-skipped live runs are operational
  signals only; do not cite them as benchmark evidence.
- Add dogfooding failures by reusing an existing assertion `kind` on a new or
  existing case; extend the registry only when no composable kind fits.

## Tool configuration iteration

The default `baseline` tool config maps the discovery role to `searchWorld` and
the query role to `executeSparql`. Case prompts use semantic placeholders such
as `{{discovery}}` and `{{query}}`, so new tool configs can swap tool names
without rewriting the scenario catalog.

To test one config:

```sh
bun run evals --tool-config baseline --trials 10 --min-pass-rate 0.7
```

To compare configs after registering another config in `src/tool-configs/`:

```sh
bun run evals --compare baseline,experimental --trials 10 --min-pass-rate 0.7
bun run scripts/render-compare-report.ts
```

Comparison runs write per-config outputs plus a side-by-side
`results/compare-*.json` artifact for spotting case-level regressions and
assertion-level near misses.
