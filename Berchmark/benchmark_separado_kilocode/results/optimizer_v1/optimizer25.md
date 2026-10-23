# Prueba 25 - EMPAQUETADO_REPO

**Prompt:** Resumen del modulo src/history/: archivos, funciones principales y como se relacionan los stores.
**Categoria:** EMPAQUETADO_REPO
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:57:26Z
**Duracion:** 92s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

# Resumen del módulo `src/history/`

Cuatro archivos que persisten el historial de decisiones y ejecuciones del router en formato JSON. Coexisten dos generaciones: **v1 (legacy)** y **v2 (unificada)**.

## Archivos y funciones principales

### `history-store.ts` (v1, legacy)
- `HistoryStore` (interface) — contrato: `add`, `list`, `query`, `queryByFamily`.
- `JsonHistoryStore` — implementación sobre `ExecutionRecord[]` en un archivo JSON. Usa un `lock` (Promise chain) para serializar escrituras y `ensureFile()` para crear el archivo vacío. `query` filtra por `model`+`taskType`+`optimizer`; `queryByFamily` igual pero por `modelFamily`.
- `createExecutionRecord(...)` — fábrica que genera un `ExecutionRecord` con `id` (`Date.now()`+random) y `timestamp` ISO.

### `mcp-metrics-store.ts` (v1, legacy)
- `McpUsageMetric` — interfaz plana de métricas de decisión MCP (`version`, `confidence`, métricas opcionales).
- `McpMetricsStore` — store síncrono (`record`, `list`, `summary`). A diferencia de `JsonHistoryStore`, NO usa lock ni async. `summary()` agrega `totalDecisions/Executions`, contadores por `taskType`/`optimizer`/`modelFamily`, `avgQuality` y `failureRate`.

### `router-event-store.ts` (v2, unificado)
- `RouterEventStore` — **reemplaza a los dos anteriores**. Persiste `RouterEvent[]` en un único JSON. Métodos:
  - `add(event)` — append con lock (igual patrón que `JsonHistoryStore`).
  - `list()` — lectura; **migración perezosa** en memoria vía `isMigratedToV2`/`migrateV1ToV2` (sin persistir, para no sorprender al usuario).
  - `migrateFile()` — persiste la migración v1→v2 en disco; devuelve el nº de eventos migrados (0 si ya estaba).
  - `query(filter)` — filtrado flexible por `type` (`decision`/`execution`), `model`, `taskType`, `optimizer` (busca en `decision.optimizer` o `execution.optimizer` según el tipo), `source`, `sessionId` y `excludeSynthetic`.
  - `markAllAsSynthetic(source)` — marca eventos existentes como sintéticos (para siembra de benchmark).
- `createDecisionEvent(params)` / `createExecutionEvent(params)` — fábricas de `RouterEvent` con `schemaVersion` fija y `id` autogenerado.

### `migrate.ts` (puente v1→v2)
- `newEventId()` — generador de id con el mismo formato que v1.
- `looksSynthetic(record)` — heurística: detecta datos del CLI placeholder (`quality===0.98` + fórmula de tokens `size/20+files*100`) o del benchmark (`quality` con ≥10 decimales, vía `Math.random()`).
- `migrateExecutionRecord(record, source, synthetic?)` — `ExecutionRecord` → `RouterEvent` tipo `execution`; mapea `contextSnapshot` → `signals` y `metrics` → `execution`. `synthetic` se infiere con `looksSynthetic` si no se pasa.
- `migrateMcpMetric(metric, source)` — `McpUsageMetric` → `RouterEvent`; elige `type` según si hay `tokens`/`latencySeconds` (`execution`) o no (`decision`, mapeando `version` 'EXECUTION' → 'V0').
- `migrateV1ToV2(records, options?)` — aplica `migrateExecutionRecord` a un array.
- `isMigratedToV2(events)` — comprueba si el primer elemento tiene `schemaVersion === ROUTER_EVENT_SCHEMA_VERSION`.

## Relación entre los stores

```
        v1 (legacy, se mantienen para que el router adaptativo siga aprendiendo)
        ┌─────────────────────┐  ┌─────────────────────┐
        │  JsonHistoryStore   │  │  McpMetricsStore     │
        │  (ExecutionRecord)  │  │  (McpUsageMetric)   │
        └──────────┬──────────┘  └──────────┬──────────┘
                   │                        │
                   │ migrateExecutionRecord  │ migrateMcpMetric
                   │                        │
                   └──────────┬─────────────┘
                              ▼
                     migrate.ts (migrateV1ToV2 / isMigratedToV2)
                              │
                              ▼
        v2 (unificado, para reporting)
        ┌─────────────────────────────────────┐
        │        RouterEventStore             │
        │  (RouterEvent: decision|execution)  │
        │  - migración perezosa en list()     │
        │  - migrateFile() para persistirla   │
        │  - query() con excludeSynthetic     │
        └─────────────────────────────────────┘
```

**Puntos clave de la relación:**
1. **`RouterEventStore` depende de `migrate.ts`** — importa `isMigratedToV2` y `migrateV1ToV2` para transparentar datos v1 al leer.
2. **`migrate.ts` depende de tipos de `../types`** (`ExecutionRecord`, `McpUsageMetricLike`, `RouterEvent`, `ROUTER_EVENT_SCHEMA_VERSION`), no de los stores — es pura transformación de datos.
3. **`history-store.ts` y `mcp-metrics-store.ts` son independientes** entre sí (v1) y se mantienen vivos para no romper el aprendizaje adaptativo del router que aún los consume.
4. **Dos modos de migración**: en memoria (`RouterEventStore.list`, no persiste) vs. en disco (`RouterEventStore.migrateFile()`); también hay un script CLI en `src/scripts/migrate-history.ts` y la tool MCP `migrate_history`.
5. **`looksSynthetic`** opera solo sobre `ExecutionRecord` (v1), alimentando el flag `RouterEvent.synthetic` que `query({excludeSynthetic:true})` usa para separar datos de benchmark/CLI de métricas reales en el reporting v2.

## Metricas

- tokens_input: 27749
- tokens_output: 1798
- tokens_reasoning: 64
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 29611
- cost_usd: 0
- tool_calls: 5
- tools_usadas: glob, read, read, read, read
- assistant_messages: 3
