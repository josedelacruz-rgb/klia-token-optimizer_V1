# Prueba 08 - DOCUMENTACION

**Prompt:** Que hace extractModelFamily y donde se usa? Incluye un ejemplo de como se llama.
**Categoria:** DOCUMENTACION
**TaskType:** SMALL_CODE
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:29:50Z
**Duracion:** 80s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

Voy a leer la definición de la función y un uso representativo.## `extractModelFamily`

**Definición:** `src/utils/model-family.ts:43`

```ts
export function extractModelFamily(model: string): string
```

Convierte el identificador a minúsculas y lo compara contra una lista de familias conocidas en KLIA (`deepseek`, `nemotron`, `devstral`, `codestral`, `minimax`, `ministral`, `magistral`, `mistral`, `cosmos`, `gemma`, `kimi`, `qwen`, `glm`, `ami`, `llama`), ordenadas de mayor a menor especificidad para evitar matches parciales. Si no coincide ninguna, hace fallback al primer segmento alfabético (`/^[a-z]+/`) o `'unknown'`.

```ts
extractModelFamily('GLM-5.2')                // -> 'glm'
extractModelFamily('deepseek-v4-pro')         // -> 'deepseek'
extractModelFamily('Cosmos3-Super-Reasoner') // -> 'cosmos'
extractModelFamily('foo-bar-1')               // -> 'foo'  (fallback)
extractModelFamily('123-model')               // -> 'unknown'
```

## Dónde se usa

Solo en `src/` (ignorando `dev.md`, `data/` y `Berchmark/`):

| Archivo | Líneas | Rol |
|---|---|---|
| `src/index.ts` | 3, 36, 93, 114 | Import; valor por defecto de `modelFamilyExtractor` en `createAdaptiveRouter` (línea 36); fallback local (línea 93); re-export en la API pública (línea 114) |
| `src/selector/optimizer-selector.ts` | 7, 43 | **Herencia por familia (V1)**: si el modelo no tiene historial propio, `extractModelFamily(model)` da la familia para consultar `queryByFamily(family, taskType)` con confianza reducida |
| `src/mcp-server.ts` | 16, 280, 343, 373, 431, 452, 486 | Se pasa como `modelFamilyExtractor: extractModelFamily` al construir el router (280); rellena `modelFamily` en el `RouterEvent` de `route_task` y `record_execution` |
| `src/router-cli.ts` | 7, 157, 189, 223, 279 | Calcula `costUsd` vía `computeCostUsd(..., extractModelFamily(execModel) ?? undefined)` (157); rellena `modelFamily` en los eventos del CLI v2 |
| `src/klia-discovery.ts` | 3, 218, 237, 243 | Asigna `family: extractModelFamily(id)` a cada modelo descubierto desde `/v1/models` y a `SNAPSHOT_MODELS` |
| `tests/mcp-metrics.test.ts` | 4, 10-24 | Tests unitarios |

## Ejemplo de llamada real

`src/selector/optimizer-selector.ts:43`, dentro de `selectOptimizer`, cuando no hay historial del modelo concreto:

```ts
const family = extractModelFamily(model);                       // 'GLM-5.2' -> 'glm'
const familyRecords = await deps.history.queryByFamily(family, taskType);
```

Y en el discovery de modelos (`src/klia-discovery.ts:218`):

```ts
family: extractModelFamily(id),   // ej. id = 'Deepseek-v4.1-flash' -> 'deepseek'
```

## Metricas

- tokens_input: 40046
- tokens_output: 1037
- tokens_reasoning: 451
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 41534
- cost_usd: 0
- tool_calls: 3
- tools_usadas: grep, read, read
- assistant_messages: 3
