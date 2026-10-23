# Prueba 03 - BUSQUEDA_REFERENCIAS

**Prompt:** Lista todos los archivos donde se llama o se importa la funcion computeCostUsd.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:26:36Z
**Duracion:** 30s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

**Definición:**
- `src/pricing/model-pricing.ts:84`

**Importaciones + llamadas (código fuente):**
- `src/router-cli.ts` — import `:13`, llamada `:157`
- `src/mcp-server.ts` — import `:28`, llamada `:432`
- `src/scorer/stats-report.ts` — import `:8` (usada en `buildStatsReport` para `savingsUsd`)

*(El resto de coincidencias son benchmarks, logs y docs `dev.md`/`dev_es.md`, solo referencias textuales).*

## Metricas

- tokens_input: 25846
- tokens_output: 172
- tokens_reasoning: 154
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 26172
- cost_usd: 0
- tool_calls: 1
- tools_usadas: grep
- assistant_messages: 2
