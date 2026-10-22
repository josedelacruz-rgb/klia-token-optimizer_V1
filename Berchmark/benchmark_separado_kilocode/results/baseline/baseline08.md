# Prueba 08 - DOCUMENTACION

**Prompt:** Que hace extractModelFamily y donde se usa? Incluye un ejemplo de como se llama.
**Categoria:** DOCUMENTACION
**TaskType:** SMALL_CODE
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T08:30:31Z
**Duracion:** 148s
**Estado:** success

## Respuesta

## Qué hace `extractModelFamily`

Función pura en `src/utils/model-family.ts:43` que, dado el identificador de un modelo, devuelve su **familia** en minúsculas. Proceso:

1. Normaliza a minúsculas.
2. Recorre una lista de familias conocidas ordenadas por especificidad (`deepseek`, `nemotron`, `glm`, `kimi`, `qwen`, `mistral`...). Devuelve la primera que aparezca como subcadena.
3. Fallback: primer bloque de letras (`/^[a-z]+/`), o `'unknown'` si no hay letras.

Ejemplos: `GLM-5.2 → glm`, `deepseek-v4-pro → deepseek`, `Cosmos3-Super-Reasoner → cosmos`, `123-model → unknown`.

## Dónde se usa

La función se exporta y se inyecta en el router para soportar la **herencia por familia** (decisión arquitectónica #8 del AGENTS.md): cuando un modelo no tiene historial propio, el router consulta datos de su familia con confianza reducida.

- **`src/selector/optimizer-selector.ts:43`** — núcleo de la herencia: extrae la familia del modelo para llamar a `queryByFamily` cuando no hay `records` del modelo.
- **`src/index.ts:36, 93`** — la expone como `modelFamilyExtractor` configurable en `RouterConfig` (se puede inyectar otra, con fallback a `extractModelFamily`).
- **`src/mcp-server.ts`** (líneas 280, 343, 373, 431, 452, 486) — al registrar eventos `RouterEvent`: rellena `modelFamily` en `record_execution` y la usa para herencia al enrutar.
- **`src/router-cli.ts`** (líneas 157, 189, 223, 279) — al registrar decisiones CLI con `modelFamily`.
- **`src/klia-discovery.ts`** (líneas 218, 237, 243) — clasifica modelos descubiertos en `/v1/models` por familia.
- **`tests/mcp-metrics.test.ts`** — tests unitarios del comportamiento.

## Ejemplo de llamada

En `src/selector/optimizer-selector.ts:42-44`, dentro de `selectOptimizer`, cuando el modelo no tiene registros propios:

```ts
const records = await deps.history.query(model, taskType);

if (records.length === 0) {
  const family = extractModelFamily(model);              // p.ej. 'glm-5.2' -> 'glm'
  const familyRecords = await deps.history.queryByFamily(family, taskType);
  ...
}
```

Llamada directa equivalente:

```ts
import { extractModelFamily } from './utils/model-family';

extractModelFamily('GLM-5.2');   // => 'glm'
extractModelFamily('deepseek-v4-pro');  // => 'deepseek'
extractModelFamily('123-model'); // => 'unknown'
```

## Metricas

- tokens_input: 30399
- tokens_output: 1003
- tokens_reasoning: 61
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 31463
- cost_usd: 0
- tool_calls: 5
- tools_usadas: grep, grep, grep, read, read
- assistant_messages: 4
