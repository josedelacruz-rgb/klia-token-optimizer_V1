# Prueba 03 - BUSQUEDA_REFERENCIAS

**Prompt:** Lista todos los archivos donde se llama o se importa la funcion computeCostUsd.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-21T13:46:16Z
**Duracion:** 31s
**Estado:** success

## Respuesta

Archivos donde se llama o importa `computeCostUsd`:

**Definición:**
- `src/pricing/model-pricing.ts:84` — definición de la función

**Importaciones + usos:**
- `src/router-cli.ts:12` (import), `:156` (uso)
- `src/mcp-server.ts:27` (import), `:379` (uso)
- `src/scorer/stats-report.ts:8` (import, usado en `buildStatsReport` para `savingsUsd`)

**Documentación (solo referencias):**
- `dev.md` y `dev_es.md`

## Metricas

- tokens_input: 13219
- tokens_output: 181
- tokens_reasoning: 54
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 13454
- cost_usd: 0
- tool_calls: 1
- tools_usadas: grep
- assistant_messages: 2
