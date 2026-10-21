# Prueba 08 - DOCUMENTACION

**Prompt:** Que hace extractModelFamily y donde se usa? Incluye un ejemplo de como se llama.
**Categoria:** DOCUMENTACION
**TaskType:** SMALL_CODE
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-21T14:27:27Z
**Duracion:** 81s
**Estado:** success

## Respuesta

## `extractModelFamily`

**Qué hace** (`src/utils/model-family.ts:43`): Extrae la familia de un modelo a partir de su identificador. Pasa a minúsculas y busca contra una lista de familias conocidas (deepseek, nemotron, devstral, codestral, minimax, ministral, magistral, mistral, cosmos, gemma, kimi, qwen, glm, ami, llama). Si no hay match, hace fallback al primer prefijo alfabético, y si no hay ninguno devuelve `'unknown'`.

```ts
extractModelFamily('GLM-5.2')              // -> 'glm'
extractModelFamily('deepseek-v4-pro')      // -> 'deepseek'
extractModelFamily('Cosmos3-Super-Reasoner') // -> 'cosmos'
extractModelFamily('foo-bar-1')            // -> 'foo' (fallback)
extractModelFamily('123-model')            // -> 'unknown'
```

**Dónde se usa** (solo código fuente, ignorando logs/benchmarks/docs):

| Archivo | Línea | Uso |
|---|---|---|
| `src/index.ts` | 36, 93, 114 | Default de `modelFamilyExtractor` en `createAdaptiveRouter`; re-exportada en la API pública |
| `src/selector/optimizer-selector.ts` | 43 | **Herencia por familia**: cuando un modelo no tiene historial propio, consulta `queryByFamily(extractModelFamily(model), taskType)` para usar datos de la familia con confianza reducida (V1) |
| `src/mcp-server.ts` | 260, 321, 347, 378, 399, 433 | Rellena `modelFamily` en `RouterEvent` de `route_task` y `record_execution` |
| `src/router-cli.ts` | 156, 188, 222, 278 | Calcula `costUsd` (vía `computeCostUsd`) y rellena `modelFamily` en eventos del CLI v2 |
| `src/klia-discovery.ts` | 218, 237, 243 | Asigna `family` a cada modelo descubierto desde `/v1/models` y a `SNAPSHOT_MODELS` |
| `tests/mcp-metrics.test.ts` | 10-24 | Tests unitarios |

**Ejemplo de llamada real** (herencia por familia, `src/selector/optimizer-selector.ts:43`):

```ts
const records = await deps.history.query(model, taskType);

if (records.length === 0) {
  const family = extractModelFamily(model);             // 'glm' para 'GLM-5.2'
  const familyRecords = await deps.history.queryByFamily(family, taskType);
  // ...usa familyRecords con confianza reducida (V1)
}
```

Es la pieza clave que permite el punto 8 de las decisiones arquitectónicas del AGENTS.md: **herencia por familia** cuando un modelo nuevo aún no tiene historial propio.

## Metricas

- tokens_input: 40936
- tokens_output: 879
- tokens_reasoning: 365
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 42180
- cost_usd: 0
- tool_calls: 3
- tools_usadas: grep, read, read
- assistant_messages: 3
