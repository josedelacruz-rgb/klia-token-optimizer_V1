# Prueba 01 - BUSQUEDA_FUNCION

**Prompt:** Busca la funcion classifyTask en este codigo y muestrame donde esta y que hace.
**Categoria:** BUSQUEDA_FUNCION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-21T15:37:34Z
**Duracion:** 65s
**Estado:** success

## Respuesta

## `classifyTask`

**Ubicación:** `src/classifier/task-classifier.ts:45`

**Qué hace:** Clasifica una tarea en uno de los tipos del router (`TaskType`) a partir de un objeto `TaskSignals`, devolviendo la categoría que decide qué optimizador de contexto usar.

**Orden de prioridad (evalúa y retorna en el primer match):**
1. `isRefactor` → `REFACTOR`
2. `isMultistep` → `MULTISTEP`
3. `hasTerminalCommands` → `TERMINAL`
4. `isRepositorySearch` → `REPOSITORY_SEARCH`
5. Contexto grande (vía `classifyContextSize`: ≥1MB → `LARGE_CONTEXT`, ≥5MB → extremo) → `LARGE_CONTEXT`
6. `fileCount >= 8` (sin otras señales) → `REPOSITORY_SEARCH`
7. Tarea pequeña (`fileCount <= 3`, contexto < 1MB y `toolCallsExpected` bajo/ausente) → `SMALL_CODE`
8. Fallback → `UNKNOWN`

**Parámetros:**
- `signals: TaskSignals` — señales de contexto (flags booleanos + `fileCount`, `contextSizeBytes`, `toolCallsExpected`).
- `opts: TaskClassifierOptions` — umbrales configurables (por defecto: 1MB grande, 5MB extremo, 8 archivos).

**Uso:** Se importa en `src/index.ts:1213` y es el punto de entrada del clasificador del router. La función hermana `extractSignalsFromQuery` (línea 92) genera el `TaskSignals` a partir del texto de la query mediante heurísticas regex (ES/EN), para casos donde no se pasen señales explícitas.

## Metricas

- tokens_input: 37118
- tokens_output: 629
- tokens_reasoning: 407
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 38154
- cost_usd: 0
- tool_calls: 3
- tools_usadas: repomix_pack_codebase, repomix_grep_repomix_output, read
- assistant_messages: 4
