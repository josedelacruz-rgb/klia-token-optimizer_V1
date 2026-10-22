# Prueba 19 - BUSQUEDA_REFERENCIAS

**Prompt:** Que ficheros consumen la clase McpMetricsStore? Quiero la lista completa.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T08:53:26Z
**Duracion:** 120s
**Estado:** success

## Respuesta

Consumidores de `McpMetricsStore`:

**Código fuente:**
- `src/mcp-server.ts:20` — importa e instancia en `mcp-server.ts:283`
- `src/router-cli.ts:10` — importa e instancia en `router-cli.ts:219`
- `src/index.ts:121` — re-exporta la clase

**Tests:**
- `tests/mcp-metrics.test.ts:5` — importa e instancia
- `tests/mcp-server-stats.test.ts:23` — importa dinámica e instancia

**Referencias no consumidoras:**
- `src/history/mcp-metrics-store.ts:18` — definición de la clase
- `src/history/router-event-store.ts:10` — solo mencionada en comentario

## Metricas

- tokens_input: 20333
- tokens_output: 330
- tokens_reasoning: 199
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 20862
- cost_usd: 0
- tool_calls: 2
- tools_usadas: grep, grep
- assistant_messages: 3
