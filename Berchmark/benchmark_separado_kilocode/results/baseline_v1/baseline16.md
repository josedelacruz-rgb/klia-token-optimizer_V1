# Prueba 16 - BUSQUEDA_REFERENCIAS

**Prompt:** Que modulos dependen del tipo RouterOptions? Lista los ficheros.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T08:45:09Z
**Duracion:** 72s
**Estado:** success

## Respuesta

Los módulos que dependen del tipo `RouterOptions` (definido en `src/types.ts:102`) son:

**Código fuente (`src/`):**
- `src/index.ts` — API pública, lo reexporta y lo usa en `AdaptiveRouterOptions`.
- `src/mcp-server.ts` — lo importa y carga opciones desde env (`loadRouterOptionsFromEnv`).
- `src/selector/optimizer-selector.ts` — selección de optimizador.
- `src/selector/exploration.ts` — exploración/explotación.
- `src/scorer/expected-cost-scorer.ts` — función de coste (v1).
- `src/scorer/stats-report.ts` — reporting v2.

**Definición:**
- `src/types.ts:102` — declaración de la interfaz + `DEFAULT_ROUTER_OPTIONS` en la línea 124.

Los tests (`tests/`) no referencian `RouterOptions` directamente.

## Metricas

- tokens_input: 28017
- tokens_output: 459
- tokens_reasoning: 45
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 28521
- cost_usd: 0
- tool_calls: 3
- tools_usadas: grep, grep, grep
- assistant_messages: 4
