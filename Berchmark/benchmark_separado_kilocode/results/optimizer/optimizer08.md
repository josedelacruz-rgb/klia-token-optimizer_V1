# Prueba 08 - DOCUMENTACION

**Prompt:** Que hace extractModelFamily y donde se usa? Incluye un ejemplo de como se llama.
**Categoria:** DOCUMENTACION
**TaskType:** SMALL_CODE
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-21T16:45:02Z
**Duracion:** 70s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

## `extractModelFamily`

**Qué hace** (`src/utils/model-family.ts:43`): Extrae la familia de un modelo a partir de su identificador. Pasa el nombre a minúsculas y busca contra una lista de familias conocidas (`deepseek`, `nemotron`, `devstral`, `codestral`, `minimax`, `ministral`, `magistral`, `mistral`, `cosmos`, `gemma`, `kimi`, `qwen`, `glm`, `ami`, `llama`), ordenadas por especificidad. Si no hay match, hace fallback al primer prefijo alfabético (`/^[a-z]+/`), y si no hay ninguno devuelve `'unknown'`.

```ts
extractModelFamily('GLM-5.2')                // -> 'glm'
extractModelFamily('deepseek-v4-pro')        // -> 'deepseek'
extractModelFamily('Cosmos3-Super-Reasoner') // -> 'cosmos'
extractModelFamily('foo-bar-1')              // -> 'foo'  (fallback)
extractModelFamily('123-model')              // -> 'unknown'
```

**Dónde se usa** (solo código fuente):

| Archivo | Línea | Uso |
|---|---|---|
| `src/index.ts` | 3, 36, 93, 114 | Import; default de `modelFamilyExtractor` en `createAdaptiveRouter`; re-export en la API pública |
| `src/selector/optimizer-selector.ts` | 7, 43 | **Herencia por familia**: si el modelo no tiene historial propio, calcula `family = extractModelFamily(model)` y consulta `queryByFamily(family, taskType)` con confianza reducida (V1) |
| `src/mcp-server.ts` | 16, 261, 322, 348, 406, 427, 461 | `modelFamilyExtractor: extractModelFamily` al construir el router; rellena `modelFamily` en `RouterEvent` de `route_task` y `record_execution` |
| `src/router-cli.ts` | 7, 157, 189, 223, 279 | Calcula `costUsd` vía `computeCostUsd(..., extractModelFamily(execModel) ?? undefined)` y rellena `modelFamily` en eventos del CLI v2 |
| `src/klia-discovery.ts` | 3, 218, 237, 243 | Asigna `family: extractModelFamily(id)` a cada modelo descubierto desde `/v1/models` y a `SNAPSHOT_MODELS` |
| `tests/mcp-metrics.test.ts` | 4, 10-24 | Tests unitarios |

**Ejemplo de llamada real** — herencia por familia en `src/selector/optimizer-selector.ts:42-44`:

```ts
if (records.length === 0) {
  const family = extractModelFamily(model);              // 'glm' para 'GLM-5.2'
  const familyRecords = await deps.history.queryByFamily(family, taskType);
  ...
}
```

## Metricas

- tokens_input: 46412
- tokens_output: 890
- tokens_reasoning: 131
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 47433
- cost_usd: 0
- tool_calls: 3
- tools_usadas: grep, read, read
- assistant_messages: 3
