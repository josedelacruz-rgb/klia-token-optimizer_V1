# Prueba 04 - BUSQUEDA_REFERENCIAS

**Prompt:** En que archivos se usa el tipo RouterEvent? Muestra la lista.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-21T16:41:09Z
**Duracion:** 45s
**Estado:** success
**Router KLIA:** BASELINE/SMALL_CODE (refused -> native)

## Respuesta

`RouterEvent` se usa en los siguientes archivos:

**Definición del tipo** (`src/types.ts:203`):
- `src/types.ts` — define `RouterEvent`, `RouterEventSource`, `RouterEventSignals`, `RouterEventDecision`, `RouterEventExecution`.

**Fuente (src/)**:
- `src/history/router-event-store.ts` — store v2 (`RouterEventStore`) + fábricas `createDecisionEvent` / `createExecutionEvent`.
- `src/history/migrate.ts` — conversión v1 (ExecutionRecord / métrica MCP) → `RouterEvent`.
- `src/scorer/stats-report.ts` — cálculo de coste y reporting sobre `RouterEvent`.
- `src/scripts/migrate-history.ts` — script de migración que usa `RouterEventStore`.
- `src/scripts/stats-display.ts` — reporting que instancia `RouterEventStore`.
- `src/router-cli.ts` — CLI v2 que registra decisiones.
- `src/mcp-server.ts` — servidor MCP (`route_task`, `record_execution`, `migrate_history`).

**Tests**:
- `tests/scorer/stats-report.test.ts` — fábrica de eventos y casos de reporting.
- `tests/history/router-event-store.test.ts` — tests del store v2.
- `tests/history/migrate-v1-to-v2.test.ts` — tests de migración v1→v2.

## Metricas

- tokens_input: 17229
- tokens_output: 376
- tokens_reasoning: 19
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 17624
- cost_usd: 0
- tool_calls: 1
- tools_usadas: grep
- assistant_messages: 2
