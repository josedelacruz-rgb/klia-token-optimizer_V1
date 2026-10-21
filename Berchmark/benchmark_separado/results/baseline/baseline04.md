# Prueba 04 - BUSQUEDA_REFERENCIAS

**Prompt:** En que archivos se usa el tipo RouterEvent? Muestra la lista.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-21T13:46:47Z
**Duracion:** 32s
**Estado:** success

## Respuesta

`RouterEvent` se usa en estos archivos:

**Definición del tipo:**
- `src/types.ts` (definición de `RouterEvent`, `RouterEventSource`, `RouterEventSignals`, `RouterEventDecision`, `RouterEventExecution`)

**Stores y migración:**
- `src/history/router-event-store.ts` (store v2)
- `src/history/migrate.ts` (migrador v1 → v2)
- `src/scripts/migrate-history.ts` (script de migración)

**Servidor MCP y CLI:**
- `src/mcp-server.ts`
- `src/router-cli.ts`

**Scorer / Reporting:**
- `src/scorer/stats-report.ts`
- `src/scripts/stats-display.ts`

**Tests:**
- `tests/history/router-event-store.test.ts`
- `tests/history/migrate-v1-to-v2.test.ts`
- `tests/scorer/stats-report.test.ts`

## Metricas

- tokens_input: 20347
- tokens_output: 286
- tokens_reasoning: 37
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 20670
- cost_usd: 0
- tool_calls: 2
- tools_usadas: grep, grep
- assistant_messages: 3
