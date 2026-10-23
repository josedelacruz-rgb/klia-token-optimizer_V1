# Prueba 04 - BUSQUEDA_REFERENCIAS

**Prompt:** En que archivos se usa el tipo RouterEvent? Muestra la lista.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-23T07:25:19Z
**Duracion:** 30s
**Estado:** success

## Respuesta

Filtrando solo archivos de código fuente TypeScript (excluyendo benchmarks, logs y docs):

**Definición del tipo:**
- `src/types.ts`

**Uso en código fuente (`src/`):**
- `src/history/router-event-store.ts` — store unificado v2
- `src/history/migrate.ts` — migrador v1 → v2
- `src/scorer/stats-report.ts` — reporting v2
- `src/mcp-server.ts` — servidor MCP
- `src/router-cli.ts` — CLI unificado
- `src/dashboard/stats-adapter.ts` — adaptador de dashboard
- `src/scripts/migrate-history.ts`
- `src/scripts/calibrate-display.ts`
- `src/scripts/autopilot-display.ts`
- `src/scripts/compact-display.ts`
- `src/scripts/stats-display.ts`

**Tests:**
- `tests/history/router-event-store.test.ts`
- `tests/history/migrate-v1-to-v2.test.ts`
- `tests/scorer/stats-report.test.ts`

## Metricas

- tokens_input: 22789
- tokens_output: 353
- tokens_reasoning: 92
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 23234
- cost_usd: 0
- tool_calls: 2
- tools_usadas: grep, bash
- assistant_messages: 3
