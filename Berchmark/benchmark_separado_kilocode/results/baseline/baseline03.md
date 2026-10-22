# Prueba 03 - BUSQUEDA_REFERENCIAS

**Prompt:** Lista todos los archivos donde se llama o se importa la funcion computeCostUsd.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T08:22:30Z
**Duracion:** 54s
**Estado:** success

## Respuesta

Voy a verificar también los tests para completar el listado:Archivos donde se llama o importa `computeCostUsd` (solo código fuente, descartando docs/benchmarks/logs):

**Definición:**
- `src/pricing/model-pricing.ts:84`

**Importaciones + usos:**
- `src/router-cli.ts:13` (import), `:157` (uso: cálculo de `costUsd` para eventos del CLI v2)
- `src/mcp-server.ts:28` (import), `:432` (uso: estimación de `costUsd` en `record_execution`)
- `src/scorer/stats-report.ts:8` (import, usado en `buildStatsReport` para `savingsUsd`)

No aparece en `tests/` ni en `src/index.ts` (no se re-exporta en la API pública).

## Metricas

- tokens_input: 56503
- tokens_output: 317
- tokens_reasoning: 372
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 57192
- cost_usd: 0
- tool_calls: 2
- tools_usadas: grep, grep
- assistant_messages: 3
