# Prueba 07 - DOCUMENTACION

**Prompt:** Explica que hace el modulo src/classifier/ y lista sus archivos principales con una linea de descripcion cada uno.
**Categoria:** DOCUMENTACION
**TaskType:** LARGE_CONTEXT
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-21T14:26:16Z
**Duracion:** 71s
**Estado:** success

## Respuesta

## Módulo `src/classifier/`

**Propósito:** Clasifica cada tarea entrante en uno de los `TaskType` del router (REFACTOR, MULTISTEP, TERMINAL, REPOSITORY_SEARCH, LARGE_CONTEXT, SMALL_CODE, UNKNOWN) a partir de `TaskSignals` (banderas explícitas) o heurísticas sobre la query, el tamaño de contexto y el número de archivos. Es el primer paso del pipeline: el resultado de la clasificación determina qué reglas y candidatos de optimizador aplican después el selector.

### Archivos principales

- **`task-classifier.ts`** — Implementa `classifyTask` (prioridad de señales → heurísticas → fallback UNKNOWN), `classifyContextSize` (large vs large extremo para priorizar SEMBLE) y `extractSignalsFromQuery` (extrae señales heurísticas desde texto EN/ES).

Es el único archivo del módulo.

## Metricas

- tokens_input: 19551
- tokens_output: 323
- tokens_reasoning: 61
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 19935
- cost_usd: 0
- tool_calls: 2
- tools_usadas: glob, read
- assistant_messages: 3
