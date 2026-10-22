# Prueba 25 - EMPAQUETADO_REPO

**Prompt:** Resumen del modulo src/history/: archivos, funciones principales y como se relacionan los stores.
**Categoria:** EMPAQUETADO_REPO
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T09:11:48Z
**Duracion:** 146s
**Estado:** success

## Respuesta

# Resumen del módulo `src/history/`

## Archivos

| Archivo | Rol | Esquema |
|---|---|---|
| `history-store.ts` | Store legacy v1 de ejecuciones | `ExecutionRecord` |
| `mcp-metrics-store.ts` | Store legacy v1 de decisiones MCP | `McpUsageMetric` |
| `router-event-store.ts` | Store unificado v2 | `RouterEvent` |
| `migrate.ts` | Conversión v1 → v2 | — |

## Funciones principales

**`history-store.ts`** — `JsonHistoryStore` (persistencia JSON con lock por promesa encadenada):
- `add(record)` / `list()` — escritura y lectura básica.
- `query(model, taskType, optimizer?)` y `queryByFamily(family, ...)` — filtran por modelo o familia (`history-store.ts:69` y `:83`), base del aprendizaje del router adaptativo.
- `createExecutionRecord(...)` — fábrica de registros v1.

**`mcp-metrics-store.ts`** — `McpMetricsStore` (síncrono, sin lock):
- `record(metric)` / `list()` — append de métricas MCP.
- `summary()` (`mcp-metrics-store.ts:55`) — agrega conteos por taskType/optimizer/modelFamily + `avgQuality` y `failureRate`. Es el reporting legacy.

**`router-event-store.ts`** — `RouterEventStore` (store v2, con lock):
- `add(event)` / `list()` — mismo patrón que `JsonHistoryStore`.
- `query(filter)` (`router-event-store.ts:80`) — filtrado rico: `type` (decision/execution), modelo, tarea, optimizador, `source`, `excludeSynthetic`, `sessionId`.
- `migrateFile()` (`:67`) — persiste la migración v1→v2 en disco (a diferencia del `read()` que migra solo en memoria).
- `markAllAsSynthetic(source)` (`:115`) — siembra datos de calibración marcándolos como sintéticos.
- `createDecisionEvent(...)` / `createExecutionEvent(...)` — fábricas de eventos v2.

**`migrate.ts`** — lógica de conversión:
- `looksSynthetic(record)` (`migrate.ts:25`) — heurística: detecta datos del CLI (`quality=0.98` + fórmula de tokens) y del benchmark (quality con ≥10 decimales).
- `migrateExecutionRecord(record, source, synthetic?)` (`:46`) — `ExecutionRecord` → `RouterEvent` tipo `execution`.
- `migrateMcpMetric(metric, source)` (`:88`) — `McpUsageMetric` → `decision` (sin tokens/latencia) o `execution` (con ellos).
- `migrateV1ToV2(records, options?)` (`:146`) — mapea un array de `ExecutionRecord`.
- `isMigratedToV2(events)` (`:160`) — detecta si el primer elemento ya tiene `schemaVersion === 2`.

## Cómo se relacionan los stores

```
   v1 (legacy, se mantienen para que el router siga aprendiendo)
   ┌──────────────────────┐        ┌──────────────────────┐
   │ JsonHistoryStore     │        │ McpMetricsStore      │
   │ (ExecutionRecord)    │        │ (McpUsageMetric)     │
   │ → router adaptativo  │        │ → reporting legacy   │
   └──────────┬───────────┘        └──────────┬───────────┘
              │                                │
              │ migrateV1ToV2                  │ migrateMcpMetric
              │ migrateExecutionRecord         │ (uno a uno)
              ▼                                ▼
            ┌─────────────────────────────────────────┐
            │ RouterEventStore (v2, unificado)        │
            │ • RouterEvent {decision | execution}    │
            │ • migración perezosa en read()          │
            │ • migrateFile() la persiste             │
            │ • query() con excludeSynthetic/source    │
            └─────────────────────────────────────────┘
```

Relación clave: **v2 no sustituye v1 en tiempo de ejecución**, lo envuelve. El router adaptativo sigue escribiendo/leyendo `ExecutionRecord` vía `JsonHistoryStore`; `RouterEventStore` sirve para **reporting unificado** (`get_router_stats` format=v2) y **migra on-demand** los datos v1 a `RouterEvent` usando `migrate.ts`. `McpMetricsStore` aporta las decisiones (sin métricas de ejecución) que también se migran a eventos `decision`. La distinción `synthetic`/`source` permite separar datos de benchmark/CLI de métricas reales en los reportes.

## Metricas

- tokens_input: 25620
- tokens_output: 1475
- tokens_reasoning: 39
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 27134
- cost_usd: 0
- tool_calls: 5
- tools_usadas: read, read, read, read, read
- assistant_messages: 3
