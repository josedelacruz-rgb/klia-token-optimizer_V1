# Prueba 01 - BUSQUEDA_FUNCION

**Prompt:** Busca la funcion classifyTask en este codigo y muestrame donde esta y que hace.
**Categoria:** BUSQUEDA_FUNCION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-21T16:38:24Z
**Duracion:** 61s
**Estado:** success
**Router KLIA:** SEMBLE/REPOSITORY_SEARCH

## Respuesta

La función `classifyTask` está en `src/classifier/task-classifier.ts:45`.

**Qué hace:** Clasifica una tarea en uno de los tipos del router (`TaskType`) a partir de un objeto `TaskSignals` (con opciones configurables). Orden de prioridad:

1. **Señales explícitas** — devuelve el tipo directamente:
   - `isRefactor` → `REFACTOR`
   - `isMultistep` → `MULTISTEP`
   - `hasTerminalCommands` → `TERMINAL`
   - `isRepositorySearch` → `REPOSITORY_SEARCH`
2. **Tamaño de contexto** — delega a `classifyContextSize`: si supera el umbral (1 MB / 5 MB) → `LARGE_CONTEXT`
3. **Muchos archivos** — `fileCount >= manyFilesThreshold` (default 8) → `REPOSITORY_SEARCH`
4. **Tarea pequeña** — `fileCount <= 3`, contexto pequeño y pocas tool calls esperadas → `SMALL_CODE`
5. **Fallback** → `UNKNOWN`

Los umbrales (`largeContextThresholdBytes`, `extremeContextThresholdBytes`, `manyFilesThreshold`) se definen en `DEFAULTS` (task-classifier.ts:12) y pueden sobrescribirse vía `opts`.

Consumidores principales: `src/index.ts:44` (router) y `src/mcp-server.ts` (vía import dinámico de `classifyContextSize`).

## Metricas

- tokens_input: 27187
- tokens_output: 499
- tokens_reasoning: 38
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 27724
- cost_usd: 0
- tool_calls: 2
- tools_usadas: semble_search, read
- assistant_messages: 3
