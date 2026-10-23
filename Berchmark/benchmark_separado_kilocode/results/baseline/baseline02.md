# Prueba 02 - BUSQUEDA_FUNCION

**Prompt:** Donde se define la funcion createAdaptiveRouter y que parametros recibe?
**Categoria:** BUSQUEDA_FUNCION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-23T07:24:20Z
**Duracion:** 27s
**Estado:** success

## Respuesta

La función está definida en `src/index.ts:32`. Veamos la firma y el tipo de parámetro:La función `createAdaptiveRouter` se define en `src/index.ts:32` y recibe un único parámetro `config` de tipo `AdaptiveRouterOptions` (definido en `src/index.ts:21`), con estos campos:

- `historyPath: string` — ruta del JSON de histórico.
- `routerOptions?: RouterOptions` — opciones por defecto del router (se mezclan con `DEFAULT_ROUTER_OPTIONS`).
- `enableExploration?: boolean` — si es `false` desactiva la exploración automática V3 (por defecto `true`).
- `modelFamilyExtractor?: (model: string) => string | undefined` — función para extraer la familia del modelo (por defecto `extractModelFamily`).

Devuelve un `AdaptiveRouter` con los métodos `route`, `recordExecution` e `inferTaskType`.

## Metricas

- tokens_input: 37491
- tokens_output: 498
- tokens_reasoning: 36
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 38025
- cost_usd: 0
- tool_calls: 4
- tools_usadas: grep, grep, grep, read
- assistant_messages: 5
