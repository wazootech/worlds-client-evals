# AI agent coding guidelines

This document serves as the authoritative behavioral and stylistic manual for
all AI Agents writing code in this repository.

## Domain model and core glossary

This glossary standardizes the core vocabulary used across the eval harness and
its interaction with `@worlds/client`:

### Seeded world

An in-memory LibSQL-backed graph populated with deterministic RDF fixture data
for eval execution. Each eval case receives a fresh seeded world instance.

### Fixture

A seeded world factory that produces a `Client` with a known RDF graph. The
primary fixture contains work, protagonist, and house entities. The scholar
fixture contains paper, author, venue, and year entities.

### Eval case

A single evaluation scenario defined by an id, description, prompt, and maximum
step budget. Cases exercise specific agent behaviors like search-then-SPARQL
handoff, SPARQL guard enforcement, or distractor disambiguation.

### Assertion

A deterministic code-level check applied to an eval result. Assertions verify
tool usage order, SPARQL grounding, step budgets, guard behavior, and final
answer correctness.

### Tool sequence

The ordered list of tool calls made by the agent during an eval case. The
expected pattern is `searchWorld` followed by `executeSparql`.

## Agent evals CI and artifacts

The [Agent evals](.github/workflows/evals.yml) workflow is the credentialed
baseline runner. After each live run it uploads `results/*.json` as a workflow
artifact and publishes a best-effort GitHub Discussion in the `Eval reports`
category when that category exists. Generated trajectories are not committed to
this repository.

The workflow job may exit non-zero when assertions or pass-rate gates fail even
though the results artifact was uploaded. Treat assertion results as the health
signal; artifacts are trajectory evidence only.

Repository prerequisite: GitHub Discussions must be enabled with a dedicated
category named `Eval reports`. If the category is missing, artifact upload still
works and discussion publication is skipped with a warning.

## Declarative clarity and naming conventions

To preserve maximum maintenance legibility, prioritize expressive semantics over
mathematical brevity.

- **Zero cryptic abbreviations:** Never utilize ambiguous or single-syllable
  variable shorthand. Always expand abstractions into their descriptive
  counterparts.
  - Avoid: `rs`, `res`, `req`, `cnt`, `q`, `err`
  - Prefer: `resultSet`, `response`, `request`, `count`, `query`, `error`
  - **Conflict avoidance:** Evade naming collisions via intuitive descriptive
    prefixes or suffixes (e.g., `storedCount`, `processedQuad`).

- **Direct file-symbol alignment:** The name of source files must strictly match
  the dominant exported symbol using lowercase kebab-case identifiers.
  - Example: `EvalCaseResult` MUST live in `eval-case-result.ts` or be grouped
    in a domain module like `types.ts`.

- **Deterministic prefixes:** Use active verb modifiers when establishing
  asynchronous action boundaries (e.g., `fetchData`, `persistState`).

- **Explicit JSDoc semantics:** JSDoc comments for all structural symbols
  (functions, interfaces, properties, methods) MUST begin directly with the
  symbol's exact name and form a complete, descriptive sentence.
  - Good:
    `/** EvalCaseResult stores the output and assertion results for one scenario. */`
  - Bad: `/** The result of running an eval. */`
  - Corrected:
    `/** EvalCaseResult stores the output and assertion results for one scenario. */`

## Documentation aesthetics and markdown conventions

To ensure visual continuity and ease of navigation across all repository
documentation files:

- **Uniform sentence-case headings:** All markdown headings must be clear,
  concise, and exclusively use sentence casing. Do not use decorative emojis in
  any markdown headings.
  - Avoid: `## Quick Capabilities`, `### Available Examples`
  - Prefer: `## Key capabilities`, `### Available examples`
- **Non-numbered structural boundaries:** Do not include numeric prefixes in
  markdown headings. Let the physical document outline establish hierarchy
  naturally.
  - Avoid: `### 4. AI SDK agent (Gemini + tools)`
  - Prefer: `### AI SDK agent`
- **Suppression of horizontal rules:** Avoid utilizing `---` divider lines to
  segment documents. Let empty lines establish boundaries cleanly.

## Development constraints and CI hygiene

To maintain a healthy local development lifecycle and ensure perfect
green-passing integration pipeline runs:

- **Unix line endings (LF) enforcement:** All files in the repository MUST use
  standard Unix line endings (`LF` / `\n`). The use of Windows line endings
  (`CRLF` / `\r\n`) is strictly prohibited. You MUST run `deno fmt` before
  staging any changes to auto-format text line endings and keep the CI formatter
  checks green.

- **Mandatory execution flags:**
  - **Unstable KV:** Any execution task or test interacting with Deno KV must be
    executed with the `--unstable-kv` flag.
  - **Environment variables:** Any execution task requiring remote endpoints or
    API tokens must be executed with the `--env` flag to cleanly load `.env`
    variables into the process.

- **Vendored jsonld-context-parser workaround:** Comunica's upstream
  `jsonld-context-parser` has a known JSR compatibility issue. A patched copy
  lives in `vendor/jsonld-context-parser/`, redirected via
  `"links": ["./vendor/jsonld-context-parser"]` in `deno.json`. This redirect is
  local-only — JSR strips `links` and `exclude` during packaging. If you hit
  `jsonld-context-parser` resolution errors in the local test suite, ensure the
  vendor directory and `links` config are intact.

- **Test-driven execution boundaries:** Always run local tests with
  `deno task ci` or `deno test --allow-all --unstable-kv` to verify that all
  code compiles, formats, and passes operational invariants without errors prior
  to opening pull requests.

- **Live eval quota awareness:** The eval harness calls the Google Gemini API.
  Free-tier quotas are limited (500 RPD, 15 RPM). Use `--filter <case>` for
  local debugging to avoid spending full-suite quota. Treat rate-limited runs as
  operational signals only, not benchmark evidence.
