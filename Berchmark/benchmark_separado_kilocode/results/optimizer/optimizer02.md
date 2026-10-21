# Prueba 02 - BUSQUEDA_FUNCION

**Prompt:** Donde se define la funcion createAdaptiveRouter y que parametros recibe?
**Categoria:** BUSQUEDA_FUNCION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-21T15:38:39Z
**Duracion:** 48s
**Estado:** success

## Respuesta

Se define en `src/index.ts:32`:

```ts
export function createAdaptiveRouter(config: AdaptiveRouterOptions): AdaptiveRouter
```

Recibe un objeto `AdaptiveRouterOptions` (definido en `src/index.ts:21-30`) con:

- `historyPath: string` — ruta del archivo JSON de histórico (obligatorio).
- `routerOptions?: RouterOptions` — opciones por defecto del router (opcional).
- `enableExploration?: boolean` — si es `false`, desactiva la exploración automática V3 (default `true`).
- `modelFamilyExtractor?: (model: string) => string | undefined` — función para extraer la familia de un modelo (opcional, default `extractModelFamily`).

Devuelve un `AdaptiveRouter` con los métodos `route`, `recordExecution` e `inferTaskType`.

## Metricas

- tokens_input: 26563
- tokens_output: 265
- tokens_reasoning: 125
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 26953
- cost_usd: 0
- tool_calls: 1
- tools_usadas: grep
- assistant_messages: 2
