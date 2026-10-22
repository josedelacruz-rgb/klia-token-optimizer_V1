# Prueba 01 - BUSQUEDA_FUNCION

**Prompt:** Busca la funcion classifyTask en este codigo y muestrame donde esta y que hace.
**Categoria:** BUSQUEDA_FUNCION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:25:22Z
**Duracion:** 48s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

## Función `classifyTask`

**Ubicación:** `src/classifier/task-classifier.ts:45-102`

**Qué hace:** Clasifica una tarea entrante en uno de los tipos del router (`TaskType`) a partir de las señales de la tarea (`TaskSignals`), aplicando un orden de prioridad estricto:

| Prioridad | Señal | Tipo devuelto |
|-----------|-------|---------------|
| 1 | `isRefactor` | `REFACTOR` |
| 2 | `isMultistep` | `MULTISTEP` |
| 3 | `hasTerminalCommands` | `TERMINAL` |
| 4 | `isPackaging` | `REPO_PACKAGING` |
| 5 | `isRepositorySearch` + `isLiteralSearch` | `LITERAL_SEARCH` |
| 6 | `isRepositorySearch` | `REPOSITORY_SEARCH` |
| 7 | Contexto ≥ 1 MB | `LARGE_CONTEXT` |
| 8 | `fileCount ≥ 8` | `REPOSITORY_SEARCH` |
| 9 | ≤3 archivos + contexto pequeño + pocas tool calls | `SMALL_CODE` |
| — | (ninguna señal) | `UNKNOWN` |

**Cómo encaja en el sistema:**
- Llamada desde `src/index.ts:44` para determinar el `taskType` antes de seleccionar el optimizador.
- El `taskType` se pasa a `candidatesForTask()` (`src/rules/base-rules.ts`) que devuelve los optimizadores candidatos ordenados por prioridad (los priors de la tabla de evidencia del AGENTS.md).
- El selector (`src/selector/exploration.ts`) usa ese orden + el histórico para elegir el ganador.

**Orden de prioridad justificado (comentarios en el código):**
- `REPO_PACKAGING` va antes que `REPOSITORY_SEARCH`: empaquetar = *generar* un paquete (territorio REPOMIX), no buscar.
- `LITERAL_SEARCH` se separa de `REPOSITORY_SEARCH`: un grep nativo resuelve búsquedas de texto literal con coste mínimo; mandarlas a un buscador semántico (SEMBLE) es sobrecoste sin ganancia. El discriminador es `isLiteralSearch` (cue de literalidad SIN identificador de código).

**Umbral por defecto** (`DEFAULTS`):
- Contexto grande: 1 MB (`largeContextThresholdBytes`)
- Contexto extremo: 5 MB (`extremeContextThresholdBytes`)
- Muchos archivos: 8 (`manyFilesThreshold`)

Estos umbrales son configurables vía `TaskClassifierOptions`.

## Metricas

- tokens_input: 26259
- tokens_output: 728
- tokens_reasoning: 160
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 27147
- cost_usd: 0
- tool_calls: 2
- tools_usadas: semble_search, read
- assistant_messages: 3
