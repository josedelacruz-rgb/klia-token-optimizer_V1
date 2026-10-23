# Prueba 18 - BUSQUEDA_REFERENCIAS

**Prompt:** Donde se referencia ROUTER_EVENT_SCHEMA_VERSION? Muestra los usos.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:43:51Z
**Duracion:** 43s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

**Definición:**
- `src/types.ts:147` — `export const ROUTER_EVENT_SCHEMA_VERSION = 2 as const;`
- `src/types.ts:228` — uso en el tipo `RouterEvent.schemaVersion`

**Usos en código:**
- `src/history/router-event-store.ts:143, 176` — asigna `schemaVersion` al crear eventos
- `src/history/migrate.ts:54, 98, 123` — asigna `schemaVersion` al migrar v1→v2
- `src/history/migrate.ts:163` — detecta si los datos ya están en v2

**Usos en tests:**
- `tests/history/router-event-store.test.ts:64, 108, 149, 166`
- `tests/history/migrate-v1-to-v2.test.ts:32, 152, 170`

(El match en `Berchmark/.../queries.json:203` es la propia pregunta del benchmark, no un uso real.)

## Metricas

- tokens_input: 15010
- tokens_output: 259
- tokens_reasoning: 20
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 15289
- cost_usd: 0
- tool_calls: 1
- tools_usadas: grep
- assistant_messages: 2
