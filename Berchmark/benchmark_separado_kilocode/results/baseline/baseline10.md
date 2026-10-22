# Prueba 10 - BUSQUEDA_FUNCION

**Prompt:** Encontrame donde se instancia el McpMetricsStore dentro del codigo fuente.
**Categoria:** BUSQUEDA_FUNCION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T08:34:32Z
**Duracion:** 89s
**Estado:** success

## Respuesta

`McpMetricsStore` se instancia en 4 sitios:

- `src/mcp-server.ts:283`
- `src/router-cli.ts:219`
- `tests/mcp-server-stats.test.ts:24`
- `tests/mcp-metrics.test.ts:31`

Las dos instancias en `src/` son las relevantes en código fuente (no tests).

## Metricas

- tokens_input: 19926
- tokens_output: 175
- tokens_reasoning: 23
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 20124
- cost_usd: 0
- tool_calls: 2
- tools_usadas: grep, grep
- assistant_messages: 3
