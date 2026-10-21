# Prueba 07 - DOCUMENTACION

**Prompt:** Explica que hace el modulo src/classifier/ y lista sus archivos principales con una linea de descripcion cada uno.
**Categoria:** DOCUMENTACION
**TaskType:** LARGE_CONTEXT
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-21T16:44:12Z
**Duracion:** 49s
**Estado:** success
**Router KLIA:** BASELINE/SMALL_CODE (refused -> native)

## Respuesta

## `src/classifier/` — Clasificación de tareas

Determina el **tipo de tarea** (`TaskType`) a partir de señales (`TaskSignals`) para que el router pueda elegir el optimizador de contexto adecuado. Es la entrada del pipeline: sin clasificación no hay enrutado.

### Archivos principales

- **`task-classifier.ts`** — Único archivo del módulo. Contiene:
  - `classifyTask`: asigna un `TaskType` (REFACTOR, MULTISTEP, TERMINAL, REPOSITORY_SEARCH, LARGE_CONTEXT, SMALL_CODE, UNKNOWN) aplicando prioridad: señales explícitas → heurísticas de tamaño/archivos → fallback UNKNOWN.
  - `classifyContextSize`: clasifica el contexto como `LARGE_CONTEXT` o `LARGE_CONTEXT_EXTREME` (umbral 1 MB / 5 MB) para que el selector priorice SEMBLE en casos extremos.
  - `isSmallTrivialTask`: gate que devuelve `true` cuando la tarea no tiene señales de coste, para ejecutarla con herramientas nativas sin cargar el router/MCP.
  - `extractSignalsFromQuery`: heurística que inspecciona la query de texto (regex EN/ES) para inferir `hasTerminalCommands`, `isMultistep`, `isRefactor`, `isRepositorySearch` (incluye detección de "empaqueta/compacta/repomix").

Configurable vía `TaskClassifierOptions` (umbrales de bytes y archivos).

## Metricas

- tokens_input: 25082
- tokens_output: 447
- tokens_reasoning: 41
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 25570
- cost_usd: 0
- tool_calls: 2
- tools_usadas: glob, read
- assistant_messages: 3
