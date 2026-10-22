# Prueba 27 - DOCUMENTACION

**Prompt:** Explica la arquitectura del router: como interactuan el clasificador, las reglas y el selector.
**Categoria:** DOCUMENTACION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T09:16:49Z
**Duracion:** 143s
**Estado:** success

## Respuesta

Voy a explorar los módulos clave para responder con precisión.Tengo el panorama completo. La arquitectura sigue un pipeline de 3 etapas:

## Flujo del router

```
RouterContext (model + signals)
        │
        ▼
┌───────────────────┐    ┌─────────────────┐    ┌──────────────────────┐
│  CLASIFICADOR     │ -> │    REGLAS        │ -> │      SELECTOR         │
│  classifyTask()   │    │  BASE_RULES       │    │  selectOptimizer()    │
│  task-classifier  │    │  base-rules.ts    │    │  exploration.ts        │
└───────────────────┘    └─────────────────┘    └──────────────────────┘
        │                       │                         │
   TaskType              Optimizer[] (candidatos)    RouterDecision
```

### 1. Clasificador (`src/classifier/task-classifier.ts`)

Convierte `TaskSignals` (booleans heurísticos + métricas) en un `TaskType`. Tiene dos partes:

- **`extractSignalsFromQuery`** (task-classifier.ts:141): parsea la query de texto con regex para inferir señales como `hasTerminalCommands`, `isRefactor`, `isMultistep`, `isRepositorySearch`, `isPackaging`, `isLiteralSearch`. Discrimina búsqueda semántica vs literal usando el identificador de código (CamelCase/snake_case) como cue.
- **`classifyTask`** (task-classifier.ts:45): aplica un **orden de prioridad estricto** — señales explícitas primero (`REFACTOR` > `MULTISTEP` > `TERMINAL` > `REPO_PACKAGING` > `LITERAL_SEARCH` > `REPOSITORY_SEARCH`), luego heurísticas por tamaño de contexto (`LARGE_CONTEXT`) y número de archivos, y finalmente `UNKNOWN` como fallback.
- **`isSmallTrivialTask`** (task-classifier.ts:123): un **gate previo** que rechaza enrutar tareas triviales (SMALL_CODE/UNKNOWN sin señales de coste) para ahorrar el overhead fijo del MCP.

La salida es un único `TaskType`.

### 2. Reglas base (`src/rules/base-rules.ts`)

Mapa estático `Record<TaskType, Optimizer[]>` que define los **candidatos ordenados por prioridad** (priors de la tabla de evidencia del AGENTS.md):

```
SMALL_CODE       -> [BASELINE]
TERMINAL         -> [RTK]
REPOSITORY_SEARCH-> [SEMBLE]
LITERAL_SEARCH   -> [BASELINE]
LARGE_CONTEXT    -> [SEMBLE, CONTEXT_MODE, REPOMIX]
REPO_PACKAGING   -> [REPOMIX, SEMBLE, CONTEXT_MODE]
MULTISTEP        -> [DCP]
REFACTOR         -> [RTK]
UNKNOWN          -> [BASELINE]
```

Dos funciones clave: `candidatesForTask` (lista completa) y `defaultOptimizerForTask` (primera opción = V0, el fallback seguro). Aquí **no hay tabla modelo × tarea × optimizador** — el modelo es variable de ajuste, no regla.

### 3. Selector (`src/selector/`)

Es la etapa que mezcla las reglas con la **evidencia histórica** para producir el `RouterDecision` final. Tiene dos capas:

**`optimizer-selector.ts` — núcleo de explotación (versiones V0→V2):**

- Consulta el histórico del `model + taskType` concreto.
- Si no hay datos del modelo → **herencia por familia** (`extractModelFamily`) con confianza reducida (`familyConfidenceWeight`) → V1.
- Si tampoco hay datos de familia → **V0**: devuelve el `defaultOptimizerForTask` con confianza 0.
- Si hay registros → `buildCostMatrix` + `computeRelativeCost` calcula el coste relativo de cada candidato. El optimizador con menor coste y confianza ≥ `minConfidence` gana (V2); si no llega a `minConfidence`, sigue siendo V1.
- **Cold-start anti-deadlock** (optimizer-selector.ts:155): si el default de la regla base nunca se ha ejecutado (sin muestras) y el ganador aprendido es BASELINE, se entrega el default para que pueda crear evidencia — evita el bucle "no se elige hasta tener muestras / no tiene muestras porque no se elige".

**`exploration.ts` — capa de exploración controlada (V3):**

Envuelve a `selectOptimizer` y añade exploración ε-greedy sobre `explorationRate`:

- Si la confianza es alta → explota, **salvo** que haya candidatos con `minSamples` insuficiente en una celda madura: con probabilidad `explorationRate` prueba uno de esos *under-sampled* para acumular evidencia (evita el mismo deadlock en celda madura).
- Si la confianza es baja y el azar cae fuera de `explorationRate` → **fallback seguro** a la regla base.
- Si cae dentro → prueba un **candidato no explorado** (distinto de BASELINE y de los ya intentados) para acumular datos.

### Coordinación (`src/index.ts:43` `route`)

`createAdaptiveRouter.route()` orquesta las tres etapas:

1. `classifyTask(ctx.signals)` → `taskType`
2. si `enableExploration` → `selectOptimizerWithExploration` (que internamente llama a `selectOptimizer`)
3. si no → `selectOptimizer` directo
4. tras ejecutar, `recordExecution` añade el resultado al histórico, **retroalimentando** al selector para futuras decisiones.

### Resumen de la interacción

| Etapa | Input | Output | Decide con | Versión |
|-------|-------|--------|-----------|---------|
| Clasificador | `TaskSignals` | `TaskType` | heurísticas de texto | — |
| Reglas | `TaskType` | `Optimizer[]` ordenado | evidencia estática (priors) | V0 default |
| Selector | `model+taskType`+histórico | `RouterDecision` | coste relativo + confianza | V0/V1/V2/V3 |

El clasificador **acota el espacio** de candidatos, las reglas aportan el **punto de partida razonado** y el selector **refina con evidencia real**. La regla base nunca se sobrescribe a ciegas: solo pierde cuando hay muestras suficientes con confianza ≥ umbral, y la exploración garantiza que los candidatos recomendados por regla base tengan oportunidad de acumular evidencia.

## Metricas

- tokens_input: 34087
- tokens_output: 1957
- tokens_reasoning: 108
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 36152
- cost_usd: 0
- tool_calls: 6
- tools_usadas: read, read, read, read, read, read
- assistant_messages: 3
