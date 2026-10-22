# Prueba 22 - EMPAQUETADO_REPO

**Prompt:** Quiero un snapshot compacto del proyecto: empaquetalo y pasame las firmas principales.
**Categoria:** EMPAQUETADO_REPO
**TaskType:** REPO_PACKAGING
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:48:27Z
**Duracion:** 171s
**Estado:** success
**Router KLIA:** REPOMIX/REPO_PACKAGING

## Respuesta

El snapshot inicial es 2.4M tokens: arrastró `Berchmark/` (logs jsonl + un `models.json` de 5.8M), `data/*.json` de métricas e instaladores PS1, que no son firmas de código. Reempaqueto solo `src/` + `tests/` + config esencial para entregar las firmas principales realmente compactas.Snapshot compacto listo: **38 archivos / 19.087 tokens** (vs 2,4M del empaquetado completo). Ahora extraigo las firmas principales del código fuente.Snapshot empaquetado con `repomix --compress` (firmas tree-sitter). Tras descartar `Berchmark/`, `data/*.json` e instaladores (2,4M → 19k tokens), estas son las firmas principales del proyecto:

## Núcleo del dominio — `src/types.ts`

```ts
type Optimizer   = 'BASELINE' | 'DCP' | 'RTK' | 'CONTEXT_MODE' | 'REPOMIX' | 'SEMBLE'
type TaskType    = 'SMALL_CODE'|'TERMINAL'|'LARGE_CONTEXT'|'REPOSITORY_SEARCH'
                 |'REPO_PACKAGING'|'LITERAL_SEARCH'|'MULTISTEP'|'REFACTOR'|'UNKNOWN'

interface TaskSignals        // query, fileCount, contextSizeBytes, toolCallsExpected, hasTerminalCommands,
                             // isRefactor, isRepositorySearch, isPackaging, isLiteralSearch, isMultistep
interface RouterContext      { model: string; signals: TaskSignals }
interface ExecutionRecord    // v1: id, timestamp, model, modelFamily, taskType, optimizer, metrics, contextSnapshot
interface RouterDecision     { optimizer, version: 'V0'|'V1'|'V2'|'V3', reason, confidence, taskType,
                              explored?, exploitedOptimizer?, alternatives? }
interface RouterOptions      // minConfidence, explorationRate, minSamples, latencyWeight, toolingCostWeight,
                             // failurePenalty, qualityPenalty, familyConfidenceWeight
const DEFAULT_ROUTER_OPTIONS: Required<RouterOptions>

// --- Esquema v2 (unificado) ---
type RouterEventSource       = 'mcp' | 'cli' | 'benchmark' | 'manual'
interface RouterEventSignals
interface RouterEventDecision { optimizer, version, confidence, reason, explored?, exploitedOptimizer?, alternatives? }
interface RouterEventExecution // optimizer, inputTokens, outputTokens, totalTokens, latencySeconds, costUsd?,
                               // toolingCost, quality, failed, retries?, errorMessage?, contextSizeBytesAfter?,
                               // tokensPruned?, actualToolCalls?, routerLatencyMs?, startedAt?, completedAt?
interface RouterEvent        // id, schemaVersion, timestamp, type:'decision'|'execution', sessionId?, projectId?,
                             // query, queryHash?, model, modelFamily, taskType, signals, decision?, execution?,
                             // source, synthetic?
interface McpUsageMetricLike // forma estructural v1 para migración
```

## API pública — `src/index.ts`

```ts
interface AdaptiveRouter {
  route(ctx: RouterContext, opts?: RouterOptions): Promise<RouterDecision>
  recordExecution(record: ExecutionRecord): Promise<void>
  inferTaskType(signals: TaskSignals): TaskType
}
interface AdaptiveRouterOptions { historyPath, routerOptions?, enableExploration?, modelFamilyExtractor? }
function createAdaptiveRouter(config: AdaptiveRouterOptions): AdaptiveRouter
function buildContextFromQuery(model, query, base?): RouterContext
function buildRecord(ctx, optimizer, metrics, modelFamilyExtractor?): ExecutionRecord
// re-exports: JsonHistoryStore, createExecutionRecord, extractModelFamily, normalizeModel, klia-discovery
```

## Clasificador — `src/classifier/task-classifier.ts`

```ts
interface TaskClassifierOptions { largeContextThresholdBytes?, extremeContextThresholdBytes?, manyFilesThreshold? }
function classifyContextSize(signals, opts?): 'LARGE_CONTEXT'|'LARGE_CONTEXT_EXTREME'|null
function classifyTask(signals, opts?): TaskType
function extractSignalsFromQuery(query, base?): TaskSignals
function isSmallTrivialTask(signals, opts?): boolean   // gate: rechaza tareas sin señales de coste
```

## Reglas base — `src/rules/base-rules.ts`

```ts
function candidatesForTask(taskType: TaskType): Optimizer[]      // ordenadas por priors de evidencia
function defaultOptimizerForTask(taskType: TaskType): Optimizer  // primera opción (fallback BASELINE)
```
Política V2.1: DCP sólo MULTISTEP · REPOMIX sólo LARGE_CONTEXT/REPO_PACKAGING · REPOSITORY_SEARCH→SEMBLE · TERMINAL/REFACTOR→RTK.

