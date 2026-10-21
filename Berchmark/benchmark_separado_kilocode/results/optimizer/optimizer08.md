# Prueba 08 - DOCUMENTACION

**Prompt:** Que hace extractModelFamily y donde se usa? Incluye un ejemplo de como se llama.
**Categoria:** DOCUMENTACION
**TaskType:** SMALL_CODE
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-21T15:43:34Z
**Duracion:** 100s
**Estado:** success

## Respuesta

Voy a leer el archivo de definición y buscar usos en código fuente real (excluyendo logs/docs/benchmarks).## `extractModelFamily`

**Qué hace** (`src/utils/model-family.ts:43`): Extrae la familia de un modelo a partir de su identificador. Pasa el nombre a minúsculas y lo busca contra una lista de familias conocidas en KLIA (`deepseek`, `nemotron`, `devstral`, `codestral`, `minimax`, `ministral`, `magistral`, `mistral`, `cosmos`, `gemma`, `kimi`, `qwen`, `glm`, `ami`, `llama`), ordenadas por especificidad (las más largas primero para evitar matches parciales). Si no hay match, hace fallback al primer segmento alfabético (`/^[a-z]+/`); y si no existe ninguno, devuelve `'unknown'`.

Firma:
```ts
export function extractModelFamily(model: string): string
```

Ejemplos de salida:
```ts
extractModelFamily('GLM-5.2')                // -> 'glm'
extractModelFamily('deepseek-v4-pro')        // -> 'deepseek'
extractModelFamily('Cosmos3-Super-Reasoner') // -> 'cosmos'
extractModelFamily('foo-bar-1')              // -> 'foo'   (fallback)
extractModelFamily('123-model')              // -> 'unknown'
```

**Dónde se usa** (solo código fuente `src/` y `tests/`):

| Archivo | Líneas | Uso |
|---|---|---|
| `src/index.ts` | 3, 36, 93, 114 | Import; default de `modelFamilyExtractor` en `createAdaptiveRouter` (con fallback a `extractModelFamily`); re-exportada en la API pública |
| `src/selector/optimizer-selector.ts` | 7, 43 | **Herencia por familia**: cuando un modelo no tiene historial propio, calcula `family = extractModelFamily(model)` y consulta `queryByFamily(family, taskType)` para usar datos de la familia con confianza reducida (V1) |
| `src/mcp-server.ts` | 16, 260, 321, 347, 378, 399, 433 | Rellena `modelFamily` en los `RouterEvent` de `route_task` y `record_execution`; default del `modelFamilyExtractor` del router |
| `src/router-cli.ts` | 7, 156, 188, 222, 278 | Calcula `costUsd` (vía `computeCostUsd(..., extractModelFamily(execModel) ?? undefined)`) y rellena `modelFamily` en los eventos del CLI v2 |
| `src/klia-discovery.ts` | 3, 218, 237, 243 | Asigna `family` a cada modelo descubierto desde `/v1/models` y a los `SNAPSHOT_MODELS` |
| `tests/mcp-metrics.test.ts` | 4, 10-24 | Tests unitarios (`glm-5.2`→`glm`, `deepseek-v4`→`deepseek`, `gpt-4o`→`gpt`, `claude-sonnet-4`→`claude`, `kimi-k2.7`→`kimi`, `foo-bar-1`→`foo`, `123-model`→`unknown`) |

**Ejemplo de llamada real** en el código (`src/selector/optimizer-selector.ts:43`), usado para herencia por familia cuando el modelo no tiene histórico propio:

```ts
const records = await deps.history.query(model, taskType);

// Si no hay datos del modelo, intentar herencia por familia.
if (records.length === 0) {
  const family = extractModelFamily(model);              // 'glm' para 'GLM-5.2'
  const familyRecords = await deps.history.queryByFamily(family, taskType);
  ...
}
```

## Metricas

- tokens_input: 63598
- tokens_output: 1290
- tokens_reasoning: 144
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 65032
- cost_usd: 0
- tool_calls: 5
- tools_usadas: grep, read, grep, grep, read
- assistant_messages: 4
