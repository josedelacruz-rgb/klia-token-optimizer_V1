# Prueba 15 - BUSQUEDA_REFERENCIAS

**Prompt:** Hazme un listado de los sitios que importan JsonHistoryStore.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T08:43:57Z
**Duracion:** 72s
**Estado:** success

## Respuesta

Sitios que importan `JsonHistoryStore` (excluyendo la definición en `src/history/history-store.ts:24` y docs/logs/benchmarks):

**Código fuente de producción:**
- `src/index.ts:2` — import estático (+ re-export en `src/index.ts:112`)
- `src/mcp-server.ts:520` — import dinámico (`(await import('./history/history-store')).JsonHistoryStore`)

**Tests:**
- `tests/history/history-store.test.ts:4`
- `tests/selector/optimizer-selector.test.ts:3`
- `tests/selector/exploration.test.ts:3`
- `tests/index.test.ts:46` — import dinámico

**No es consumo real** (solo mención en comentario): `src/history/router-event-store.ts:10` — `Reemplaza a JsonHistoryStore + McpMetricsStore`.

## Metricas

- tokens_input: 30083
- tokens_output: 271
- tokens_reasoning: 231
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 30585
- cost_usd: 0
- tool_calls: 1
- tools_usadas: grep
- assistant_messages: 2
