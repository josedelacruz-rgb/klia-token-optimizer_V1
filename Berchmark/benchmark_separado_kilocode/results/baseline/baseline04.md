# Prueba 04 - BUSQUEDA_REFERENCIAS

**Prompt:** En que archivos se usa el tipo RouterEvent? Muestra la lista.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-21T14:19:32Z
**Duracion:** 40s
**Estado:** success

## Respuesta

El tipo `RouterEvent` se usa (fuera de docs `.md`) en estos archivos:

**Definición:**
- `src/types.ts:203` — declaración del tipo + variantes (`RouterEventSource`, `RouterEventSignals`, `RouterEventDecision`, `RouterEventExecution`)

**Stores y migración:**
- `src/history/router-event-store.ts` — `RouterEventStore`, `createDecisionEvent`, `createExecutionEvent`
- `src/history/migrate.ts` — conversión v1 → v2

**Scoring / reporting:**
- `src/scorer/stats-report.ts` — `computeEventCost`, agregaciones

**Servidor MCP y CLI:**
- `src/mcp-server.ts:29` — import del tipo + uso del store
- `src/router-cli.ts:14` — import del tipo + uso del store

**Tests:**
- `tests/scorer/stats-report.test.ts:5` — helpers y fixtures de `RouterEvent`

Documentación que lo referencia (no código): `AGENTS.md`, `dev.md`, `dev_es.md`.

## Metricas

- tokens_input: 15068
- tokens_output: 304
- tokens_reasoning: 270
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 15642
- cost_usd: 0
- tool_calls: 1
- tools_usadas: grep
- assistant_messages: 2
