# Prueba 16 - BUSQUEDA_REFERENCIAS

**Prompt:** Que modulos dependen del tipo RouterOptions? Lista los ficheros.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:39:50Z
**Duracion:** 38s
**Estado:** success
**Router KLIA:** BASELINE/SMALL_CODE (refused -> native)

## Respuesta

Módulos que dependen del tipo `RouterOptions` (definido en `src/types.ts:102`):

| Fichero | Uso |
|---|---|
| `src/index.ts` | API pública; lo expone y lo usa en `AdaptiveRouterOptions` y `route()` |
| `src/mcp-server.ts` | Carga opciones desde env (`Partial<RouterOptions>`) |
| `src/scorer/expected-cost-scorer.ts` | Scoring v1 (coste esperado) |
| `src/scorer/stats-report.ts` | Reporting v2 (recibe `Required<RouterOptions>`) |
| `src/selector/optimizer-selector.ts` | Selección de optimizador |
| `src/selector/exploration.ts` | Exploración/explotación V3 |

Total: **6 módulos** (además de la definición en `src/types.ts`). No hay dependencias en `tests/`.

## Metricas

- tokens_input: 24222
- tokens_output: 336
- tokens_reasoning: 60
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 24618
- cost_usd: 0
- tool_calls: 2
- tools_usadas: grep, grep
- assistant_messages: 3
