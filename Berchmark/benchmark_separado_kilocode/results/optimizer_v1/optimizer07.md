# Prueba 07 - DOCUMENTACION

**Prompt:** Explica que hace el modulo src/classifier/ y lista sus archivos principales con una linea de descripcion cada uno.
**Categoria:** DOCUMENTACION
**TaskType:** LARGE_CONTEXT
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:29:11Z
**Duracion:** 39s
**Estado:** success
**Router KLIA:** BASELINE/LITERAL_SEARCH

## Respuesta

## `src/classifier/`

Módulo encargado de **clasificar la tarea entrante en uno de los `TaskType` del router** antes de que el selector elija un optimizador. Es la puerta de entrada del pipeline: convierte señales sueltas (`TaskSignals`) en una categoría discreta (`REFACTOR`, `MULTISTEP`, `TERMINAL`, `REPO_PACKAGING`, `REPOSITORY_SEARCH`, `LITERAL_SEARCH`, `LARGE_CONTEXT`, `SMALL_CODE` o `UNKNOWN`), aplicando un orden de prioridad fijo (señales explícitas → heurísticas de tamaño/archivos → fallback `UNKNOWN`).

### Archivos principales

| Archivo | Descripción |
|---|---|
| `task-classifier.ts` | Clasifica una tarea (`classifyTask`) en un `TaskType` por orden de prioridad, infiere señales desde una query de texto (`extractSignalsFromQuery`), mide el tamaño de contexto (`classifyContextSize`) y aplica un gate de tareas triviales (`isSmallTrivialTask`) para no enrutar trabajo que el overhead del router no compensa. |

Es el único archivo del módulo; todo el razonamiento heurístico (regex bilingües ES/EN, umbrales de bytes y número de archivos, discriminador literal-vs-semántico) vive ahí.

## Metricas

- tokens_input: 24762
- tokens_output: 446
- tokens_reasoning: 66
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 25274
- cost_usd: 0
- tool_calls: 2
- tools_usadas: read, read
- assistant_messages: 3
