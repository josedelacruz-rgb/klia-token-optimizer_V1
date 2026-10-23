# Prueba 02 - BUSQUEDA_FUNCION

**Prompt:** Donde se define la funcion createAdaptiveRouter y que parametros recibe?
**Categoria:** BUSQUEDA_FUNCION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T08:21:42Z
**Duracion:** 48s
**Estado:** success

## Respuesta

`createAdaptiveRouter` se define en `src/index.ts:32`.

Recibe un único parámetro `config` de tipo `AdaptiveRouterOptions` (definido en `src/index.ts:21-30`):

- `historyPath: string` — ruta del archivo JSON de histórico (obligatorio).
- `routerOptions?: RouterOptions` — opciones por defecto del router.
- `enableExploration?: boolean` — si es `false`, desactiva la exploración automática (V3). Por defecto `true`.
- `modelFamilyExtractor?: (model: string) => string | undefined` — función para extraer la familia de un modelo. Por defecto usa `extractModelFamily`.

## Metricas

- tokens_input: 42806
- tokens_output: 487
- tokens_reasoning: 69
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 43362
- cost_usd: 0
- tool_calls: 5
- tools_usadas: grep, grep, grep, read, read
- assistant_messages: 6
