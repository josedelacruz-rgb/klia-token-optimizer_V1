# Prueba 10 - BUSQUEDA_FUNCION

**Prompt:** Encontrame donde se instancia el McpMetricsStore dentro del codigo fuente.
**Categoria:** BUSQUEDA_FUNCION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:33:46Z
**Duracion:** 36s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

`McpMetricsStore` se instancia en 2 puntos del código fuente (los otros 2 son tests):

- `src/mcp-server.ts:283` → `const metricsStore = new McpMetricsStore(metricsPath);` (servidor MCP)
- `src/router-cli.ts:219` → `const metricsStore = new McpMetricsStore(metricsPath);` (CLI unificado)

Definida en `src/history/mcp-metrics-store.ts:18` y re-exportada en `src/index.ts:121`.

## Metricas

- tokens_input: 18942
- tokens_output: 202
- tokens_reasoning: 118
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 19262
- cost_usd: 0
- tool_calls: 2
- tools_usadas: grep, grep
- assistant_messages: 2
