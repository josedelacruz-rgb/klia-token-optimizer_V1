# Prueba 01 - BUSQUEDA_FUNCION

**Prompt:** Busca la funcion classifyTask en este codigo y muestrame donde esta y que hace.
**Categoria:** BUSQUEDA_FUNCION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-21T14:17:26Z
**Duracion:** 50s
**Estado:** success

## Respuesta

## `classifyTask` — ubicación y comportamiento

**Ubicación:** `src/classifier/task-classifier.ts:45`

La función `classifyTask(signals: TaskSignals, opts: TaskClassifierOptions): TaskType` clasifica una tarea en una de las categorías del router aplicando un **orden de prioridad estricto**:

1. **`REFACTOR`** — si `signals.isRefactor` (task-classifier.ts:51)
2. **`MULTISTEP`** — si `signals.isMultistep` (:55)
3. **`TERMINAL`** — si `signals.hasTerminalCommands` (:59)
4. **`REPOSITORY_SEARCH`** — si `signals.isRepositorySearch` (:63)
5. **`LARGE_CONTEXT`** — si el tamaño de contexto supera los umbrales (1 MB normal / 5 MB extremo), consultando a `classifyContextSize` (:67)
6. **`REPOSITORY_SEARCH`** — si `fileCount >= manyFilesThreshold` (8 archivos, :72)
7. **`SMALL_CODE`** — si hay ≤3 archivos, contexto < 1 MB y pocas tool calls esperadas (:77)
8. **`UNKNOWN`** — fallback por defecto (:85)

### Detalles relevantes
- Los umbrales están en `DEFAULTS` (:12): 1 MB contexto, 5 MB extremo, 8 archivos.
- `classifyContextSize` (:31) es una función auxiliar que devuelve `LARGE_CONTEXT` o `LARGE_CONTEXT_EXTREME` según el tamaño, pensada para que el selector priorice SEMBLE en casos extremos.
- Las señales pueden derivarse de texto con `extractSignalsFromQuery` (:92), que detecta patrones en inglés y español (refactor, ejecuta, busca, plan, etc.).
- Se consume desde `src/index.ts:40,44,97` y se exporta en la API pública (`:109`).

### Uso típico
```ts
const signals = extractSignalsFromQuery("refactoriza el módulo de auth");
const taskType = classifyTask(signals); // → 'REFACTOR'
```

El resultado (`TaskType`) alimenta después a `BASE_RULES` (`src/rules/base-rules.ts`) para determinar los optimizadores candidatos de esa tarea.

## Metricas

- tokens_input: 19996
- tokens_output: 713
- tokens_reasoning: 32
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 20741
- cost_usd: 0
- tool_calls: 3
- tools_usadas: grep, glob, read
- assistant_messages: 3
