# Prueba 18 - BUSQUEDA_REFERENCIAS

**Prompt:** Donde se referencia ROUTER_EVENT_SCHEMA_VERSION? Muestra los usos.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T08:50:22Z
**Duracion:** 183s
**Estado:** success

## Respuesta

`ROUTER_EVENT_SCHEMA_VERSION` se define en `src/types.ts:147` y se referencia en estos archivos (ignorando los logs de `Berchmark/`, que solo contienen la pregunta y respuestas del benchmark):

**Definición**
- `src/types.ts:147` — `export const ROUTER_EVENT_SCHEMA_VERSION = 2 as const;`
- `src/types.ts:228` — tipo `RouterEvent.schemaVersion: typeof ROUTER_EVENT_SCHEMA_VERSION`

**Código fuente**
- `src/history/router-event-store.ts:4` — import
- `src/history/router-event-store.ts:143` — asigna `schemaVersion` al crear evento (`createDecisionEvent`)
- `src/history/router-event-store.ts:176` — asigna `schemaVersion` al crear evento (`createExecutionEvent`)
- `src/history/migrate.ts:9` — import
- `src/history/migrate.ts:54` — asigna `schemaVersion` al migrar v1→v2
- `src/history/migrate.ts:98` — asigna `schemaVersion` al migrar v1→v2
- `src/history/migrate.ts:123` — asigna `schemaVersion` al migrar v1→v2
- `src/history/migrate.ts:163` — `isMigratedToV2`: comprueba `first?.schemaVersion === ROUTER_EVENT_SCHEMA_VERSION`

**Tests**
- `tests/history/router-event-store.test.ts:6` — import
- `tests/history/router-event-store.test.ts:64, 108, 149, 166` — aserciones `toBe(ROUTER_EVENT_SCHEMA_VERSION)`
- `tests/history/migrate-v1-to-v2.test.ts:10` — import
- `tests/history/migrate-v1-to-v2.test.ts:32, 152` — aserciones `toBe(ROUTER_EVENT_SCHEMA_VERSION)`
- `tests/history/migrate-v1-to-v2.test.ts:170` — fixture `[{ schemaVersion: ROUTER_EVENT_SCHEMA_VERSION } as never]`

## Metricas

- tokens_input: 30886
- tokens_output: 475
- tokens_reasoning: 341
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 31702
- cost_usd: 0
- tool_calls: 1
- tools_usadas: grep
- assistant_messages: 2
