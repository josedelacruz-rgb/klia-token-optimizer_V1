<div align="center">

<img src="docs/assets/klia-token-optimizer-banner.png" alt="Klia Token Optimizer — intelligent optimization for OpenCode" width="100%">

# Klia Token Optimizer

### Less unnecessary context. Smarter decisions. Measurable results.

[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.5-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Vitest](https://img.shields.io/badge/Tests-Vitest-6e9f18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![MCP](https://img.shields.io/badge/MCP-Integration-0a9e6a?logo=modelcontextprotocol&logoColor=white)](https://modelcontextprotocol.io/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](./package.json)

**An intelligent optimization layer for OpenCode that coordinates six strategies and uses recorded execution results to guide future decisions.**

</div>

---

## Measured savings: 25.9% fewer tokens versus the baseline

Klia Token Optimizer reduces avoidable context usage by selecting the strategy that fits each task type.

The figures below come from the reproducible benchmark included in this repository, run on this same project with the same model, the same repository and the same query set in both modes. There are no untraceable aggregate numbers: **every figure comes from a per-query result file**, linked at the end of the section.

### How it was measured

| Parameter | Value |
| --- | --- |
| Queries | 32 (10 categories: search, packaging, documentation) |
| Model | `klia/GLM-5.2` in both modes |
| Baseline mode | Optimizers **disabled**: no `repomix`/`semble` MCP, no `context-mode`, no `klia-*` plugins, no router directive |
| Optimizer mode | Optimizers **enabled**: `repomix` and `semble` MCP registered, `klia-router-inject`, `klia-auto-record`, `openrtk` and DCP plugins loaded, router directive injected into the prompt |
| Metrics | JSON stream from `kilocode run --format json` (tokens, latency, tools) |
| Repetitions | 1 per query (the benchmark accepts `-Repetitions N`) |

### Overall result (27 comparable queries)

Only the queries that complete in both modes can be compared token by token.

| Metric | Baseline | Optimizer | Difference |
| --- | --- | --- | --- |
| Total tokens | 963,517 | 713,839 | **−249,678 (−25.9%)** |
| Average latency | 121 s | 61 s | −50% |
| Maximum latency | 282 s | 118 s | −58% |
| Tool calls | 103 | 66 | −36% |
| Output tokens | 20,085 | 17,795 | −11% |

- **Median saving per query: −3.3%.** **Mean: +10.4%.**
- Optimizer mode wins on **13 of 27** queries and loses or ties on **14**.
- On top of that, **5 baseline queries never finish** (Q21, Q22, Q24, Q28, Q32): they run out of time. With optimizers **all 32 queries complete**.

### Savings by category

| Category | n | Baseline | Optimizer | Saving | Latency (base → opt) |
| --- | --- | --- | --- | --- | --- |
| BUSQUEDA_REFERENCIAS | 8 | 346,367 | 160,258 | **−53.7%** | 116 s → 59 s |
| EMPAQUETADO_REPO | 5 | 187,363 | 133,260 | **−28.9%** | 153 s → 65 s |
| BUSQUEDA_FUNCION | 8 | 248,620 | 223,037 | −10.3% | 99 s → 55 s |
| DOCUMENTACION | 6 | 181,167 | 197,284 | **+8.9%** | 132 s → 69 s |

### What explains the result

- The saving concentrates where the model would otherwise read the whole repository by hand: `BUSQUEDA_REFERENCIAS` and `EMPAQUETADO_REPO`. With repomix, packaging the repository fits in one call instead of dozens of reads.
- In `DOCUMENTACION` optimizer mode is **worse** (+8.9%): the task only needed two or three files, so the fixed cost of the registered MCPs is paid without being amortized.
- The negative median comes from the same cause: on a trivial query the tool overhead is paid and never recovered. The positive global balance comes from the category mix, not from every query improving.
- The most solid benefit is not only tokens: **5 queries that hang in baseline mode do get solved** with optimizers.

### Verify every figure

The benchmark result files are versioned in the repository. Each `.md` includes the prompt, category, `TaskType`, model, duration, status and metrics (input, output and total tokens, latency, tools used), so any figure in this README can be checked against its source:

- [Benchmark instructions](./Berchmark/benchmark_separado_kilocode/README.md) — how to run it and what each status means.
- [Full results (baseline and optimizer)](./Berchmark/benchmark_separado_kilocode/results/) — one file per query and mode.
- [run-baseline.ps1](./Berchmark/benchmark_separado_kilocode/run-baseline.ps1) / [run-optimizer.ps1](./Berchmark/benchmark_separado_kilocode/run-optimizer.ps1) — execution scripts.

| Query | Baseline (optimizers OFF) | Optimizer (optimizers ON) |
| --- | --- | --- |
| Q01 | [baseline01.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline01.md) | [optimizer01.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer01.md) |
| Q02 | [baseline02.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline02.md) | [optimizer02.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer02.md) |
| Q03 | [baseline03.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline03.md) | [optimizer03.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer03.md) |
| Q04 | [baseline04.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline04.md) | [optimizer04.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer04.md) |
| Q05 | [baseline05.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline05.md) | [optimizer05.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer05.md) |
| Q06 | [baseline06.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline06.md) | [optimizer06.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer06.md) |
| Q07 | [baseline07.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline07.md) | [optimizer07.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer07.md) |
| Q08 | [baseline08.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline08.md) | [optimizer08.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer08.md) |
| Q09 | [baseline09.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline09.md) | [optimizer09.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer09.md) |
| Q10 | [baseline10.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline10.md) | [optimizer10.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer10.md) |
| Q11 | [baseline11.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline11.md) | [optimizer11.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer11.md) |
| Q12 | [baseline12.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline12.md) | [optimizer12.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer12.md) |
| Q13 | [baseline13.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline13.md) | [optimizer13.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer13.md) |
| Q14 | [baseline14.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline14.md) | [optimizer14.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer14.md) |
| Q15 | [baseline15.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline15.md) | [optimizer15.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer15.md) |
| Q16 | [baseline16.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline16.md) | [optimizer16.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer16.md) |
| Q17 | [baseline17.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline17.md) | [optimizer17.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer17.md) |
| Q18 | [baseline18.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline18.md) | [optimizer18.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer18.md) |
| Q19 | [baseline19.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline19.md) | [optimizer19.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer19.md) |
| Q20 | [baseline20.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline20.md) | [optimizer20.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer20.md) |
| Q21 | [baseline21.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline21.md) | [optimizer21.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer21.md) |
| Q22 | [baseline22.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline22.md) | [optimizer22.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer22.md) |
| Q23 | [baseline23.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline23.md) | [optimizer23.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer23.md) |
| Q24 | [baseline24.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline24.md) | [optimizer24.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer24.md) |
| Q25 | [baseline25.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline25.md) | [optimizer25.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer25.md) |
| Q26 | [baseline26.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline26.md) | [optimizer26.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer26.md) |
| Q27 | [baseline27.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline27.md) | [optimizer27.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer27.md) |
| Q28 | [baseline28.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline28.md) | [optimizer28.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer28.md) |
| Q29 | [baseline29.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline29.md) | [optimizer29.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer29.md) |
| Q30 | [baseline30.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline30.md) | [optimizer30.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer30.md) |
| Q31 | [baseline31.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline31.md) | [optimizer31.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer31.md) |
| Q32 | [baseline32.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline32.md) | [optimizer32.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer32.md) |

> **Scope of the data.**
>
> - Only the 27 queries that complete in both modes are compared. The other 5 ran out of time in baseline mode (Q21, Q22, Q24, Q28, Q32) and their files record no tokens, so they are excluded from the overall table; their optimizer values are still in the link table.
> - Q13 and Q17 also ran out of time on the first baseline pass and were repeated with a 10-minute budget: 73,772 and 128,064 tokens respectively. They are the two largest savings and explain much of the aggregate.
> - One repetition per query: the category split and the individual percentages carry variance. The benchmark accepts `-Repetitions N` to stabilize the measurement.
> - Savings were measured with the `klia/GLM-5.2` model and this repository as target project. Other models, repositories and task mixes produce different numbers.
> - Fewer context tokens do not necessarily mean a proportionally lower total API cost, and on trivial queries optimizer mode can consume more tokens than baseline.

## What if every task used the right strategy?

Not every coding task needs the same context or benefits from the same tool. Klia Token Optimizer helps select among different strategies based on task type, model, and available execution history.

The goal: **reduce avoidable token usage while keeping quality, failures, latency, and total cost in view.**

> Klia does not promise a universal savings percentage. It records and compares results to help identify which strategies work best in a given environment.

## What can it bring to your workflow?

<table>
<tr>
<td width="50%" valign="top">

### 🎯 Task-aware selection

The router evaluates the type of work and proposes a candidate strategy instead of always applying the same optimizer.

</td>
<td width="50%" valign="top">

### 📉 Measurable savings, not assumptions

Records tokens and other metrics to compare strategies against a baseline and distinguish savings, regressions, or neutral results.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🧠 History-informed decisions

Recorded executions provide evidence to adapt selection by model and task type.

</td>
<td width="50%" valign="top">

### ⚖️ Balance between savings and quality

Evaluation can consider tokens, latency, tool costs, failures, and quality—not just token volume.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🛡️ Conservative fallback

When evidence is insufficient, the router can fall back to `BASELINE` rather than treating an unvalidated alternative as the winner.

</td>
<td width="50%" valign="top">

### 📊 Results visibility

Review statistics by model and task, compare optimizers, and separate real data from synthetic records.

</td>
</tr>
</table>

## Six coordinated strategies

| Strategy       | Potential use case                                              |
| -------------- | --------------------------------------------------------------- |
| `BASELINE`     | Comparison reference or safe fallback when evidence is missing. |
| `DCP`          | Selective context pruning or compression.                       |
| `RTK`          | Reducing noise in terminal output, commands, and logs.          |
| `CONTEXT_MODE` | Work involving large context, documentation, and indexing.      |
| `REPOMIX`      | Preparing a packaged view of a repository.                      |
| `SEMBLE`       | Semantic search to locate relevant code.                        |

Final selection depends on the rules, model, task type, and available data; no single strategy is assumed to win in every case.

## How it works

```text
OpenCode
   │
   ▼
Task classification
   │
   ▼
Rules + historical evidence + model
   │
   ▼
Optimizer selection
   │
   ▼
Execution and result recording
   │
   ▼
Statistics to guide future decisions
```

### A data-informed improvement cycle

1. **Classify** the task using signals such as the query, file count, and context size.
2. **Evaluate** candidate optimizers and the evidence available for that model and task.
3. **Select** a strategy, falling back to `BASELINE` when appropriate.
4. **Record** the available execution metrics.
5. **Compare** results to identify savings, regressions, or no improvement.

The router includes four decision-algorithm versions: from baseline rules (V0), through history-informed adaptation (V1–V2), to controlled exploration (V3).

## Measure what matters

- **Tokens:** total usage and, when available, input/output breakdown.
- **Relative savings:** comparison against the baseline for the same model/task combination.
- **Latency:** execution time.
- **Cost:** estimated or recorded cost and tool costs.
- **Quality and reliability:** quality ratings, failures, and retries.
- **Traceability:** model, task, strategy, selection rationale, and confidence.

Results depend on configuration and recorded metrics. To demonstrate real savings, compare strategies using the same model, task, repository, and quality criteria.

## Quick installation on Windows

<img src="docs/assets/Klia_Token_Optimizer_2.png" alt="Klia Token Optimizer — intelligent optimization for OpenCode" width="100%">

The repository includes a PowerShell installer to set up the router and the optimizers supported by the project.

```powershell
powershell -ExecutionPolicy Bypass -File install_klia_tokens.ps1
```

The documented installer supports profiles and a dry run:

```powershell
.\install_klia_tokens.ps1 -StackProfile minimo
.\install_klia_tokens.ps1 -DryRun
```

> Project-listed requirements: Node.js `>= 22.5`, npm, and `uv` for tools that require it. Review the installer instructions before running it in a work environment.

## Example: request a routing decision

```bash
npm run router -- --model glm-5.2 --query "refactoriza auth" --files 12 --size 250000
```

The output includes the selected optimizer, task type, router version, confidence, and decision rationale.

If the task is small or trivial (no cost signal), the router refuses it: it prints `REFUSED=true` and `DIRECT=NATIVE` and recommends running it directly with the native tools (`read`, `grep`, `glob`, `shell`). The decision is still recorded as `BASELINE`.

After running the task, record real metrics to contribute to the history:

```bash
npm run router -- --record-id <RECORD_ID> --tokens 9500 --latency 88 --quality 0.98
```

Query the statistics:

```bash
npm run router -- stats --model glm-5.2 --real-only
```

The values above are usage examples, not a savings promise or a universal benchmark result.

## Maintenance: stats, calibrate, compact, autopilot and dashboard

The CLI includes five maintenance subcommands that operate on `events.json` (the router event log):

```bash
npm run router -- stats          # 8-section savings report built from events
npm run router -- calibrate      # compares declared confidence vs. actual quality, suggests ROUTER_MIN_CONFIDENCE
npm run router -- compact        # store cleanup plan (dry-run by default; --write applies it)
npm run router -- autopilot      # evaluates tokens/hour, failure rate and store size, returns actions
npm run router -- dashboard      # local web panel with metrics and benchmark (http://127.0.0.1:6283)
```

- `stats` accepts `--model`, `--task`, `--real-only` and `--no-color`.
- `calibrate --write` applies the suggested threshold to the global OpenCode config (with a `.bak-<timestamp>` backup); without `--write` it only prints the recommendation.
- `compact` expires events older than 90 days (`--max-age-days`), purges orphan decisions after 7 days (`--orphan-grace-days`) and rotates the file with `--rotate --keep-events 5000`. Persisting changes requires `--write`.
- `autopilot` suggests actions (`adjust_confidence`, `force_baseline`, `compact_store`, `alert_burn`, `retrain_classifier`) without executing them; `--disable` turns it off for 24 h and `--enable` reactivates it.
- `dashboard --detach` leaves the server running in the background (log at `~/.klia/logs/dashboard.log`) and does not start if the port is already in use.

### Slash commands

The installer registers five slash commands for OpenCode and Kilo: `/klia_stats`, `/klia_calibrate`, `/klia_compact`, `/klia_dashboard` and `/klia_autopilot`. Each command invokes the installed CLI (`dist/router-cli.js`) with the `~/.klia` events path and renders the output in the chat.

### Health check at startup

Thin plugins (`klia-healthcheck`) installed for Kilo and OpenCode (v1 and v2) launch `dist/scripts/health-check.js --popup` every time the editor starts. The check verifies that:

- the Node version is >= 22.5,
- the global runtime exists (`%LOCALAPPDATA%\klia-token-optimizer\dist\router-cli.js`),
- the event store (`events.json`) is accessible and writable,
- the `repomix` and `semble` MCPs are registered in the OpenCode/Kilo configs,
- the `rtk`, `repomix` and `semble` binaries respond to `--version`,
- the plugins (`klia-router-inject`, `klia-auto-record`, `klia-healthcheck`) are in their directories.

The result is stored in `~/.klia/data/health-state.json` and a full run is throttled to once every 24 hours (`--interval-hours` or `KLIA_HEALTH_HOURS`; intermediate startups use the cache and print nothing). If something fails, or if `health-check.js` itself is missing (incomplete installation), a Windows popup shows whether everything works or which program fails. Possible statuses: `ok`, `warn` (e.g. a binary does not respond), `fail` (critical).

The popup is controlled with `KLIA_HEALTH_POPUP` (`always` by default, `fail-only` pops only on failures, `off` silences it) and `KLIA_HEALTH_POPUP_TIMEOUT` (seconds, 10 by default). `KLIA_HEALTH_DISABLE=1` disables the check. The check can also be run manually: `node dist/scripts/health-check.js --force --json`.

## MCP integration

The MCP server exposes four tools:

| Tool               | Purpose                                      |
| ------------------ | -------------------------------------------- |
| `route_task`       | Recommend an optimizer for a task.           |
| `record_execution` | Record an execution result.                  |
| `get_router_stats` | Query statistics and comparisons.            |
| `migrate_history`  | Migrate history to the current event schema. |

## Why Klia Token Optimizer?

Many projects focus on a specific technique: compressing context, filtering output, indexing code, or routing models. Klia takes a coordination approach: **bringing multiple strategies together in one layer and using recorded results to guide selection**.

Its value should be verified with data from the real environment. Run comparable tests and evaluate token usage, quality, latency, failures, and instrumentation overhead together.

## Project status

- Adaptive router with versions V0–V3.
- Six strategies supported by the router rules.
- Execution recording and reports by model and task.
- Decision and execution logging with atomic writes and programmable store cleanup.
- CLI with `stats`, `calibrate`, `compact` and `autopilot`, plus a `dashboard` web panel in detached mode.
- Slash commands for OpenCode and Kilo (`/klia_stats`, `/klia_calibrate`, `/klia_compact`, `/klia_dashboard`, `/klia_autopilot`).
- Health check with popup at OpenCode and Kilo startup: Node, runtime, event store, MCP, binaries and plugins.
- MCP server and CLI.
- Automated tests available in the repository.

To verify a particular installation or strategy, run the tests and perform a controlled benchmark in your environment.

## Development

```bash
npm install
npm run build
npm test
```

## Documentation

- [OpenCode usage guide](./docs/md/OPENCODE_USAGE.md)
- [Installer details](./instaladores/install.md)
- [Project conventions](./AGENTS.md)
- [Router documentation](./docs/md/router.md)
- [Baseline vs. optimizer benchmark: instructions](./Berchmark/benchmark_separado_kilocode/README.md)
- [Benchmark results, one file per query and mode](./Berchmark/benchmark_separado_kilocode/results/)

## License

ISC License. See [`package.json`](./package.json).

---

<div align="center">

**Klia Token Optimizer · Optimize. Measure. Learn from results.**

</div>
