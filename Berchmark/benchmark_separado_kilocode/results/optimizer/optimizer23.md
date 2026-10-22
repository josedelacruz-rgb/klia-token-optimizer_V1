# Prueba 23 - EMPAQUETADO_REPO

**Prompt:** Dame una vision global del modulo src/scorer/ con sus archivos y su responsabilidad.
**Categoria:** EMPAQUETADO_REPO
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:51:18Z
**Duracion:** 82s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

# `src/scorer/` — Visión global

Módulo encargado de **medir coste** y **generar reporting**. Dos archivos, dos responsabilidades complementarias:

## `expected-cost-scorer.ts` (107 líneas) — Scoring v1 (legacy)
Función de coste y matriz de costes sobre `ExecutionRecord` (esquema v1). Lo consume el **selector adaptativo** (`optimizer-selector.ts`) para elegir el optimizador barato.

| Export | Rol |
|---|---|
| `computeRecordCost(record, opts)` | Coste absoluto de un registro: `tokens + latency·latencyWeight + toolingCost·toolingCostWeight + failurePenalty (si failed) + qualityPenalty·(1−quality)` |
| `computeRelativeCost(records, optimizer, opts)` → `CostScore` | Promedio del optimizador vs BASELINE; `Infinity` si no hay muestras |
| `buildCostMatrix(records, opts)` → `Map<modelo::tarea, Map<Optimizer, CostScore>>` | Agrupa registros por `(modelo, tarea)` y calcula el `CostScore` de cada optimizador |
| `keyFor(model, taskType)` | Helper de clave `modelo::tarea` |

`CostScore = { absoluteCost, relativeCost, sampleCount }`.

## `stats-report.ts` (565 líneas) — Reporting v2 (esquema unificado `RouterEvent`)
Genera el reporte enriquecido que devuelve `get_router_stats` (format=v2). Reimplementa la misma fórmula de coste sobre `RouterEvent` (`computeEventCost`, líneas 124-139) para no depender del store legacy.

**Tipos ricos de salida:**
- `OptimizerCell` — celda por optimizador: tokens (totales, input, output), latencia, calidad, failureRate, coste absoluto, relativeCost, savingsTokens/%/Usd, `verdict` (AHORRO/PERDIDA/NEUTRO), `winner`.
- `ModelTaskRow` — combinación `(modelo, tarea)` con baseline + celdas + `bestOptimizer`.
- `ModelRow` — agregado por modelo con ahorro ponderado vs BASELINE.
- `RouterStatsReport` — 5 bloques: `summary`, `byModel`, `byModelTask`, `globalSavings`, `confidenceCalibration`.

**`buildStatsReport(events, opts)`** (líneas 179-556) orquesta todo:
1. Filtra `executions` y `decisions` de los eventos.
2. `summary`: totales, modelos/familias/tareas únicos, rango de fechas, nivel de confianza (Insuficiente/Bajo/Medio/Alto según nº de ejecuciones), decisiones huérfanas vs emparejadas.
3. `byModelTask`: agrupa por `(modelo, tarea)` → por optimizador; calcula baseline, savings en tokens/%/USD (vía `pricing/model-pricing`), verdict y marca `winner` (solo si `samples >= minSamples` y `savingsPercent > 0`).
4. `byModel`: mejor optimizador por mayoría de `bestOptimizer` en `byModelTask`; ahorro ponderado.
5. `globalSavings`: suma ponderada de **todos** los optimizadores no-baseline con samples suficientes (no solo ganadores → si el router empeora, ahorro negativo). Veredicto literal de 4 niveles (≥15% / ≥5% / ≥0% / <0%).
6. `confidenceCalibration`: empareja `decision`+`execution` por `sessionId`, calcula `calibrationScore = 1 − |confianza_declarada − calidad_real| − failureRateHighConfidence`, veredicto de 3 niveles.

## Relación entre ambos
- **v1** (`expected-cost-scorer`) alimenta la decisión en caliente (selector).
- **v2** (`stats-report`) alimenta el reporting y la validación de la confianza del router.
- Misma fórmula de coste, dos tipos de entrada (`ExecutionRecord` vs `RouterEvent`), para que el router adaptativo siga aprendiendo del store legacy mientras el reporting evoluciona sobre el esquema unificado.

Consumidores principales: `src/mcp-server.ts` (importa ambos) y `src/selector/optimizer-selector.ts` (importa `expected-cost-scorer`).

## Metricas

- tokens_input: 35319
- tokens_output: 1301
- tokens_reasoning: 164
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 36784
- cost_usd: 0
- tool_calls: 4
- tools_usadas: read, semble_search, read, read
- assistant_messages: 3