## Selector — `src/selector/`

```ts
// optimizer-selector.ts
interface OptimizerSelectorDeps { history: HistoryStore }
function selectOptimizer(model, taskType, deps, options?, forcedDefault?): Promise<RouterDecision>
function evaluateOptimizer(records, optimizer, options?): CostScore   // cold-start: entrega default si baseline gana sin muestras

// exploration.ts
interface ExplorationResult { decision: RouterDecision; explored: boolean; exploitedOptimizer: Optimizer }
function selectOptimizerWithExploration(model, taskType, deps, options?, random?, forcedDefault?): Promise<ExplorationResult>
```
Versionado: V0 (reglas) → V1 (familia, confianza reducida) → V2 (modelo) → V3 (exploración controlada).

## Scorer — `src/scorer/`

```ts
// expected-cost-scorer.ts (v1)
interface CostScore { absoluteCost: number; relativeCost: number|null; sampleCount: number }
function computeRecordCost(record, options): number
function computeRelativeCost(records, optimizer, options): CostScore
function buildCostMatrix(records, options?): Map<string, Map<Optimizer, CostScore>>
function keyFor(model, taskType): string

// stats-report.ts (v2)
interface OptimizerCell   // samples, avgTokens, avgInputTokens, avgOutputTokens, avgLatency, avgQuality,
                          // failureRate, avgAbsoluteCost, relativeCost, savingsTokens, savingsPercent,
                          // savingsUsd, verdict:'AHORRO'|'PERDIDA'|'NEUTRO', winner
interface ModelTaskRow    // model, modelFamily, taskType, totalSamples, baseline, optimizers: OptimizerCell[], bestOptimizer
interface ModelRow        // model, modelFamily, executions, avgTokens, avgLatency, avgQuality, failureRate,
                          // bestOptimizer, savingsVsBaselinePercent, savingsVsBaselineTokens
interface RouterStatsReport  // summary, byModel, byModelTask, globalSavings {weightedSavingsPercent,
                             //   totalTokensSaved, totalUsdSaved, verdict}, confidenceCalibration
function computeEventCost(event: RouterEvent, options): number
function buildStatsReport(events: RouterEvent[], options?): RouterStatsReport
```

## Historial — `src/history/`

```ts
// history-store.ts (v1, legacy)
interface HistoryStore { add(record): Promise<void>; list(): Promise<ExecutionRecord[]>;
  query(model, taskType, optimizer?): Promise<ExecutionRecord[]>; queryByFamily(family, taskType, optimizer?): Promise<ExecutionRecord[]> }
class JsonHistoryStore implements HistoryStore
function createExecutionRecord(model, modelFamily, taskType, optimizer, metrics, contextSnapshot): ExecutionRecord

// router-event-store.ts (v2, unificado)
class RouterEventStore { constructor(filePath); add(event): Promise<void>; list(): RouterEvent[];
  migrateFile(): number; query(filter): RouterEvent[]; markAllAsSynthetic(source?): number }
function createDecisionEvent(params): RouterEvent
function createExecutionEvent(params): RouterEvent

// migrate.ts
function migrateV1ToV2(...): RouterEvent[]   // con detección de datos sintéticos
function isMigratedToV2(...): boolean
```

## Servidor MCP — `src/mcp-server.ts`

```ts
// Herramientas expuestas: route_task, record_execution, get_router_stats (format: 'v2'|'legacy'),
//                          migrate_history
// - get_router_stats(format=v2) → buildStatsReport (4 bloques: summary, byModel, byModelTask, globalSavings)
// - get_router_stats(format=legacy) → buildCostMatrix (compatibilidad {relativeCost, sampleCount})
// Gate de tareas triviales vía isSmallTrivialTask: registra decisión pero responde con rechazo
```

## Soporte

- `src/pricing/model-pricing.ts` — `computeCostUsd(...)`, `getPricing()` (tabla de precios por modelo)
- `src/utils/model-family.ts` — `extractModelFamily(model)`, `normalizeModel(model)` (herencia por familia)
- `src/klia-discovery.ts` — descubrimiento de modelos desde `/v1/models` con `KLIA_API_KEY`
- `src/router-cli.ts` — CLI unificado v2 (solo registra decisiones, no métricas sintéticas)
- `src/scripts/` — `calibrate.ts`, `migrate-history.ts`, `stats-display.ts`

**Flujo:** `extractSignalsFromQuery → classifyTask → candidatesForTask → selectOptimizerWithExploration → RouterDecision` (con `recordExecution`/`createExecutionEvent` para feedback). 38 archivos, 19k tokens; el empaquetado completo (con `Berchmark/`+`data/`) eran 2,4M.

## Metricas

- tokens_input: 123386
- tokens_output: 3037
- tokens_reasoning: 847
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 127270
- cost_usd: 0
- tool_calls: 12
- tools_usadas: repomix_pack_codebase, repomix_pack_codebase, repomix_grep_repomix_output, repomix_read_repomix_output, repomix_read_repomix_output, repomix_read_repomix_output, repomix_read_repomix_output, repomix_read_repomix_output, repomix_read_repomix_output, repomix_read_repomix_output, repomix_read_repomix_output, repomix_read_repomix_output
- assistant_messages: 7
