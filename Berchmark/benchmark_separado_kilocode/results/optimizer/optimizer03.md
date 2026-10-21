# Prueba 03 - BUSQUEDA_REFERENCIAS

**Prompt:** Lista todos los archivos donde se llama o se importa la funcion computeCostUsd.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-21T16:40:13Z
**Duracion:** 55s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

Archivos de código fuente donde se llama o importa `computeCostUsd`:

**Definición:**
- `src/pricing/model-pricing.ts:84`

**Importaciones + llamadas:**
- `src/mcp-server.ts:28` (import), `:407` (uso en `record_execution`)
- `src/router-cli.ts:13` (import), `:157` (uso para calcular `costUsd`)
- `src/scorer/stats-report.ts:8` (import, usado en `buildStatsReport` para `savingsUsd`)

(Otros matches en `dev.md`, `dev_es.md`, y `Berchmark/` son solo referencias documentales/logs, no código fuente.)

## Metricas

- tokens_input: 26257
- tokens_output: 235
- tokens_reasoning: 180
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 26672
- cost_usd: 0
- tool_calls: 1
- tools_usadas: grep
- assistant_messages: 2
