# Prueba 04 - BUSQUEDA_REFERENCIAS

**Prompt:** En que archivos se usa el tipo RouterEvent? Muestra la lista.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T08:23:23Z
**Duracion:** 49s
**Estado:** success

## Respuesta

El tipo `RouterEvent` se usa en estos archivos `.ts` (fuente del proyecto):

**Definición del tipo:**
- `src/types.ts` — declaración de `RouterEvent` + variantes (`RouterEventSource`, `RouterEventSignals`, `RouterEventDecision`, `RouterEventExecution`)

**Stores y migración:**
- `src/history/router-event-store.ts` — store v2 (`RouterEventStore`, `createDecisionEvent`, `createExecutionEvent`)
- `src/history/migrate.ts` — migrador v1 → v2
- `src/scripts/migrate-history.ts` — script CLI de migración

**Servidor MCP y CLI:**
- `src/mcp-server.ts`
- `src/router-cli.ts`

**Scorer / Reporting:**
- `src/scorer/stats-report.ts`
- `src/scripts/stats-display.ts`

**Tests:**
- `tests/scorer/stats-report.test.ts`
- `tests/history/router-event-store.test.ts`
- `tests/history/migrate-v1-to-v2.test.ts`

## Metricas

- tokens_input: 34096
- tokens_output: 379
- tokens_reasoning: 20
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 34495
- cost_usd: 0
- tool_calls: 2
- tools_usadas: grep, grep
- assistant_messages: 3
