# Prueba 31 - DOCUMENTACION

**Prompt:** Ensename la estructura de src/history/ y explica que guarda cada store.
**Categoria:** DOCUMENTACION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T09:28:03Z
**Duracion:** 134s
**Estado:** success

## Respuesta

## Estructura de `src/history/`

```
src/history/
├── history-store.ts       (legacy v1)
├── mcp-metrics-store.ts   (legacy v1)
├── router-event-store.ts  (unificado v2)
└── migrate.ts             (migración v1 -> v2)
```

### Cada store

**`history-store.ts`** — `JsonHistoryStore` (legacy v1)
- Persiste `ExecutionRecord[]` en JSON (normalmente `history.json`).
- Guarda: `id`, `timestamp`, `model`, `modelFamily`, `taskType`, `optimizer`, `metrics` (tokens, latencia, calidad, fallo, toolingCost) y `contextSnapshot` (fileCount, contextSizeBytes, toolCallsExpected).
- API: `add`, `list`, `query(model, taskType, optimizer?)`, `queryByFamily(...)`.
- Es el store que usa el **router adaptativo** para aprender; se mantiene para no romper ese flujo.

**`mcp-metrics-store.ts`** — `McpMetricsStore` (legacy v1)
- Persiste `McpUsageMetric[]` (decisiones/métricas de uso del servidor MCP).
- Guarda: `timestamp`, `model`, `modelFamily`, `taskType`, `optimizer`, `version`, `confidence` y opcionalmente `latencySeconds`, `tokens`, `quality`, `failed`.
- API síncrona: `record`, `list`, `summary` (cuenta por taskType/optimizer/familia, calidad media y tasa de fallo).
- Diferencia `totalDecisions` (todas) vs `totalExecutions` (las que tienen tokens).

**`router-event-store.ts`** — `RouterEventStore` (unificado v2)
- Store único que **sustituye** a los dos anteriores para reporting.
- Persiste `RouterEvent[]` en `events.json`. Cada evento es de tipo `'decision'` o `'execution'` e incluye `schemaVersion`, `sessionId`, `projectId`, `query`, `signals`, `decision|execution`, `source` y `synthetic`.
- Lee con **migración perezosa**: si detecta registros v1, los convierte en memoria (no persiste salvo que se llame a `migrateFile()`).
- API: `add`, `list`, `query({...filtros})` (tipo, modelo, tarea, optimizador, fuente, `excludeSynthetic`, `sessionId`), `migrateFile()`, `markAllAsSynthetic(source)`.
- Helpers de fábrica: `createDecisionEvent(...)` y `createExecutionEvent(...)`.

**`migrate.ts`** — utilidades de migración v1 → v2
- `migrateExecutionRecord`: convierte `ExecutionRecord` → `RouterEvent` de tipo `'execution'`.
- `migrateMcpMetric`: convierte `McpUsageMetric` → `RouterEvent` `'decision'` (sin tokens) o `'execution'` (con tokens).
- `migrateV1ToV2`: aplica la migración a un array completo.
- `looksSynthetic`: heurística que marca como sintéticos los registros del benchmark/CLI (quality=0.98, tokens = size/20+files*100, o quality con ≥10 decimales).
- `isMigratedToV2`: comprueba si un archivo ya está en v2 mirando `schemaVersion` del primer elemento.

### Resumen del modelo de datos

| Store | Esquema | Tipo de registro | Rol |
|---|---|---|---|
| `history-store.ts` | v1 | `ExecutionRecord` | Aprendizaje del router adaptativo (se mantiene) |
| `mcp-metrics-store.ts` | v1 | `McpUsageMetric` | Decisiones/métricas MCP (se mantiene) |
| `router-event-store.ts` | v2 | `RouterEvent` | Reporting unificado, con `synthetic`/`source` para separar datos reales de benchmark |

La separación `synthetic`/`source` (punto 10 del AGENTS.md) permite que `get_router_stats` con `excludeSynthetic=true` filtre datos de calibración y reporte solo métricas reales.

## Metricas

- tokens_input: 25596
- tokens_output: 1323
- tokens_reasoning: 58
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 26977
- cost_usd: 0
- tool_calls: 5
- tools_usadas: read, read, read, read, read
- assistant_messages: 3
