# Prueba 01 - BUSQUEDA_FUNCION

**Prompt:** Busca la funcion classifyTask en este codigo y muestrame donde esta y que hace.
**Categoria:** BUSQUEDA_FUNCION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-23T07:23:32Z
**Duracion:** 49s
**Estado:** success

## Respuesta

## `classifyTask`

**Ubicación:** `src/classifier/task-classifier.ts:45`

Es el clasificador principal del router. Recibe `TaskSignals` (señales heurísticas de la tarea) y devuelve un `TaskType` que el selector usará para elegir el optimizador.

**Qué hace** (en orden de prioridad, primer match gana):

1. `isRefactor` → `REFACTOR` (task-classifier.ts:51)
2. `isMultistep` → `MULTISTEP` (task-classifier.ts:55)
3. `hasTerminalCommands` → `TERMINAL` (task-classifier.ts:59)
4. `isPackaging` → `REPO_PACKAGING` (task-classifier.ts:66) — va antes que búsqueda: el agente *genera* el paquete, no busca.
5. `isRepositorySearch && isLiteralSearch` → `LITERAL_SEARCH` (task-classifier.ts:75) — grep nativo resuelve texto literal más barato que un saver semántico.
6. `isRepositorySearch` → `REPOSITORY_SEARCH` (task-classifier.ts:79)
7. Contexto grande (`classifyContextSize`) → `LARGE_CONTEXT` (task-classifier.ts:83)
8. `fileCount >= manyFilesThreshold` (8) → `REPOSITORY_SEARCH` (task-classifier.ts:88)
9. Contexto pequeño con pocos archivos y pocas tool calls → `SMALL_CODE` (task-classifier.ts:93)
10. Fallback → `UNKNOWN` (task-classifier.ts:101)

**Opciones configurables** (`TaskClassifierOptions`, con defaults): `largeContextThresholdBytes` (1 MB), `extremeContextThresholdBytes` (5 MB), `manyFilesThreshold` (8).

**Relación con el resto:**
- `classifyContextSize` (task-classifier.ts:31) es un helper interno que distingue `LARGE_CONTEXT` vs `LARGE_CONTEXT_EXTREME` (este último prioriza SEMBLE).
- `isSmallTrivialTask` (task-classifier.ts:123) usa `classifyTask` como gate: si no hay señales de coste y el tipo es `UNKNOWN`/`SMALL_CODE`, la tarea se ejecuta sin enrutar por el router.
- `extractSignalsFromQuery` (task-classifier.ts:141) construye `TaskSignals` a partir de texto con regex (castellano e inglés), detectando terminal, multistep, refactor, packaging, búsqueda literal vs semántica (vía `hasCodeIdentifier`), visión global y文档ación/onboarding.

Es el componente de entrada de la arquitectura: clasifica primero para que el selector y las reglas base (`src/rules/base-rules.ts`) decidan después.

## Metricas

- tokens_input: 31710
- tokens_output: 921
- tokens_reasoning: 52
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 32683
- cost_usd: 0
- tool_calls: 4
- tools_usadas: grep, grep, glob, read
- assistant_messages: 4
