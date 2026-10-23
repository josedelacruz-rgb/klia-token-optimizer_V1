# Prueba 27 - DOCUMENTACION

**Prompt:** Explica la arquitectura del router: como interactuan el clasificador, las reglas y el selector.
**Categoria:** DOCUMENTACION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:59:53Z
**Duracion:** 103s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

# Arquitectura del router: clasificador → reglas → selector

El flujo es una pipeline de 3 etapas. La entrada es un `RouterContext` (`{model, signals}`) y la salida un `RouterDecision` (`{optimizer, version, reason, confidence, ...}`). El orquestador es `createAdaptiveRouter` en `src/index.ts:43`.

## 1. Clasificador — `src/classifier/task-classifier.ts`

`classifyTask(signals)` traduce señales heurísticas a un `TaskType` discreto. Decide **qué tipo de tarea es**, sin saber nada de optimizadores.

Orden de prioridad (`task-classifier.ts:45`):
1. Señales explícitas: `isRefactor` → `REFACTOR`, `isMultistep` → `MULTISTEP`, `hasTerminalCommands` → `TERMINAL`, `isPackaging` → `REPO_PACKAGING`.
2. Búsqueda: `isRepositorySearch && isLiteralSearch` → `LITERAL_SEARCH`; solo `isRepositorySearch` → `REPOSITORY_SEARCH`.
3. Heurísticas de tamaño: `contextSizeBytes ≥ 1MB` → `LARGE_CONTEXT` (≥5MB → `LARGE_CONTEXT_EXTREME`).
4. Fallbacks: `fileCount ≥ 8` → `REPOSITORY_SEARCH`; tarea pequeña → `SMALL_CODE`; resto → `UNKNOWN`.

Las señales las extrae `extractSignalsFromQuery` (`task-classifier.ts:141`) por regex sobre la query (ES/EN), con `base` explícito que tiene prioridad. Hay un gate auxiliar `isSmallTrivialTask` que rechaza enrutar tareas sin señal de coste (las deja en herramientas nativas).

## 2. Reglas base — `src/rules/base-rules.ts`

`BASE_RULES` (`base-rules.ts:17`) es un mapa `TaskType → Optimizer[]` **ordenado por prioridad**. Codifica los priors de la tabla de evidencia del AGENTS.md:

| TaskType | Candidatos (orden = preferencia) |
|---|---|
| `REPOSITORY_SEARCH` | `SEMBLE` |
| `TERMINAL` / `REFACTOR` | `RTK` |
| `REPO_PACKAGING` | `REPOMIX, SEMBLE, CONTEXT_MODE` |
| `LARGE_CONTEXT` | `SEMBLE, CONTEXT_MODE, REPOMIX` |
| `MULTISTEP` | `DCP` |
| `SMALL_CODE` / `LITERAL_SEARCH` / `UNKNOWN` | `BASELINE` |

Dos helpers: `candidatesForTask(t)` devuelve la lista; `defaultOptimizerForTask(t)` el primero (el fallback cuando no hay evidencia). Las reglas **acotan el espacio de búsqueda** del selector — nunca se considera un optimizador que no esté en la lista del tipo de tarea.

## 3. Selector — `src/selector/optimizer-selector.ts` + `exploration.ts`

Es donde la evidencia histórica puede **reemplazar** el prior de la regla base. Hay dos modos, decididos en `index.ts:52`:

### `selectOptimizer` (explotación pura) — `optimizer-selector.ts:26`

1. Obtiene `candidates = candidatesForTask(taskType)` y `baseline = defaultOptimizerForTask(taskType)`.
2. `history.query(model, taskType)`:
   - **Vacío** → prueba la familia (`extractModelFamily(model)`); si también vacío → **V0**: devuelve el `baseline` con `confidence: 0`.
   - **Solo familia** → **V1**: usa esos registros con confianza reducida por `familyConfidenceWeight`.
   - **Del modelo** → **V2**.
3. `selectFromRecords` (`:79`): construye la matriz de coste (`buildCostMatrix`), filtra por `candidates`, calcula `relativeCost` y `confidenceFromSamples` para cada uno, y elige el de menor coste **con `confidence ≥ minConfidence`**.
4. **Cold-start** (`:155`): si el ganador aprendido es `BASELINE` pero el `baseline` de la regla base nunca se ejecutó, lo entrega para que genere evidencia (evita deadlock "sin muestras nunca se elige").
5. Si ningún candidato alcanza `minConfidence` → fallback al baseline.

Las versiones (`V0`/`V1`/`V2`) codifican el nivel de evidencia: ninguna → familia → modelo.

### `selectOptimizerWithExploration` (V3) — `exploration.ts:16`

Envuelve a `selectOptimizer` y añade exploración ε-greedy controlada por `explorationRate`:

- Si `baseDecision.confidence ≥ minConfidence` (celda madura): explota, **salvo** que haya candidatos de la regla base con `sampleCount < minSamples` — en ese caso, con probabilidad `explorationRate`, prueba uno para romper el mismo deadlock del cold-start (`exploration.ts:34`).
- Si confianza insuficiente: con probabilidad `1 - explorationRate` cae al `defaultOptimizerForTask` seguro; con `explorationRate` prueba un candidato **no explorado aún** (`unexplored`).

Devuelve `ExplorationResult` con `explored` y `exploitedOptimizer` (lo que habría elegido la pura explotación) para auditar la decisión.

## Cierre del bucle

`recordExecution(record)` (`index.ts:72`) añade el `ExecutionRecord` al `JsonHistoryStore`. Esa evidencia es la que `selectOptimizer` consultará en futuras llamadas para el mismo par `model × taskType`, de modo que las reglas base son solo el punto de partida y la evidencia real acaba dominando cuando haya `≥ minSamples` con `≥ minConfidence`.

## Resumen del acoplamiento

```
RouterContext ─► classifyTask ─► TaskType
                                   │
                                   ▼
                      candidatesForTask / defaultOptimizerForTask
                                   │  (acota + aporta fallback)
                                   ▼
            selectOptimizerWithExploration ─► selectOptimizer
                  │                              │
                  │ exploration ε-greedy         │ history.query(model,taskType)
                  │ (V3)                         │ → V0 / V1 / V2 según evidencia
                  ▼                              ▼
                          RouterDecision ◄─── coste relativo + confianza
                                   │
                   recordExecution ─► JsonHistoryStore (cierra el bucle)
```

- **Clasificador**: ignora optimizadores; solo etiqueta la tarea.
- **Reglas**: ignoran el modelo y el histórico; solo dan priors por tipo de tarea.
- **Selector**: une ambos con el histórico; el prior de la regla es el fallback y el acotador, pero la evidencia decide cuando hay suficiente confianza.

## Metricas

- tokens_input: 32606
- tokens_output: 1953
- tokens_reasoning: 390
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 34949
- cost_usd: 0
- tool_calls: 6
- tools_usadas: read, glob, read, read, read, read
- assistant_messages: 3
