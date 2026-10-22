# Prueba 01 - BUSQUEDA_FUNCION

**Prompt:** Busca la funcion classifyTask en este codigo y muestrame donde esta y que hace.
**Categoria:** BUSQUEDA_FUNCION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T08:20:53Z
**Duracion:** 49s
**Estado:** success

## Respuesta

La función `classifyTask` está en `src/classifier/task-classifier.ts:45` y clasifica una tarea (a partir de `TaskSignals`) en uno de los tipos del router, siguiendo este orden de prioridad:

1. `isRefactor` → `REFACTOR`
2. `isMultistep` → `MULTISTEP`
3. `hasTerminalCommands` → `TERMINAL`
4. `isPackaging` → `REPO_PACKAGING` (generar paquete del repo, territorio REPOMIX)
5. `isRepositorySearch && isLiteralSearch` → `LITERAL_SEARCH` (grep nativo, sin SEMBLE)
6. `isRepositorySearch` → `REPOSITORY_SEARCH` (SEMBLE)
7. Contexto grande/extremo → `LARGE_CONTEXT`
8. `fileCount >= manyFilesThreshold` (8) → `REPOSITORY_SEARCH`
9. Pocos archivos (≤3), contexto pequeño y `toolCallsExpected` bajo → `SMALL_CODE`
10. Resto → `UNKNOWN`

Recibe `TaskSignals` (señales extraídas de la query y del entorno) y opciones configurables: umbrales de contexto grande (1 MB) y extremo (5 MB) y umbral de "muchos archivos" (8). Se usa desde `src/index.ts` (API pública) y la importa el test `tests/classifier/task-classifier.test.ts:4`.

Curiosidad: tu query es exactamente el caso del test `tests/classifier/task-classifier.test.ts:103`, que verifica que `"Busca la funcion classifyTask..."` cae en `REPOSITORY_SEARCH`.

## Metricas

- tokens_input: 23608
- tokens_output: 481
- tokens_reasoning: 30
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 24119
- cost_usd: 0
- tool_calls: 2
- tools_usadas: grep, read
- assistant_messages: 3
