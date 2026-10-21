# Prueba 02 - BUSQUEDA_FUNCION

**Prompt:** Donde se define la funcion createAdaptiveRouter y que parametros recibe?
**Categoria:** BUSQUEDA_FUNCION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-21T13:45:31Z
**Duracion:** 44s
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

- tokens_input: 33772
- tokens_output: 429
- tokens_reasoning: 50
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 34251
- cost_usd: 0
- tool_calls: 4
- tools_usadas: grep, grep, grep, read
- assistant_messages: 5
