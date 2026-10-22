# Developer Guide

> Technical documentation for developers contributing to or extending the `klia-token-optimizer` adaptive context optimizer router.

---

## Table of Contents

- [Development Environment](#development-environment)
- [Project Layout](#project-layout)
- [Build & Run](#build--run)
- [Testing](#testing)
- [Internal Architecture](#internal-architecture)
- [Decision Flow](#decision-flow)
- [Key Modules](#key-modules)
- [Data Formats](#data-formats)
- [Configuration Reference](#configuration-reference)
- [Debugging](#debugging)
- [Adding an Optimizer](#adding-an-optimizer)
- [Adding a Task Type](#adding-a-task-type)
- [Changing the Cost Function](#changing-the-cost-function)
- [MCP Server Internals](#mcp-server-internals)
- [Code Conventions](#code-conventions)
- [Common Pitfalls](#common-pitfalls)

---

## Development Environment

### Prerequisites

- Node.js >= 22.5 (required by Context Mode)
- npm
- TypeScript 7 (installed as a dev dependency)
- Vitest 5 (installed as a dev dependency)
- uv (for Semble; auto-installed by the unified installer if missing)

### Initial setup

```bash
git clone <repo-url>
cd klia-token-optimizer
npm install
```

### Unified installer (recommended for full environment)

The unified installer `install_klia_tokens.ps1` installs the router plus the context optimizers (Semble, Context Mode, RTK, Repomix), the auto-record plugin, the system prompt, the five `/klia_*` slash commands and the `klia-healthcheck` startup plugins for OpenCode and Kilo (a popup health check runs at each editor startup, not during the install):

```powershell
.\install_klia_tokens.ps1
```

This is idempotent and generates `.bak-<phase>-<timestamp>` backups. See [instaladores/install.md](./instaladores/install.md) for full details. After running it, the project is compiled to `dist/`, the history is calibrated, and the MCP server is registered in `opencode.jsonc`.

### Required tooling

| Tool | Purpose |
| ---- | ------- |
| `tsc` | Type checking and build (`npm run build`). |
| `tsx` | Run TypeScript directly without building (`npm run router`, `npm run route`, `npm run mcp-server`). |
| `vitest` | Test runner (`npm test`). |

---

## Project Layout

```text
klia-token-optimizer/
  src/
    classifier/
      task-classifier.ts   # classifyTask, classifyContextSize, extractSignalsFromQuery
    rules/
      base-rules.ts         # BASE_RULES, candidatesForTask, defaultOptimizerForTask
    scorer/
      expected-cost-scorer.ts  # computeRecordCost, computeRelativeCost, buildCostMatrix, keyFor
      stats-report.ts           # buildStatsReport (summary, byModel, byModelTask, globalSavings), OptimizerCell, ModelRow
    selector/
      optimizer-selector.ts    # selectOptimizer, evaluateOptimizer
      exploration.ts           # selectOptimizerWithExploration (V3)
    history/
      history-store.ts         # HistoryStore interface, JsonHistoryStore, createExecutionRecord (v1)
      router-event-store.ts     # RouterEventStore (v2 unified events), createDecisionEvent, createExecutionEvent, compact
      mcp-metrics-store.ts      # McpMetricsStore (legacy usage telemetry)
      migrate.ts                # migrateV1ToV2, isMigratedToV2 (v1 -> v2 with synthetic detection)
    pricing/
      model-pricing.ts          # computeCostUsd, getPricing, ModelPricing
    autopilot/
      auto-pilot.ts             # AutoPilot (evaluate, checkAndAct), AutoPilotAction, AutoPilotOptions
    dashboard/
      web-dashboard.ts          # startWebDashboard (HTTP server, default 127.0.0.1:6283)
      stats-adapter.ts          # buildDashboardReport (report + DashboardSummary)
      benchmark-adapter.ts      # benchmark-results.json -> aggregates + calibration
    utils/
      model-family.ts          # extractModelFamily, normalizeModel, isChatModel
      cli-args.ts              # parseCliArgs (positionals, values, flags)
      json.ts                  # readJsonSync/Async, writeFileSyncAtomic, stripBom, ensureJsonFile
    scripts/
      calibrate.ts             # runCalibration + CLI entry
      migrate-history.ts       # CLI to migrate history.json -> events.json
      stats-display.ts         # runStatsCli: `router stats` professional report (8 ANSI sections)
      calibrate-display.ts     # runCalibrateCli: `router calibrate` (confidence calibration)
      compact-display.ts       # runCompactCli: `router compact` (store cleanup plan)
      autopilot-display.ts     # runAutopilotCli: `router autopilot` (maintenance actions)
      dashboard-display.ts     # runDashboardCli: `router dashboard` (--detach daemon)
      min-confidence-config.ts # resolveMinConfidence + write to global OpenCode config
      health-check.ts          # runHealthCheckCli: startup health check (popup, throttle, state)
    klia-discovery.ts          # detectKliaApiKey, discoverModels, discoverModelsFromApi, SNAPSHOT_MODELS
    index.ts                   # Public API: createAdaptiveRouter, buildContextFromQuery, buildRecord + re-exports
    cli.ts                     # `route` CLI (JSON output)
    router-cli.ts              # `router` CLI (decide / record / stats / calibrate / compact / autopilot / dashboard)
    mcp-server.ts              # MCP server (route_task, record_execution, get_router_stats, migrate_history)
    types.ts                   # Shared types + DEFAULT_ROUTER_OPTIONS + RouterEvent (v2)
  commands/                    # Slash command sources (klia_stats, klia_calibrate, klia_compact, klia_dashboard, klia_autopilot)
  plugins/                     # Thin host plugins (klia-router-inject, klia-auto-record, klia-healthcheck) per host:
    kilo/
    opencode/
    opencode/v2/               # v2 hosts read from plugins (plural); klia-badge only under kilo/tui and opencode/v2
  tests/                       # Mirror of src/, plus integration tests
  instaladores/                # Installer documentation (install.md, opencode.json)
  install_klia_tokens.ps1          # Unified installer (router + optimizers + auto-record plugin + slash commands)
  tsconfig.json                # Base config (includes tests)
  tsconfig.build.json          # Build config (src only, declarations)
  package.json
  AGENTS.md
  OPENCODE_USAGE.md
  SYSTEM_PROMPT.md
  router.md
  README.md / README_en.md
  dev.md / dev_es.md
```

### Recommended entry points

| Goal | Start here |
| ---- | ---------- |
| Understand the public API | `src/index.ts` |
| Understand task classification | `src/classifier/task-classifier.ts` |
| Understand optimizer selection | `src/selector/optimizer-selector.ts` + `src/selector/exploration.ts` |
| Understand cost scoring | `src/scorer/expected-cost-scorer.ts` |
| Understand the v2 enriched report | `src/scorer/stats-report.ts` |
| Understand the v2 event store | `src/history/router-event-store.ts` + `src/history/migrate.ts` |
| Understand store cleanup | `src/history/router-event-store.ts` (`compact`) + `src/scripts/compact-display.ts` |
| Understand auto-tuning | `src/autopilot/auto-pilot.ts` + `src/scripts/calibrate-display.ts` |
| Understand the web dashboard | `src/dashboard/web-dashboard.ts` + `src/dashboard/stats-adapter.ts` |
| Understand USD pricing | `src/pricing/model-pricing.ts` |
| Understand model discovery | `src/klia-discovery.ts` |
| Understand the MCP server | `src/mcp-server.ts` |
| Understand the CLIs | `src/router-cli.ts` (unified), `src/cli.ts` (JSON) |

---

## Build & Run

### Build

```bash
npm run build
```

Produces `dist/` with `.js` + `.d.ts` from `src/` only. Tests are excluded via `tsconfig.build.json`.

### Watch during development

There is no dedicated watch script; use `tsc --noEmit --watch` in a separate terminal for type checking while editing, and `npm run test:watch` for tests.

### Run the CLIs without building

The CLIs use `tsx`, so you can iterate without rebuilding:

```bash
npm run router -- --model glm-5.2 --query "refactoriza auth" --files 12 --size 250000
npm run route  -- --model glm-5.2 --query "refactoriza auth" --files 12 --size 200000
npm run router -- stats
```

The `router` CLI accepts a subcommand as the first positional argument:

| Subcommand | Purpose |
| ---------- | ------- |
| (none) | Decide: route a task and record the decision event. |
| `stats` | 8-section savings report from `events.json`. |
| `calibrate` | Compare declared confidence vs. actual quality; suggest `ROUTER_MIN_CONFIDENCE`; `--write` applies it. |
| `compact` | Build a cleanup plan for `events.json` (dry-run by default; `--write` applies). |
| `autopilot` | Evaluate burn/failure/store-size and return maintenance actions (no execution). |
| `dashboard` | Start the local web dashboard (default `http://127.0.0.1:6283`). |

Decision mode flags: `--model`, `--query`, `--files`, `--size`, `--history`, `--explore`, `--json`.
Recording flags: `--record-id <id> --tokens N --latency N --quality N` (v1 metrics update) or `--record-execution --model M --query Q --optimizer O --tokens N [--input-tokens --output-tokens] --latency N [--quality --cost-usd --session-id --failed --context-after --tokens-pruned --actual-tool-calls --router-latency-ms --started-at --completed-at --events --metrics]` (writes the v1 record, the v2 execution event, and the legacy MCP metric).

### Run the MCP server

```bash
npm run mcp-server
```

Listens on stdio. Logs go to stderr and to the JSON log file (default `.router-history/mcp-server.log.json`).

### Calibrate from benchmarks

```bash
npm run calibrate -- --history .router-history/benchmark.json --repetitions 3
```

This script overwrites the target history file. It ships with built-in benchmark matrices for `glm-5.2`, `deepseek-v4`, `gpt-4o`, and `claude-sonnet-4`.

> On Windows CMD use `^` to continue lines. In PowerShell use `` ` `` or a single line.

---

## Testing

### Run all tests

```bash
npm test
```

Vitest runs in `--run` mode (no watch). For watch mode:

```bash
npm run test:watch
```

### Test layout

Tests mirror `src/`:

- `tests/classifier/` - classification tests.
- `tests/rules/` - base rules tests.
- `tests/scorer/` - expected cost tests.
- `tests/selector/` - selector + exploration tests.
- `tests/history/` - history store tests.
- `tests/index.test.ts` - public API integration.
- `tests/benchmark-integration.test.ts` - end-to-end with benchmark data.
- `tests/mcp-server.test.ts`, `tests/mcp-server-stats.test.ts`, `tests/mcp-metrics.test.ts` - MCP server tests.

### Writing tests

- Use Vitest globals are not enabled; import `describe`, `it`, `expect` from `vitest`.
- Use temp directories under `tests/.tmp-*` for file-based tests. Clean up in `beforeEach`/`afterEach`.
- For deterministic exploration tests, inject a custom `random` function (see `selectOptimizerWithExploration` signature).

---

## Internal Architecture

### Components and responsibilities

```text
                  OpenCode / CLI / MCP client
                            |
                            v
                  createAdaptiveRouter()
                            |
            +---------------+---------------+
            |               |               |
            v               v               v
   classifyTask()    extractModelFamily()   (classifyContextSize:
            |               |               internal to classifyTask
            +---------------+---------------+   for LARGE_CONTEXT)
                            |
                            v
                   RuleEngine (BASE_RULES)
                   -> candidates for task
                            |
                            v
                   HistoryStore.query()       RouterEventStore.add() (v2)
                   -> records for (model, task)   -> decision/execution events
                            |
                            v
                   ExpectedCostScorer
                   -> buildCostMatrix, computeRelativeCost
                            |
                            v
                   selectOptimizer()
                   -> V0/V1/V2 decision
                            |
                            v
                   selectOptimizerWithExploration() (V3)
                   -> exploration vs exploitation
                            |
                            v
                   RouterDecision
                            |
                            v
                   (pricing: computeCostUsd when costUsd not provided)
                   (stats: buildStatsReport for get_router_stats v2)
```

### Versioning of decisions

The `version` field in `RouterDecision` indicates which strategy produced the decision:

| Version | When |
| ------- | ---- |
| `V0` | No history for `(model, task)`. Uses base rule. |
| `V1` | History exists but confidence < `minConfidence` or samples < `minSamples`. |
| `V2` | Sufficient evidence; picks the optimizer with the lowest relative cost. |
| `V3` | Exploration/exploitation layer intervened (forced fallback or controlled trial). |

### Confidence

`confidenceFromSamples(sampleCount, minSamples)`:

- 0 samples -> 0
- `>= minSamples * 2` -> 1
- otherwise -> `sampleCount / minSamples` (clamped to 1)

This is intentionally simple. Replace with a confidence interval or Bayesian posterior if you need stronger guarantees.

---

## Decision Flow

1. **Context building** (`buildContextFromQuery`): wraps `(model, signals)`. Signals are extracted from the query text via regex heuristics unless explicit signals are provided.
2. **Routing** (`router.route(ctx)`):
   - Classify the task (`classifyTask`). `classifyContextSize` is used internally by `classifyTask` to detect `LARGE_CONTEXT`; it is no longer used to force an optimizer.
   - If exploration is enabled, call `selectOptimizerWithExploration`. Otherwise, call `selectOptimizer` directly.
3. **Selection** (`selectOptimizer`):
   - Query history for `(model, taskType)`.
   - If empty -> V0, return the base rule default.
   - Otherwise build the cost matrix and pick the candidate with the lowest relative cost whose confidence >= `minConfidence`.
   - If none meets the threshold -> V1, return baseline.
4. **Exploration** (`selectOptimizerWithExploration`):
   - If `baseDecision.confidence >= minConfidence`, exploit (return base decision).
   - With probability `1 - explorationRate`, fall back to the base rule default (V3).
   - With probability `explorationRate`, pick a random unexplored candidate (not `BASELINE`, not previously tried).
5. **Recording** (`router.recordExecution(record)`): appends to the JSON history. The next routing call for the same `(model, task)` will see the new evidence.
6. **v2 event emission**: the MCP server and `router-cli.ts` additionally emit a `RouterEvent` (`decision` for `route_task`, `execution` for `record_execution`) into `events.json` via `RouterEventStore`. The v1 `history.json` stays in sync so the adaptive router keeps learning.

---

## Key Modules

### `src/classifier/task-classifier.ts`

- `classifyTask(signals, opts?)` - returns a `TaskType`.
- `classifyContextSize(signals, opts?)` - returns `'LARGE_CONTEXT'`, `'LARGE_CONTEXT_EXTREME'`, or `null`.
- `extractSignalsFromQuery(query, base?)` - heuristic extraction of `hasTerminalCommands`, `isMultistep`, `isRefactor`, `isRepositorySearch` from the query text.

Classification priority:

1. Explicit signals (`isRefactor`, `isMultistep`, `hasTerminalCommands`, `isRepositorySearch`).
2. Context size (large / extreme).
3. File count (`manyFilesThreshold`).
4. Small code check (`fileCount <= 3`, small context, low tool calls).
5. `UNKNOWN` fallback.

Threshold defaults:

- `largeContextThresholdBytes`: 1 MB
- `extremeContextThresholdBytes`: 5 MB
- `manyFilesThreshold`: 8

### `src/rules/base-rules.ts`

`BASE_RULES` maps each `TaskType` to a prioritized list of candidate optimizers. The first element is the V0 default. Override by editing this map; the scorer and history store pick up new entries automatically.

### `src/scorer/expected-cost-scorer.ts`

- `computeRecordCost(record, options)` - absolute cost of one execution.
- `computeRelativeCost(records, optimizer, options)` - relative cost vs the baseline for the same group. `Infinity` if no records; `absoluteCost / avgBaselineCost` otherwise. If no baseline records exist, the optimizer's own average is used as the denominator (so `relativeCost = 1`).
- `buildCostMatrix(records, options?)` - groups records by `model::taskType` and returns `Map<key, Map<Optimizer, CostScore>>`.
- `keyFor(model, taskType)` - returns the grouping key.

### `src/scorer/stats-report.ts`

Builds the enriched v2 report consumed by `get_router_stats` (format=v2) and `router stats`:

- `OptimizerCell` - rich cell per optimizer: `samples`, `avgTokens`, `avgInputTokens`, `avgOutputTokens`, `avgLatency`, `avgQuality`, `failureRate`, `avgAbsoluteCost`, `relativeCost`, `savingsTokens`, `savingsPercent`, `savingsUsd`, `verdict` (`AHORRO` | `PERDIDA` | `NEUTRO`), `winner`.
- `ModelTaskRow` - one row per `(model, task)`: `totalSamples`, `baseline`, `optimizers[]`, `bestOptimizer`.
- `ModelRow` - one row per model: `executions`, `avgTokens`, `avgLatency`, `avgQuality`, `failureRate`, `bestOptimizer`, `savingsVsBaselinePercent`, `savingsVsBaselineTokens`.
- `RouterStatsReport` - top-level: `summary` (`totalDecisions`, `totalExecutions`, `syntheticCount`, `realCount`, ...), `byModel`, `byModelTask`, `globalSavings` (weighted savings + literal verdict).
- `buildStatsReport(events, options?)` - the entry point. `computeEventCost` lives here (v2 equivalent of `computeRecordCost`).

### `src/selector/optimizer-selector.ts`

- `selectOptimizer(model, taskType, deps, options?, forcedDefault?)` - the core V0/V1/V2 selector with family inheritance.
- If the model has no history, it queries `queryByFamily(family, taskType)` and uses those records with reduced confidence (`familyConfidenceWeight`, default 0.5).
- Only considers optimizers that are in `BASE_RULES[taskType]` or are `BASELINE`.
- Returns alternatives sorted by relative cost.
- `evaluateOptimizer(records, optimizer, options?)` - utility for tests.

### `src/selector/exploration.ts`

- `selectOptimizerWithExploration(...)` - V3 wrapper around `selectOptimizer`.
- Returns `ExplorationResult` with `decision`, `explored` (true if exploration was triggered), and `exploitedOptimizer` (what pure exploitation would have chosen).
- Inject a `random` function for deterministic tests.

### `src/klia-discovery.ts`

Dynamic model discovery from the KLIA API.

- `detectKliaApiKey()` - detects the API key in this order:
  1. `KLIA_API_KEY` env var (must start with `key-`)
  2. `OPENAI_API_KEY` env var if it starts with `key-`
  3. `provider.klia.options.apiKey` in `opencode.jsonc` (parsed with JSONC comment stripping)
- `discoverModelsFromApi(apiKey?)` - calls `GET https://api.klia.tech/v1/models` and returns chat models (embeddings, image, moderation filtered out by `isChatModel`).
- `discoverModels(apiKey?)` - wraps `discoverModelsFromApi` with a fallback to `SNAPSHOT_MODELS` if the API fails. Returns `{ models, source: 'api' | 'snapshot', error? }`.
- `SNAPSHOT_MODELS` - static list of 26 KLIA chat models for offline fallback.

### `src/history/history-store.ts` (v1)

- `HistoryStore` interface: `add`, `list`, `query`, `queryByFamily`.
- `JsonHistoryStore` - file-based, with a Promise chain lock to serialize concurrent writes.
- `queryByFamily(family, taskType, optimizer?)` - returns records matching `modelFamily === family` and `taskType`. Used by the selector for family inheritance.
- `createExecutionRecord(...)` - builds an `ExecutionRecord` with an `id` of `${Date.now()}-${random}`.

This is the store the adaptive router reads to make decisions. Kept for compatibility even after v2.

### `src/history/router-event-store.ts` (v2)

- `RouterEventStore` - file-based store for `RouterEvent`. Promise chain lock, like `JsonHistoryStore`. Reads and writes go through `src/utils/json.ts` (`stripBom`, `writeFileSyncAtomic`) so partial writes from concurrent processes do not corrupt the file.
- `createDecisionEvent(...)` - builds a `type: 'decision'` event from a `RouterDecision`.
- `createExecutionEvent(...)` - builds a `type: 'execution'` event from the `record_execution` payload.
- `migrateFile()` - migrates the underlying file from v1 to v2 in place (used by the `migrate_history` MCP tool).
- `compact(options)` - returns a pure `planCompact`-based `CompactReport`; called by `router compact` (see below). Does not write by itself.
- On read, if v1 records are detected, they are migrated in memory (lazy migration) via `migrateV1ToV2`.

### `src/history/migrate.ts`

- `migrateV1ToV2(records, { source })` - turns a v1 `ExecutionRecord[]` into a v2 `RouterEvent[]`. Marks records as `synthetic=true` when they look like benchmark or CLI placeholder data (heuristics on the query text and metrics).
- `isMigratedToV2(events)` - type guard: returns true if the array is already in v2 schema (`schemaVersion === 2`).

### `src/history/mcp-metrics-store.ts` (legacy)

- `McpMetricsStore` - sync read/write of MCP usage metrics.
- `summary()` - returns aggregates: `totalDecisions`, `totalExecutions`, `byTaskType`, `byOptimizer`, `byModelFamily`, `avgQuality`, `failureRate`.

### `src/pricing/model-pricing.ts`

- `ModelPricing` - `{ inputPerMillion, outputPerMillion }` (USD per 1M tokens).
- `FAMILY_PRICING` - per-family defaults (glm, deepseek, kimi, qwen, mistral, ...).
- `MODEL_PRICING` - per-model overrides (e.g. `glm-5.2`, `deepseek-v4-pro`).
- `FALLBACK_PRICING` - generic fallback when neither model nor family is known.
- `getPricing(model, family?)` - resolves pricing with the priority: exact model -> family -> fallback.
- `computeCostUsd(inputTokens, outputTokens, model, family?)` - USD cost of one execution. Used by `record_execution` when `costUsd` is not provided, and by `buildStatsReport` for `savingsUsd`.

### `src/utils/model-family.ts`

- `extractModelFamily(model)` - lowercases and checks against known families: `glm`, `deepseek`, `gpt`, `claude`, `kimi`, `qwen`, `mistral`, `llama`. Falls back to the first alphabetic prefix.
- `normalizeModel(model)` - normalizes a model id for matching.
- `isChatModel(id)` - filters out embeddings, image, and moderation models from the KLIA API response.

### `src/scripts/calibrate.ts`

- `runCalibration(...)` - seeds `history.json` with `BASELINE` records for every model discovered from the KLIA API (or the static snapshot). No synthetic cost matrices.
- CLI entry: `npm run calibrate -- --history <path> --repetitions N [--models a,b] [--tasks x,y]`.

### `src/scripts/migrate-history.ts`

- Standalone CLI that migrates `.router-history/history.json` (v1) to `.router-history/events.json` (v2). Prints a summary of synthetic vs. real records. Idempotent.

### `src/scripts/stats-display.ts`

- `runStatsCli(argv)` - the `router stats` command. Prints 8 ANSI sections: header, executive summary (KPI cards), system health, model ranking, model x task heatmap, per-(model,task) detail, global savings + verdict, confidence calibration + recommendations. Flags: `--model`, `--task`, `--real-only`, `--no-color`.
- `resolveEventsPath(explicit?)` - picks the events file in this order (first existing candidate wins): explicit `--events`; `ROUTER_EVENTS_PATH`; `KLIA_STORE_DIR/events.json`; `KLIA_HOME/data/events.json`; `~/.klia/data/events.json`; legacy fallback `<cwd>/.router-history/events.json`.

### `src/scripts/calibrate-display.ts` + `src/scripts/min-confidence-config.ts`

- `runCalibrateCli(argv)` - the `router calibrate` command. Pairs decisions and executions by `sessionId` (reuses `buildStatsReport` confidence calibration) and compares declared confidence against actual quality per model:
  - overconfidence (conf > quality) -> suggests raising `minConfidence`
  - underconfidence -> suggests lowering it
  - aligned -> keep current value
- Suggested value = `clamp(current + overconfidence, 0.3, 0.95)` rounded to 0.05. Without paired data the verdict is `sin-datos`.
- Threshold resolution (explicit flag beats env beats file beats default): `--min-confidence` > `ROUTER_MIN_CONFIDENCE` env > value from the global OpenCode config > `0.6`. The file fallback exists so the recommendation converges after `--write`.
- `min-confidence-config.ts` - `resolveMinConfidence(...)` implements that chain (`KLIA_OPENCODE_CONFIG` overrides the config candidate; candidates `~/.config/opencode/opencode.json` / `opencode.jsonc`). Applying the suggested value edits the global OpenCode config with a surgical regex that preserves JSONC comments (V2 key `mcp.servers['klia-token-optimizer'].environment.ROUTER_MIN_CONFIDENCE` or V1 `mcp[...].env`), creating a `.bak-<timestamp>` backup first.

### `src/scripts/compact-display.ts`

- `runCompactCli(argv)` - the `router compact` command. Wraps `RouterEventStore.compact`:
  - TTL: events older than `DEFAULT_MAX_AGE_DAYS` (90) expire; events with a missing/invalid timestamp are treated as expired.
  - Orphan purge: decisions without a paired execution are removed after `DEFAULT_ORPHAN_GRACE_DAYS` (7); matching is by `sessionId`. Execution orphans are preserved by default because they feed cost learning; `--drop-orphan-executions` purges them.
  - Synthetic events survive the TTL unless `--purge-synthetic`.
  - Rotation: `--rotate` archives the oldest excess to `<base>.rotated-<stamp>.json`, keeping `DEFAULT_KEEP_EVENTS` (5000).
  - Default is dry-run; `--write` creates a timestamped `events.backup-*` before overwriting (atomic write).
- Exports: `CompactOptions`, `CompactStats` (`examined`, `removedExpired`, `removedOrphanDecisions`, `removedOrphanExecutions`, `kept`), `CompactReport` (adds bytes/dryRun/rotation info), `planCompact`.

### `src/autopilot/auto-pilot.ts`

- `AutoPilot` - evaluates metrics and returns suggested actions **without executing them**.
- `AutoPilotAction` types: `adjust_confidence`, `force_baseline`, `compact_store`, `alert_burn`, `retrain_classifier` (each with `reason` and `payload`).
- `AutoPilotOptions` defaults: `enabled: true`, `burnThresholdTokensPerHour: 500_000`, `failureRateThreshold: 0.4`, `maxStoreSizeBytes: 50 MB`, `cooldownMinutes: 60`.
- `evaluate(...)` and `checkAndAct(...)`: `alert_burn` when tokens in the last hour exceed the threshold; `force_baseline` when the last-hour failure rate exceeds 0.4; `compact_store` when the events file exceeds 50 MB. A cooldown prevents repeating actions; `disableUntil`/`enable` are exposed.
- State is persisted at `(KLIA_HOME ?? ~/.klia)/data/autopilot-state.json` (last 100 actions kept).
- CLI: `src/scripts/autopilot-display.ts` computes last-hour tokens/failure rate from `events.json`, calls `checkAndAct` and prints the actions (or `--json`); `--disable` / `--enable` / `--events` / `--json`.

### `src/dashboard/web-dashboard.ts`

- `startWebDashboard({ port, host, eventsPath, benchmarkPath })` - HTTP server serving the HTML dashboard. Defaults: `127.0.0.1:6283`.
- `src/dashboard/stats-adapter.ts` - `buildDashboardReport(...)`: builds the `buildStatsReport` report plus a `DashboardSummary` (`totalEvents`, `totalDecisions`, `totalExecutions`, `totalTokens`, `avgQuality`, `failureCount`, `avgLatencySeconds`, `optimizerCounts`, `generatedAt`, savings fields, `hasRealData`, `realCount`, `syntheticCount`). If there are no real executions, savings fall back to benchmark data when available.
- `src/dashboard/benchmark-adapter.ts` - parses `benchmark-results.json` rows (`taskId`, `model`, `optimizer`, `estimatedTokens`, `latencySeconds`, `quality`, `failed`, ...) and computes per-row savings vs `BASELINE` grouped by `taskId`, aggregates by optimizer and group (`BenchmarkOptimizerAggregate`, `BenchmarkGroupAggregate`), and derives `BenchmarkCalibration` (`pairsMatched`, `avgDeclaredConfidence`, `avgActualQuality`, `calibrationScore`, `verdict`, `byOptimizer[]`).
- CLI: `src/scripts/dashboard-display.ts`. Flags: `--port`, `--host`, `--events`, `--benchmark`, `--detach`, `--child`. `--detach` spawns a detached child process (log at `~/.klia/logs/dashboard.log`), prints the URL and PID, and refuses to start a duplicate if the port is in use.
- Dashboard HTML: KPI cards, optimizer distribution charts, benchmark rows (or the top-100 `model x task` cells from the report), `byModel` / `byModelTask` tables, `es-ES` number formatting, auto-refresh.

### `src/scripts/health-check.ts` + `plugins/*/klia-healthcheck.ts`

- `runHealthCheckCli(argv)` - the startup health check. Flags: `--json`, `--popup`, `--no-popup`, `--force` (skip the throttle), `--interval-hours N`, `--timeout MS`, `--help`.
- Checks (each produces a `CheckResult` with status `ok` / `warn` / `fail`):
  1. Node >= 22.5 (`MIN_NODE_VERSION`).
  2. Runtime CLI: first existing candidate among `KLIA_ROUTER_CLI_PATH`, `%LOCALAPPDATA%\klia-token-optimizer\dist\router-cli.js` and `KLIA_PROJECT_ROOT/dist/router-cli.js` (`resolveRuntimeCli`).
  3. Events store: write-probe next to the first existing events candidate (`resolveEventsCandidates`: `ROUTER_EVENTS_PATH`, `KLIA_STORE_DIR`, `KLIA_HOME/data`, `~/.klia/data`, legacy `<cwd>/.router-history`).
  4. MCP registry: `repomix` and `semble` entries looked up (BOM-strip + line-comment strip) in the OpenCode / Kilo config files.
  5. Binaries: `rtk`, `repomix` and `semble` respond to `--version` (timeout `DEFAULT_BIN_TIMEOUT_MS`, 10 s).
  6. Plugin files: `klia-router-inject.ts`, `klia-auto-record.ts` and `klia-healthcheck.ts` present in the Kilo / OpenCode v1 / v2 (and AppData) plugin directories.
- Pure helpers exported for tests: `severityOf`, `summarize`, `parsePopupPolicy`, `decidePopup`, `formatPopupMessage`, `stripJsonComments`, `hasMcpEntry`.
- State: `HealthState` in `resolveStatePath` (default `~/.klia/data/health-state.json`), written atomically. A full check runs once per `DEFAULT_INTERVAL_HOURS` (24; `KLIA_HEALTH_HOURS`); cached runs report from state and do not pop.
- Popup: `showSystemPopup` runs `WScript.Shell.Popup` through a detached PowerShell child (UTF-8 message passed base64-encoded; auto-close `DEFAULT_POPUP_TIMEOUT_SECONDS`, 10 s). Policy env `KLIA_HEALTH_POPUP`: `always` (default) / `fail-only` / `off`; exit code 1 only when the status is `fail`.
- The thin plugins (`plugins/kilo|opencode|opencode/v2/klia-healthcheck.ts`, one per host API) resolve `dist/scripts/health-check.js` next to `router-cli.js` and spawn it detached with `--popup` on host startup. If the script is missing they pop up an "incomplete installation" warning and never throw; debug log at `~/.klia/logs/healthcheck-debug.log`.

### `src/utils/cli-args.ts` and `src/utils/json.ts`

- `parseCliArgs(tokens, valueFlags)` - shared parser for the router CLI subcommands; returns `{ positionals, values, flags }` (tokens not starting with `--` are positionals).
- `ensureJsonFile(path)` - creates the parent directory and an empty JSON array file on demand.
- `stripBom(text)` - removes a leading U+FEFF (Windows editors add a BOM that breaks `JSON.parse`).
- `readJsonSync` / `readJsonAsync` - BOM-safe JSON reads.
- `writeFileSyncAtomic` / `writeFileAtomic` - write to `<base>.tmp.<pid>.<ts>.tmp` and rename, retrying transient `EPERM`/`EACCES`/`EBUSY` errors with a 50 ms backoff. Used by both history stores so plugin CLI spawns and the MCP server never leave a half-written JSON file.

### `src/index.ts` (public API)

Exports:

- `createAdaptiveRouter(config)` - returns `{ route, recordExecution, inferTaskType }`.
- `buildContextFromQuery(model, query, base?)` - builds a `RouterContext` with heuristic signals.
- `buildRecord(ctx, optimizer, metrics, modelFamilyExtractor?)` - builds an `ExecutionRecord` ready to record.
- Re-exports: `classifyTask`, `extractSignalsFromQuery`, `createExecutionRecord`, `JsonHistoryStore`, `selectOptimizerWithExploration`, `extractModelFamily`, `normalizeModel`, `DEFAULT_ROUTER_OPTIONS`, `McpMetricsStore`, `discoverModels`, `discoverModelsFromApi`, `detectKliaApiKey`, `SNAPSHOT_MODELS`, `isChatModel`.
- Re-exported types: `RouterContext`, `RouterDecision`, `RouterOptions`, `TaskSignals`, `DiscoveredModel`, `DiscoveryResult`.

---

## Data Formats

### `ExecutionRecord` (v1)

```jsonc
{
  "id": "1791207861095-5jro5tu",
  "timestamp": "2026-10-05T12:34:56.789Z",
  "model": "glm-5.2",
  "modelFamily": "glm",
  "taskType": "REFACTOR",
  "optimizer": "RTK",
  "metrics": {
    "tokens": 9500,
    "latencySeconds": 88,
    "toolingCost": 0.5,
    "quality": 0.98,
    "failed": false
  },
  "contextSnapshot": {
    "fileCount": 12,
    "contextSizeBytes": 250000,
    "toolCallsExpected": "medium"
  }
}
```

### `RouterEvent` (v2)

A `decision` event:

```jsonc
{
  "id": "evt-...",
  "schemaVersion": 2,
  "timestamp": "2026-10-05T12:34:56.789Z",
  "type": "decision",
  "sessionId": "sess-...",
  "projectId": "C:/Proyectos/...",
  "query": "refactoriza auth",
  "model": "glm-5.2",
  "modelFamily": "glm",
  "taskType": "REFACTOR",
  "signals": { "fileCount": 12, "contextSizeBytes": 250000, "toolCallsExpected": "medium" },
  "decision": {
    "optimizer": "RTK",
    "version": "V2",
    "confidence": 1,
    "reason": "Para glm-5.2/REFACTOR, RTK tiene el menor coste relativo (0.58) con 3 muestras.",
    "alternatives": [
      { "optimizer": "RTK", "relativeCost": 0.58, "sampleCount": 3 },
      { "optimizer": "DCP", "relativeCost": 0.59, "sampleCount": 3 }
    ]
  },
  "source": "mcp",
  "synthetic": false
}
```

An `execution` event (only the `execution` block differs):

```jsonc
{
  "...": "...common fields as above...",
  "type": "execution",
  "execution": {
    "optimizer": "RTK",
    "inputTokens": 8000,
    "outputTokens": 1500,
    "totalTokens": 9500,
    "latencySeconds": 88,
    "costUsd": 0.00625,
    "toolingCost": 0.5,
    "quality": 0.95,
    "failed": false,
    "retries": 0,
    "contextSizeBytesAfter": 120000,
    "tokensPruned": 130000,
    "actualToolCalls": 4,
    "routerLatencyMs": 12,
    "startedAt": "2026-10-05T12:34:50Z",
    "completedAt": "2026-10-05T12:36:18Z"
  },
  "source": "mcp",
  "synthetic": false
}
```

### `RouterDecision`

```jsonc
{
  "optimizer": "RTK",
  "version": "V2",
  "reason": "Para glm-5.2/REFACTOR, RTK tiene el menor coste relativo (0.58) con 3 muestras.",
  "confidence": 1,
  "taskType": "REFACTOR",
  "alternatives": [
    { "optimizer": "RTK", "relativeCost": 0.58, "sampleCount": 3 },
    { "optimizer": "DCP", "relativeCost": 0.59, "sampleCount": 3 },
    { "optimizer": "CONTEXT_MODE", "relativeCost": 0.71, "sampleCount": 3 },
    { "optimizer": "BASELINE", "relativeCost": 1.0, "sampleCount": 3 }
  ]
}
```

### History file (v1, `history.json`)

A JSON array of `ExecutionRecord`. Written atomically per `add()` via a Promise chain lock. The file is created on demand; the parent directory is created with `recursive: true`. This is the file the adaptive router reads to make decisions.

### Events file (v2, `events.json`)

A JSON array of `RouterEvent`. Written by `RouterEventStore` with the same Promise chain lock pattern. This is the source for `get_router_stats` (format=v2) and `router stats`. Migrated lazily from v1 on read.

### MCP metrics file (legacy, `mcp-metrics.json`)

A JSON array of `McpUsageMetric`. Written synchronously on every `record()` call. Used by `get_router_stats` (format=legacy) for the `mcpUsageSummary` field.

### `benchmark-results.json` (benchmark harness, consumed by the dashboard)

A JSON array of benchmark result rows. The dashboard benchmark adapter reads it when `--benchmark` is provided (or via installer defaults):

```jsonc
[
  {
    "taskId": "Q05",
    "taskName": "...",
    "model": "glm-5.2",
    "optimizer": "REPOMIX",
    "taskType": "REPO_PACKAGING",
    "estimatedTokens": 18780,
    "latencySeconds": 65,
    "quality": 0.95,
    "failed": false
  }
]
```

Per-row savings are computed against the `BASELINE` row with the same `taskId`; aggregates (`BenchmarkOptimizerAggregate`, `BenchmarkGroupAggregate`) and the calibration summary (`BenchmarkCalibration`) are derived in `src/dashboard/benchmark-adapter.ts`.

### Health state file (`health-state.json`)

A single object written by `src/scripts/health-check.ts` after every full run:

```jsonc
{
  "lastRunAt": "2026-10-22T15:12:40.000Z",
  "status": "ok",            // ok | warn | fail
  "okCount": 8,
  "failedCount": 0,
  "warnCount": 1,
  "lastMessage": "Resumen: 8 correctas, 1 avisos, 0 fallos",
  "lastPopupAt": "2026-10-22T15:12:41.000Z",
  "runs": 42
}
```

A full check runs when the stored `lastRunAt` is older than the interval (default 24 h); otherwise the CLI reports from this file (cached, summary only) and does not pop up a window.

---

## Configuration Reference

### `RouterOptions` (in code)

```typescript
{
  minConfidence: 0.6,        // Minimum confidence to use a learned V2 rule
  explorationRate: 0.1,      // V3 exploration probability
  minSamples: 3,             // Minimum samples to trust a rule
  latencyWeight: 1.0,        // Weight of latency in the cost
  toolingCostWeight: 1.0,    // Weight of tooling cost in the cost
  failurePenalty: 5.0,       // Added when failed === true
  qualityPenalty: 3.0,       // Multiplied by (1 - quality)
  familyConfidenceWeight: 0.5, // Confidence reduction for family-inherited data
}
```

### Environment variables (MCP server)

See [README.md - Environment Variables](./README.md#environment-variables). All are parsed with `parseFloat`; invalid values are ignored (fall back to defaults). The full list:

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `ROUTER_HISTORY_PATH` | v1 history file (adaptive router learning) | `./.router-history/history.json` |
| `ROUTER_EVENTS_PATH` | v2 unified events file (reporting) | `./.router-history/events.json` |
| `ROUTER_METRICS_PATH` | Legacy MCP metrics file | `./.router-history/mcp-metrics.json` |
| `ROUTER_LOG_PATH` | MCP server JSON log | `./.router-history/mcp-server.log.json` |
| `ROUTER_MIN_CONFIDENCE` | Minimum confidence for a learned rule | `0.6` |
| `ROUTER_EXPLORATION_RATE` | V3 exploration rate | `0.1` |
| `ROUTER_MIN_SAMPLES` | Minimum samples to trust a rule | `3` |
| `ROUTER_LATENCY_WEIGHT` | Latency weight | `1.0` |
| `ROUTER_TOOLING_COST_WEIGHT` | Tooling cost weight | `1.0` |
| `ROUTER_FAILURE_PENALTY` | Failure penalty | `5.0` |
| `ROUTER_QUALITY_PENALTY` | Lost-quality penalty | `3.0` |

### Environment variables (CLI and installer)

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `KLIA_HOME` | Base directory for installed KLIA data and logs (set by the installer) | `~/.klia` |
| `KLIA_STORE_DIR` | Alternative events/data directory used by `resolveEventsPath` | unset |
| `KLIA_OPENCODE_CONFIG` | Overrides the OpenCode config file path used by `router calibrate --write` | unset |
| `KLIA_HEALTH_POPUP` | Health-check popup policy (`always`, `fail-only`, `off`) | `always` |
| `KLIA_HEALTH_POPUP_TIMEOUT` | Popup auto-close, in seconds | `10` |
| `KLIA_HEALTH_HOURS` | Hours between full health checks | `24` |
| `KLIA_HEALTH_TIMEOUT` | Binary check timeout, in ms | `10000` |
| `KLIA_HEALTH_DISABLE` | `1` or `true` disables the startup health check | unset |
| `KLIA_HEALTH_STATE_PATH` | Overrides the health state file path | `<KLIA_STORE_DIR ?? ~/.klia/data>/health-state.json` |

### Events path resolution order

`router stats`, `compact`, `autopilot` and `dashboard --events` all accept an explicit `--events`. Without it, the first existing candidate wins:

1. explicit `--events`
2. `ROUTER_EVENTS_PATH`
3. `KLIA_STORE_DIR/events.json`
4. `KLIA_HOME/data/events.json`
5. `~/.klia/data/events.json`
6. legacy `<cwd>/.router-history/events.json`

`ROUTER_MIN_CONFIDENCE` can also live in the global OpenCode config (`mcp.servers['klia-token-optimizer'].environment.ROUTER_MIN_CONFIDENCE` in JSONC, or `mcp[...].env` in the V1 layout); `router calibrate --write` updates that key.

### `tsconfig.json` vs `tsconfig.build.json`

- `tsconfig.json` includes `src/**/*` and `tests/**/*`. Used by Vitest and IDE type checking.
- `tsconfig.build.json` extends the base, sets `rootDir: ./src`, excludes tests, and emits declarations. Used by `npm run build`.

---

## Debugging

### Inspect the v1 history

```bash
node -e "console.table(require('./.router-history/history.json').map(r => ({model: r.model, task: r.taskType, opt: r.optimizer, tokens: r.metrics.tokens, quality: r.metrics.quality})))"
```

### Inspect the v2 events

```bash
node -e "const e=require('./.router-history/events.json'); console.log('events:', e.length); console.table(e.slice(-10).map(x => ({type:x.type, model:x.model, task:x.taskType, opt:(x.decision||x.execution||{}).optimizer, synthetic:x.synthetic})))"
```

### Inspect MCP metrics

```bash
node -e "const m = require('./.router-history/mcp-metrics.json'); console.log('decisions:', m.length); console.table(m.slice(-10))"
```

### Inspect the cost matrix

Use the `get_router_stats` MCP tool (format=legacy), or:

```typescript
import { JsonHistoryStore, buildCostMatrix, DEFAULT_ROUTER_OPTIONS } from 'klia-token-optimizer';

const store = new JsonHistoryStore({ filePath: './.router-history/history.json' });
const records = await store.list();
const matrix = buildCostMatrix(records, DEFAULT_ROUTER_OPTIONS);
for (const [key, scores] of matrix) {
  console.log(key);
  for (const [opt, score] of scores) {
    console.log('  ', opt, score);
  }
}
```

### Inspect the enriched v2 report

```bash
npm run router -- stats --model glm-5.2 --real-only
```

Or call `get_router_stats` with `format=v2` from the MCP server.

### MCP server logs

The MCP server writes structured JSON logs to `ROUTER_LOG_PATH` (default `.router-history/mcp-server.log.json`). Each entry has `timestamp`, `level`, `message`, and `meta`. Levels: `debug`, `info`, `error`.

### Inspect the health check

```bash
node dist/scripts/health-check.js --force --json
```

State lives in `~/.klia/data/health-state.json`; the thin plugins debug-log to `~/.klia/logs/healthcheck-debug.log`. `KLIA_HEALTH_DISABLE=1` silences the startup check.

### Common issues

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| Decision is always `V0` | History is empty for `(model, task)` | Record executions or run `npm run calibrate`. |
| Decision is always `V1` | `minSamples` or `minConfidence` not met | Lower thresholds or record more samples. |
| `SEMBLE` is never selected | Not in `BASE_RULES` for the task, or insufficient evidence / samples | Check `BASE_RULES` and record more executions. |
| MCP tools not visible | Server not started or `opencode.jsonc` not loaded | Run `npm run mcp-server` and check `opencode.jsonc`. |
| `get_router_stats` v2 report is empty | `events.json` is empty or all events are synthetic | Call `migrate_history` or record real executions; pass `excludeSynthetic=false` to see synthetic data. |
| History file grows unbounded | No eviction policy | Run `npm run router -- compact --write` (TTL 90 days, orphan purge, `--rotate`). |
| `router stats` sees no data | Events file is not where the CLI looks | Pass `--events <path>` or set `KLIA_HOME`/`ROUTER_EVENTS_PATH` (see resolution order above). |
| Dashboard does not start | Port 6283 already in use (or another dashboard instance) | Use `--port`, or check `~/.klia/logs/dashboard.log` after `--detach`. |
| Autopilot prints nothing | No executions in the last hour, or it is disabled | It only reacts to last-hour metrics; check with `npm run router -- autopilot --json`, re-enable with `--enable`. |
| `router calibrate` suggests the same value | Threshold comes from the OpenCode config file | Apply the suggestion with `--write`; verify with `--min-confidence` to force a value. |
| `JSON.parse` fails on a store file | File was edited by a tool that added a BOM | `stripBom` in `src/utils/json.ts` handles this on read; re-save the file without BOM. |
| Health check reports stale data after a change | Runs are throttled to `KLIA_HEALTH_HOURS` (24 h); cached runs read `health-state.json` | Run `node dist/scripts/health-check.js --force --json` to force a fresh check. |
| Popup does not appear on startup | `KLIA_HEALTH_POPUP=off` or `KLIA_HEALTH_DISABLE=1`, or the run was cached | Remove the disables or re-run with `--popup --force`; plugin errors go to `~/.klia/logs/healthcheck-debug.log`. |

---

## Adding an Optimizer

1. Add the optimizer to `Optimizer` in `src/types.ts`.
2. Add it to `BASE_RULES` in `src/rules/base-rules.ts` for the relevant task types. Order matters: the first entry is the V0 default.
3. Update the MCP server's `RecordExecutionSchema` enum in `src/mcp-server.ts` to allow the new optimizer in `record_execution`.
4. Update the `get_router_stats` tool description in `src/mcp-server.ts` if needed.
5. Add tests:
   - Selector picks it when it has the lowest relative cost.
   - Explorer can pick it when unexplored.
   - `record_execution` accepts it.
6. Update `README.md`, `README_en.md`, `dev.md`, and `dev_es.md`.

The scorer and history store need no changes; they work generically with any `Optimizer` value. The v2 event store also picks up new optimizers automatically.

---

## Adding a Task Type

1. Add the task type to `TaskType` in `src/types.ts`.
2. Update `classifyTask` in `src/classifier/task-classifier.ts`. Add the heuristic signals if applicable.
3. Add an entry to `BASE_RULES` in `src/rules/base-rules.ts`.
4. Update the `get_router_stats` tool's `taskType` enum in `src/mcp-server.ts` (`GetStatsSchema`).
5. Update `RouteTaskSchema` if you add new task-specific signals.
6. Add tests for classification, selection, and exploration.
7. Update the docs.

---

## Changing the Cost Function

The v1 cost function lives in `computeRecordCost` in `src/scorer/expected-cost-scorer.ts`:

```typescript
let cost = metrics.tokens;
cost += metrics.latencySeconds * options.latencyWeight;
cost += metrics.toolingCost * options.toolingCostWeight;
if (metrics.failed) cost += options.failurePenalty;
cost += options.qualityPenalty * (1 - metrics.quality);
```

The v2 equivalent is `computeEventCost` in `src/scorer/stats-report.ts` (operates on `RouterEvent` execution events). Keep both in sync if you change one.

To change it:

1. Edit `computeRecordCost` (and `computeEventCost` if you want the v2 report to match).
2. If you add a new weight, add it to `RouterOptions` and `DEFAULT_ROUTER_OPTIONS` in `src/types.ts`.
3. Add a corresponding `ROUTER_*` env var in `loadRouterOptionsFromEnv` in `src/mcp-server.ts`.
4. Add tests in `tests/scorer/`.
5. Update the docs.

The relative cost is `avgOptimizerCost / avgBaselineCost` per `(model, task)`. If there is no baseline, the optimizer's own average is used as the denominator, so `relativeCost = 1`. Keep this invariant unless you intentionally want a different normalization.

---

## MCP Server Internals

The MCP server (`src/mcp-server.ts`, server version `2.0.0`) exposes **four** tools via the Model Context Protocol over stdio:

| Tool | Schema | Effect |
| ---- | ------ | ------ |
| `route_task` | `RouteTaskSchema` | Calls `router.route(ctx)`, records a `decision` `RouterEvent`, and records a legacy MCP metric. Returns the decision plus a `sessionId` to pair with `record_execution`. Accepts `sessionId` and `projectId` for pairing. |
| `record_execution` | `RecordExecutionSchema` | Builds a v1 record via `buildRecord` and calls `router.recordExecution`. Also builds an `execution` `RouterEvent` with split `inputTokens`/`outputTokens`, `costUsd` (estimated via `computeCostUsd` if not provided), `retries`, `errorMessage`, `contextSizeBytesAfter`, `tokensPruned`, `actualToolCalls`, `routerLatencyMs`, `startedAt`, `completedAt`, `source`, `synthetic`. |
| `get_router_stats` | optional `model`/`taskType`/`excludeSynthetic`/`format` filters | `format=v2` (default): the enriched report (`summary`, `byModel`, `byModelTask`, `globalSavings`). `format=legacy`: total records, unique models, the relative cost matrix, and the MCP usage summary. |
| `migrate_history` | none | Migrates `events.json` from v1 to v2 in place via `RouterEventStore.migrateFile()`. Returns `{ migrated, migratedCount, eventsPath }`. Idempotent. |

Key behaviors:

- **Path resolution**: relative paths are resolved against the project root (found by walking up to the `klia-token-optimizer` package.json). Absolute paths are used as-is.
- **Exploration**: disabled by default in the MCP server (`enableExploration: false`). Pass `explore: true` in `route_task` to enable V3 for that single call.
- **Session pairing**: `route_task` returns a `sessionId`. Pass the same `sessionId` to `record_execution` to pair the decision with its execution in the v2 events store.
- **Pricing**: when `costUsd` is not provided to `record_execution`, it is estimated via `computeCostUsd(inputTokens, outputTokens, model, family)`.
- **Logging**: structured JSON to `ROUTER_LOG_PATH`. Each tool call logs the request and the result or error.
- **Error handling**: parse errors and unknown tool names throw; the logger records the error before re-throwing.

### Installing the MCP server in OpenCode

The unified installer (`install_klia_tokens.ps1`) handles this automatically. For manual setup:

Edit `opencode.jsonc`:

```jsonc
{
  "mcpServers": {
    "klia-token-optimizer": {
      "type": "local",
      "command": ["node", "C:/ProyectosV2/telemetria/klia-token-optimizer/dist/mcp-server.js"],
      "enabled": true,
      "env": {
        "ROUTER_HISTORY_PATH": "C:/ProyectosV2/telemetria/klia-token-optimizer/.router-history/history.json",
        "ROUTER_EVENTS_PATH": "C:/ProyectosV2/telemetria/klia-token-optimizer/.router-history/events.json",
        "ROUTER_METRICS_PATH": "C:/ProyectosV2/telemetria/klia-token-optimizer/.router-history/mcp-metrics.json"
      }
    }
  }
}
```

Run `npm run build` first so `dist/mcp-server.js` exists.

The unified installer also:
- Writes the `klia-auto-record.ts` plugin (auto-records real metrics after each session via `router-cli.js --record-execution`).
- Injects the system prompt into `opencode.jsonc`.
- Adjusts `base-rules.ts` if any optimizer failed to install.
- Calibrates the history with baseline records.
- Installs the five `/klia_*` slash commands into the OpenCode and Kilo command directories (from `commands/`, rewriting the `__KLIA_INSTALL_DIR__` and `__KLIA_HOME__` placeholders).
- Installs the `klia-healthcheck.ts` thin plugins into the Kilo and OpenCode (v1/v2) plugin directories (phase 16). They run `dist/scripts/health-check.js --popup` at editor startup and show a Windows popup with the result, or with the component that failed.

---

## Code Conventions

- **Language**: TypeScript with `strict: true`.
- **Module system**: CommonJS (`"type": "commonjs"` in `package.json`).
- **Naming**: descriptive English for symbols, Spanish for comments.
- **No emojis** in code or documentation.
- **Single responsibility**: keep modules small.
- **Tests mirror src**: `tests/scorer/` for `src/scorer/`, etc.
- **Imports**: relative imports within `src/`; type imports use `import type` where possible.
- **No global Vitest globals**: import `describe`, `it`, `expect` from `vitest`.
- **v1 and v2 stay in sync**: when you change the v1 cost function, update the v2 equivalent (`computeEventCost`) so the enriched report matches the adaptive router's decisions.

---

## Common Pitfalls

### Forgetting to record real metrics

The router only learns when `recordExecution` is called. If you only ever call `route_task`, decisions stay at V0/V1 forever. The CLIs and MCP server are designed to make recording easy; use them. The `klia-auto-record` plugin closes the loop automatically.

### Editing `tsconfig.json` instead of `tsconfig.build.json`

`tsconfig.json` includes tests and is used by Vitest and the IDE. `tsconfig.build.json` is what produces `dist/`. Editing the wrong file will either ship tests in the build or break type checking in the editor.

### Concurrent writes to the history file

`JsonHistoryStore` and `RouterEventStore` serialize writes with a Promise chain lock within a process, and both use `writeFileSyncAtomic` (temp file + rename) from `src/utils/json.ts`, so a crash no longer leaves a half-written JSON file. Still, two processes can overwrite each other's last write; run a single MCP server per history file.

### BOM in JSON store files

Some Windows editors add a U+FEFF BOM that breaks `JSON.parse`. The stores read through `readJsonSync`/`readJsonAsync` (BOM-safe), so the stores tolerate it, but hand-edited temp files or external tools may not. Save store files without BOM or re-run through the store API.

### Dashboard port already in use

`router dashboard` binds `127.0.0.1:6283` by default. A second launch (or a leftover `--detach` child) fails to bind; change the port with `--port` or inspect `~/.klia/logs/dashboard.log`.

### Relative cost without a baseline

If no `BASELINE` records exist for a `(model, task)`, `computeRelativeCost` uses the optimizer's own average as the denominator, so `relativeCost = 1`. This means the matrix will show `1.0` for every optimizer, and the selector will fall back to the V0 rule. Record at least one baseline execution per `(model, task)` to get meaningful relative costs.

### Forgetting to update the MCP enum

When you add an optimizer, you must update `RecordExecutionSchema`'s `optimizer` enum in `src/mcp-server.ts`. Otherwise `record_execution` will reject records for the new optimizer with a Zod validation error.

### Mixing v1 and v2 costs

`computeRecordCost` (v1) and `computeEventCost` (v2) must stay aligned. If you change the v1 cost function and forget the v2 one, the enriched report (`get_router_stats` format=v2 and `router stats`) will diverge from the decisions the adaptive router actually makes.

### `forceConsistentCasingInFileNames`

This is enabled in `tsconfig.json`. On case-insensitive filesystems (Windows, macOS default), inconsistent casing will compile but fail on Linux CI. Be consistent.
