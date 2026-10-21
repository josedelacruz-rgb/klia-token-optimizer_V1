# Prueba 03 - BUSQUEDA_REFERENCIAS

**Prompt:** Lista todos los archivos donde se llama o se importa la funcion computeCostUsd.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-21T15:39:27Z
**Duracion:** 58s
**Estado:** success

## Respuesta

## Archivos donde se llama o importa `computeCostUsd`

**Definición:**
- `src/pricing/model-pricing.ts:84` — definición de la función

**Importaciones + llamadas (código fuente):**
- `src/router-cli.ts:12` (import) · `:156` (llamada)
- `src/mcp-server.ts:27` (import) · `:379` (llamada)
- `src/scorer/stats-report.ts:8` (import, usada en `buildStatsReport` para `savingsUsd`)

**Solo referencias (documentación, no código):** `dev.md`, `dev_es.md`, además de logs/benchmarks bajo `Berchmark/` y `repo-bundle.md`.

## Metricas

- tokens_input: 29491
- tokens_output: 245
- tokens_reasoning: 481
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 30217
- cost_usd: 0
- tool_calls: 1
- tools_usadas: grep
- assistant_messages: 2
