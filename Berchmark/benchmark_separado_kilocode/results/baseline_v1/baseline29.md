# Prueba 29 - DOCUMENTACION

**Prompt:** Que diferencia hay entre RouterEvent y ExecutionRecord? Ensename sus definiciones.
**Categoria:** DOCUMENTACION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T09:23:13Z
**Duracion:** 134s
**Estado:** success

## Respuesta

Ambas son esquemas de datos del router, pero de generaciones distintas. Aquí están sus definiciones y la diferencia.

## `ExecutionRecord` (v1, legacy) — `src/types.ts:49`

```typescript
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

Es un **registro monolítico**: un único evento que junta "qué se eligió" y "qué resultado hubo" (optimizador + métricas), sin separar decisión de ejecución.

## `RouterEvent` (v2, unificado) — `src/types.ts:224`

```typescript
export interface RouterEvent {
  id: string;
  schemaVersion: typeof ROUTER_EVENT_SCHEMA_VERSION; // 2
  timestamp: string;
  type: 'decision' | 'execution';   // <-- diferencia clave

  sessionId?: string;                 // empareja decision+execution
  projectId?: string;

  query: string;
  queryHash?: string;
  model: string;
  modelFamily: string;
  taskType: TaskType;
  signals: RouterEventSignals;

  decision?: RouterEventDecision;       // solo si type === 'decision'
  execution?: RouterEventExecution;    // solo si type === 'execution'

  source: RouterEventSource;           // 'mcp' | 'cli' | 'benchmark' | 'manual'
  synthetic?: boolean;
}
```

Con `RouterEventExecution` (src/types.ts:180) mucho más rico: separa `inputTokens`/`outputTokens`/`totalTokens`, añade `costUsd`, `retries`, `errorMessage`, `contextSizeBytesAfter`, `tokensPruned`, `actualToolCalls`, `routerLatencyMs`, `startedAt`/`completedAt`.

## Diferencias principales

| Aspecto | `ExecutionRecord` (v1) | `RouterEvent` (v2) |
|---|---|---|
| Granularidad | 1 evento = decisión + resultado juntos | 2 eventos (`decision` y `execution`) emparejados por `sessionId` |
| Tokens | solo `tokens` total | `inputTokens`, `outputTokens`, `totalTokens` |
| Campos extra | — | `costUsd`, `retries`, `errorMessage`, `contextSizeBytesAfter`, `tokensPruned`, `actualToolCalls`, `routerLatencyMs`, `startedAt`/`completedAt` |
| Procedencia | implícita | `source` (mcp/cli/benchmark/manual) + flag `synthetic` |
| Query | no se guarda | `query` + `queryHash` para auditoría |
| Señales | `contextSnapshot` mínimo | `signals: RouterEventSignals` (más flags: `hasTerminalCommands`, `isRefactor`, `isMultistep`, etc.) |
| Versionado | sin versión | `schemaVersion = 2` |
| Contrafactual | — | `explored` + `exploitedOptimizer` por evento |

## Relación entre ambos

`RouterEvent` **sustituye** a `ExecutionRecord` + `McpUsageMetric` para reporting (lo documenta el propio comentario en src/types.ts:135-144). Los stores v1 se conservan solo para que el router adaptativo siga aprendiendo sin cambios; la migración v1→v2 se hace con `src/history/migrate.ts` (y el script `src/scripts/migrate-history.ts`). El AGENTS.md lo recoge en la decisión arquitectónica nº 9.

## Metricas

- tokens_input: 22588
- tokens_output: 993
- tokens_reasoning: 64
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 23645
- cost_usd: 0
- tool_calls: 2
- tools_usadas: grep, read
- assistant_messages: 3
