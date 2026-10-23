# Prueba 07 - DOCUMENTACION

**Prompt:** Explica que hace el modulo src/classifier/ y lista sus archivos principales con una linea de descripcion cada uno.
**Categoria:** DOCUMENTACION
**TaskType:** LARGE_CONTEXT
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T08:29:16Z
**Duracion:** 75s
**Estado:** success

## Respuesta

El módulo `src/classifier/` es la puerta de entrada del router: clasifica cada tarea del agente en un `TaskType` a partir de señales (`TaskSignals`) extraídas de la query y del contexto, para que el selector sepa qué optimizador aplicar.

**Archivo principal:**

- `src/classifier/task-classifier.ts` — Implementa `classifyTask` (decide el tipo de tarea con prioridad de señales: REFACTOR → MULTISTEP → TERMINAL → REPO_PACKAGING → LITERAL_SEARCH → REPOSITORY_SEARCH → LARGE_CONTEXT → SMALL_CODE → UNKNOWN), `classifyContextSize` (umbral 1 MB / 5 MB para LARGE_CONTEXT / EXTREME), `isSmallTrivialTask` (gate que rechaza tareas triviales sin pasar por el router) y `extractSignalsFromQuery` (heurísticas de texto EN/ES para detectar refactor, multistep, terminal, empaquetado, búsqueda literal vs semántica y documentación).

## Metricas

- tokens_input: 22803
- tokens_output: 366
- tokens_reasoning: 45
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 23214
- cost_usd: 0
- tool_calls: 2
- tools_usadas: read, read
- assistant_messages: 3
