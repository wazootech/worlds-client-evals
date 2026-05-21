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

Unit tests (`tests/**/*.test.ts`) do not use these variables and run without an
API key.

## Flags

| Flag                 | Description                                                                           |
| :------------------- | :------------------------------------------------------------------------------------ |
| `--list`             | Print matching case ids and descriptions, then exit                                   |
| `--filter <pattern>` | Deno-test-like filter on case `id` or `description` (literal or `/regex/i`)           |
| `--permit-no-files`  | Exit 0 when the filter matches no cases (default: error)                              |
| `--trials <N>`       | Run each selected case `N` times and aggregate pass rates (default `1`)               |
| `--min-pass-rate`    | With `--trials`, require each case pass rate ≥ threshold (0–1); default requires 100% |

## Output

- **Summary:** per-case pass/fail, step count, tool names, assertion lines
- **Local scratch:** `results/latest.json` (gitignored)
- **Committed journal:** `journal/{entryId}/manifest.json` plus
  `journal/{entryId}/{caseId}.json` (written on every live eval, pass or fail)
- **Exit code:** `0` when all cases pass; `1` on failure; `2` on fatal API abort
  (no journal entry written)

## CI

| Layer              | Command           | API key | When                                                                                                          |
| :----------------- | :---------------- | :------ | :------------------------------------------------------------------------------------------------------------ |
| Unit tests         | `deno task ci`    | No      | Every push                                                                                                    |
| Live agent evals   | `deno task evals` | Yes     | Manual dispatch                                                                                               |
| Scheduled baseline | `--trials 10`     | Yes     | Weekly (Mon 06:00 UTC), skipped if no harness commits in 7 days; opens a labeled PR with `journal/{entryId}/` |
| Manual dispatch    | configurable      | Yes     | Same journal PR flow as the scheduled baseline                                                                |

## Layout

| Path                            | Role                                           |
| :------------------------------ | :--------------------------------------------- |
| `src/cli/run.ts`                | CLI entry, filtering, suite execution          |
| `src/cli/eval-journal.ts`       | Journal persistence under `journal/`           |
| `src/runner/`                   | Agent execution, system prompt, trajectory     |
| `src/tools/`                    | Eval-isolated tools and SPARQL read-only guard |
| `src/assertions/`               | Per-case deterministic assertions              |
| `src/cases/`                    | Scenario catalog                               |
| `src/fixtures/primary-world.ts` | Primary fixture (work -> protagonist -> house) |
| `src/fixtures/scholar-world.ts` | Scholar fixture (paper -> author/venue/year)   |
| `tests/`                        | Deterministic unit tests                       |
| `journal/`                      | Committed eval journal                         |
| `results/`                      | Local run output (gitignored)                  |

## Journal pull requests from CI

The [Agent evals](.github/workflows/evals.yml) workflow writes
`journal/{entryId}/` on every credentialed run (pass or fail), then opens a pull
request on branch `journal/{entryId}` with the `journal` label. The workflow job
may still fail when assertions or pass-rate gates fail; the PR is the trajectory
record for review.

One-time repository setup: under **Settings → Actions → General → Workflow
permissions**, enable **Allow GitHub Actions to create and approve pull
requests**. Without this, the workflow can push the journal branch but cannot
open the PR. Org admins can enable the same setting with the GitHub API
(requires `admin:repo_hook` or repo admin access):

```bash
echo '{"default_workflow_permissions":"write","can_approve_pull_request_reviews":true}' \
  | gh api --method PUT "repos/OWNER/REPO/actions/permissions/workflow" --input -
```

## Evaluation Policy

- Deterministic assertions are the pass/fail gate. Prefer code checks over LLM
  judging for tool use, SPARQL handoff, grounding, guard behavior, and step
  budgets.
- Journal entries under `journal/` are review and history artifacts, not the
  primary correctness signal. Each live eval appends a new `journal/{entryId}/`
  folder.
- Incomplete, rate-limited, or credential-skipped live runs are operational
  signals only; do not cite them as benchmark evidence.
- Add real dogfooding failures back into `src/cases/` and `src/assertions/` so
  important regressions stay caught.
