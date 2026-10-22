# Prueba 04 - BUSQUEDA_REFERENCIAS

**Prompt:** En que archivos se usa el tipo RouterEvent? Muestra la lista.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:27:06Z
**Duracion:** 27s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

Archivos que usan el tipo `RouterEvent`:

**Definición:**
- `src/types.ts` — definición del tipo (`RouterEvent`, `RouterEventSource`, `RouterEventSignals`, `RouterEventDecision`, `RouterEventExecution`)

**Implementación:**
- `src/history/router-event-store.ts` — store v2 (`RouterEventStore`, `createDecisionEvent`, `createExecutionEvent`)
- `src/history/migrate.ts` — migrador v1 → v2 (`migrateRecord`, `migrateMcpMetric`)
- `src/scorer/stats-report.ts` — reporting (`computeEventCost`, agregaciones)

**Puntos de entrada / CLI:**
- `src/mcp-server.ts` — servidor MCP
- `src/router-cli.ts` — CLI unificado v2
- `src/scripts/stats-display.ts` — display de estadísticas
- `src/scripts/migrate-history.ts` — script de migración

**Tests:**
- `tests/scorer/stats-report.test.ts`
- `tests/history/router-event-store.test.ts`
- `tests/history/migrate-v1-to-v2.test.ts`

## Metricas

- tokens_input: 16431
- tokens_output: 322
- tokens_reasoning: 19
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 16772
- cost_usd: 0
- tool_calls: 1
- tools_usadas: grep
- assistant_messages: 2
