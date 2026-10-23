# Prueba 19 - BUSQUEDA_REFERENCIAS

**Prompt:** Que ficheros consumen la clase McpMetricsStore? Quiero la lista completa.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:44:34Z
**Duracion:** 118s
**Estado:** success
**Router KLIA:** BASELINE/SMALL_CODE (refused -> native)

## Respuesta

Ficheros que consumen `McpMetricsStore` (import + uso real, excluyendo docs y logs de benchmark):

**Código de producción:**
- `src/mcp-server.ts:20` (import) → instancia en `src/mcp-server.ts:283`
- `src/router-cli.ts:10` (import) → instancia en `src/router-cli.ts:219`
- `src/index.ts:121` — solo re-exporta la API pública

**Tests:**
- `tests/mcp-metrics.test.ts:5` (import) → instancia en `tests/mcp-metrics.test.ts:31`
- `tests/mcp-server-stats.test.ts:23` (import dinámico) → instancia en `tests/mcp-server-stats.test.ts:24`

**No es consumo real** (solo mención): `src/history/router-event-store.ts:10` lo nombra en un comentario (`Reemplaza a JsonHistoryStore + McpMetricsStore`).

Definición: `src/history/mcp-metrics-store.ts:18`.

Resumen: 2 consumidores reales en producción (`mcp-server.ts`, `router-cli.ts`), 1 re-export (`index.ts`) y 2 tests.

## Metricas

- tokens_input: 21280
- tokens_output: 342
- tokens_reasoning: 638
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 22260
- cost_usd: 0
- tool_calls: 1
- tools_usadas: grep
- assistant_messages: 2
