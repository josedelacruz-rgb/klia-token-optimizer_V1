# Prueba 15 - BUSQUEDA_REFERENCIAS

**Prompt:** Hazme un listado de los sitios que importan JsonHistoryStore.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:39:03Z
**Duracion:** 47s
**Estado:** success
**Router KLIA:** BASELINE/SMALL_CODE (refused -> native)

## Respuesta

Sitios que importan `JsonHistoryStore` (excluyendo la definición en `src/history/history-store.ts:24` y docs/logs/benchmarks):

**Código fuente:**
- `src/index.ts:2` — import estático + re-export en `src/index.ts:112`
- `src/mcp-server.ts:520` — import dinámico (`await import('./history/history-store')).JsonHistoryStore`)

**Tests:**
- `tests/history/history-store.test.ts:4`
- `tests/selector/optimizer-selector.test.ts:3`
- `tests/selector/exploration.test.ts:3`
- `tests/index.test.ts:46` — import dinámico

## Metricas

- tokens_input: 22217
- tokens_output: 226
- tokens_reasoning: 372
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 22815
- cost_usd: 0
- tool_calls: 1
- tools_usadas: grep
- assistant_messages: 2
