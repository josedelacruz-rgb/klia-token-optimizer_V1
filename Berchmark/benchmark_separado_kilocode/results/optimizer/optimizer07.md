# Prueba 07 - DOCUMENTACION

**Prompt:** Explica que hace el modulo src/classifier/ y lista sus archivos principales con una linea de descripcion cada uno.
**Categoria:** DOCUMENTACION
**TaskType:** LARGE_CONTEXT
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-21T15:42:53Z
**Duracion:** 41s
**Estado:** success

## Respuesta

## Módulo `src/classifier/`

Responsable de **clasificar una tarea** en una de las categorías del router (`TaskType`: `REFACTOR`, `MULTISTEP`, `TERMINAL`, `REPOSITORY_SEARCH`, `LARGE_CONTEXT`, `SMALL_CODE`, `UNKNOWN`) y de **extraer señales heurísticas** a partir de la query de texto, para que el selector pueda decidir el optimizador adecuado sin intervención manual.

### Archivo principal

- **`src/classifier/task-classifier.ts`** — Clasifica una tarea a partir de `TaskSignals` aplicando un orden de prioridad (señales explícitas → heurísticas de tamaño/contexto → fallback a `UNKNOWN`); también expone `classifyContextSize` (distingue `LARGE_CONTEXT` vs `LARGE_CONTEXT_EXTREME` para priorizar SEMBLE) y `extractSignalsFromQuery` (detecta patrones en español/inglés para inferir `hasTerminalCommands`, `isMultistep`, `isRefactor`, `isRepositorySearch`).

Es el único archivo del módulo. Sus umbrales por defecto: contexto grande ≥ 1 MB, extremo ≥ 5 MB, "muchos archivos" ≥ 8.

## Metricas

- tokens_input: 24472
- tokens_output: 393
- tokens_reasoning: 43
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 24908
- cost_usd: 0
- tool_calls: 2
- tools_usadas: glob, read
- assistant_messages: 3
