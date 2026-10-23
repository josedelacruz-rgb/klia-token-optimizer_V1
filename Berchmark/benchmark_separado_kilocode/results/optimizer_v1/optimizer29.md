# Prueba 29 - DOCUMENTACION

**Prompt:** Que diferencia hay entre RouterEvent y ExecutionRecord? Ensename sus definiciones.
**Categoria:** DOCUMENTACION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T08:03:13Z
**Duracion:** 65s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

Ambas definiciones están en `src/types.ts`. Aquí están lado a lado:

## `ExecutionRecord` (v1, legacy) — `types.ts:49`
Registro de **una sola pieza**: fusiona la decisión y la ejecución en un único objeto. Métricas embebidas en `metrics` (tokens como número total, sin separar input/output). Incluye `contextSnapshot` con fileCount/contextSizeBytes/toolCallsExpected. No tiene nocion de sessionId, ni de origen (mcp/cli/benchmark), ni marca de datos sintéticos.

```ts
export interface ExecutionRecord {
  id: string;
  timestamp: string;
  model: string;
  modelFamily?: string;
  taskType: TaskType;
  optimizer: Optimizer;
  metrics: {
    tokens: number;
    latencySeconds: number;
    toolingCost: number;
    quality: number;
    failed: boolean;
  };
  contextSnapshot: {
    fileCount: number;
    contextSizeBytes: number;
    toolCallsExpected?: 'low' | 'medium' | 'high';
  };
}
```

## `RouterEvent` (v2, unificado) — `types.ts:224`
Evento **dividido en dos fases** (`type: 'decision' | 'execution'`) emparejadas por `sessionId`. Soporta datos más ricos: inputTokens/outputTokens separados, costUsd, retries, errorMessage, tokensPruned, actualToolCalls, routerLatencyMs, timestamps start/completed. Añade `source` (mcp|cli|benchmark|manual), `synthetic`, `query`/`queryHash`, `projectId`, `schemaVersion` y `signals` estructuradas. Los campos `decision?` y `execution?` solo se rellenan según el `type`.

```ts
export interface RouterEvent {
  id: string;
  schemaVersion: typeof ROUTER_EVENT_SCHEMA_VERSION;   // = 2
  timestamp: string;
  type: 'decision' | 'execution';
  sessionId?: string;
  projectId?: string;
  query: string;
  queryHash?: string;
  model: string;
  modelFamily: string;
  taskType: TaskType;
  signals: RouterEventSignals;
  decision?: RouterEventDecision;     // solo si type==='decision'
  execution?: RouterEventExecution;   // solo si type==='execution'
  source: RouterEventSource;
  synthetic?: boolean;
}
```

## Diferencias clave

| Aspecto | `ExecutionRecord` (v1) | `RouterEvent` (v2) |
|---|---|---|
| Granularidad | 1 registro = decisión+resultado juntos | 2 eventos (`decision` + `execution`) emparejados por `sessionId` |
| Tokens | `metrics.tokens` (total) | `inputTokens` + `outputTokens` + `totalTokens` |
| Origen/trazabilidad | sin `source` | `source: mcp\|cli\|benchmark\|manual` |
| Datos sintéticos | no distinguibles | flag `synthetic` |
| Métricas extra | — | `costUsd`, `retries`, `errorMessage`, `tokensPruned`, `actualToolCalls`, `routerLatencyMs`, `startedAt`/`completedAt` |
| Query | — | `query` + `queryHash` para auditoría |
| Proyecto | — | `projectId` |
| Esquema versionado | — | `schemaVersion = 2` |
| Señales | `contextSnapshot` plano | `signals: RouterEventSignals` (más banderas: hasTerminalCommands, isRefactor, isRepositorySearch, isPackaging, isLiteralSearch, isMultistep) |
| Estado | legacy, se conserva para que el router adaptativo siga aprendiendo sin cambios; se migra a v2 con `migrateV1ToV2` | esquema unificado que sustituye a `ExecutionRecord` + `McpUsageMetric` para reporting |

La migración v1→v2 vive en `src/history/migrate.ts` (mencionada en el header `types.ts:135-144`). Según `AGENTS.md`, ambos stores coexisten: el legacy alimenta el aprendizaje adaptativo, el v2 alimenta el reporting enriquecido de `get_router_stats`.

## Metricas

- tokens_input: 24593
- tokens_output: 1078
- tokens_reasoning: 22
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 25693
- cost_usd: 0
- tool_calls: 2
- tools_usadas: grep, read
- assistant_messages: 3
