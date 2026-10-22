# Prueba 31 - DOCUMENTACION

**Prompt:** Ensename la estructura de src/history/ y explica que guarda cada store.
**Categoria:** DOCUMENTACION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T08:05:25Z
**Duracion:** 60s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

## Estructura de `src/history/`

```
src/history/
├── history-store.ts        — Store legacy v1 (ExecutionRecord)
├── mcp-metrics-store.ts    — Store legacy v1 (decisiones MCP)
├── router-event-store.ts   — Store unificado v2 (RouterEvent)
└── migrate.ts              — Migrador v1 → v2
```

### `history-store.ts` — Store legacy v1 de ejecuciones
Guarda `ExecutionRecord` (resultados reales de ejecuciones con un optimizador). Cada registro incluye `model`, `modelFamily`, `taskType`, `optimizer`, `metrics` (tokens, latencia, calidad, fallo) y `contextSnapshot` (tamaño del contexto, número de ficheros, tool calls esperados). Persiste en JSON con `add`/`list`/`query`/`queryByFamily`. Sigue activo para que el router adaptativo siga aprendiendo sin tocar su lógica.

### `mcp-metrics-store.ts` — Store legacy v1 de decisiones MCP
Guarda `McpUsageMetric`: decisiones del router MCP (qué optimizador se eligió, confianza, versión del algoritmo) y, si hubo ejecución, métricas (`tokens`, `latencySeconds`, `quality`, `failed`). Expone `record`/`list`/`summary` (totales por taskType/optimizer/modelFamily, calidad media, tasa de fallo). Es el histórico de la cara "decisión" del router.

### `router-event-store.ts` — Store unificado v2 (`RouterEvent`)
Reemplaza a los dos anteriores para reporting. Un solo archivo JSON con eventos de tipo `'decision'` o `'execution'`, con `schemaVersion=2`, `source` (`mcp`/`cli`/`benchmark`/`router`) y flag `synthetic` para distinguir datos reales de calibración. Migración perezosa v1→v2 al leer; `migrateFile()` la persiste. `query()` filtra por tipo/modelo/tarea/optimizador/source/synthetic. `markAllAsSynthetic()` marca datos sembrados.

### `migrate.ts` — Conversión v1 → v2
- `looksSynthetic(record)`: heurística (quality=0.98 + tokens=size/20+files*100, o >10 decimales) para detectar registros sintéticos del CLI/benchmark.
- `migrateExecutionRecord()`: `ExecutionRecord` → `RouterEvent` tipo `execution`.
- `migrateMcpMetric()`: `McpUsageMetric` → `RouterEvent` tipo `decision` (sin tokens) o `execution` (con tokens).
- `migrateV1ToV2()`: mapea un array de `ExecutionRecord`.
- `isMigratedToV2()`: comprueba si el primer elemento ya tiene `schemaVersion === 2`.

**Resumen del flujo:** v1 tenía dos stores separados (ejecuciones vs decisiones). v2 los unifica en `RouterEvent` con metadatos de origen/sinteticidad para reporting enriquecido; los stores v1 se conservan para no romper el aprendizaje del router en marcha.

## Metricas

- tokens_input: 27707
- tokens_output: 1065
- tokens_reasoning: 48
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 28820
- cost_usd: 0
- tool_calls: 5
- tools_usadas: glob, read, read, read, read
- assistant_messages: 3
