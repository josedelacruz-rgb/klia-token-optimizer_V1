# Prueba 04 - BUSQUEDA_REFERENCIAS

**Prompt:** En que archivos se usa el tipo RouterEvent? Muestra la lista.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-21T15:40:24Z
**Duracion:** 37s
**Estado:** success

## Respuesta

`RouterEvent` se usa en 8 archivos:

**Fuente (src/):**
- `src/types.ts:203` — definición del tipo
- `src/history/router-event-store.ts` — store unificado v2
- `src/history/migrate.ts` — migrador v1→v2
- `src/scorer/stats-report.ts` — reporting enriquecido
- `src/mcp-server.ts` — servidor MCP
- `src/router-cli.ts` — CLI unificado
- `src/scripts/migrate-history.ts` — script de migración
- `src/scripts/stats-display.ts` — visualización de stats

**Tests (tests/):**
- `tests/history/router-event-store.test.ts`
- `tests/history/migrate-v1-to-v2.test.ts`
- `tests/scorer/stats-report.test.ts`

## Metricas

- tokens_input: 17232
- tokens_output: 258
- tokens_reasoning: 21
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 17511
- cost_usd: 0
- tool_calls: 1
- tools_usadas: grep
- assistant_messages: 2
