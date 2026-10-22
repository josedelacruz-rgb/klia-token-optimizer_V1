# Prueba 23 - EMPAQUETADO_REPO

**Prompt:** Dame una vision global del modulo src/scorer/ con sus archivos y su responsabilidad.
**Categoria:** EMPAQUETADO_REPO
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T09:05:06Z
**Duracion:** 161s
**Estado:** success

## Respuesta

# Visión global de `src/scorer/`

Es el módulo de **función de coste y reporting**: cuantifica cuánto "cuesta" cada optimizador (tokens + latencia + tooling + fallos + calidad), lo compara contra `BASELINE` y produce reportes para decidir/auditar al router.

## Archivos

### `expected-cost-scorer.ts` (107 líneas) — camino v1 sobre `ExecutionRecord`

Funciones puras de coste, usadas por el **router adaptativo** para seguir aprendiendo con datos legacy:

- `computeRecordCost` (l.22): coste absoluto de un registro.
  `tokens + latency×weight + toolingCost×weight + failurePenalty + qualityPenalty×(1−quality)`.
- `computeRelativeCost` (l.43): coste medio del optimizador vs `BASELINE` para una `(modelo, tarea)`; devuelve `CostScore` (`absoluteCost`, `relativeCost`, `sampleCount`). `Infinity` si no hay muestras/baseline.
- `buildCostMatrix` (l.76): agrupa registros por `${model}::${taskType}` y devuelve un `Map` con el `CostScore` de cada optimizador. Es la tabla de decisión del router v1.
- `keyFor` (l.105): helper de clave `model::taskType`.

### `stats-report.ts` (565 líneas) — reporting enriquecido v2 sobre `RouterEvent`

Sustituye al formato legacy para `get_router_stats` (format=v2). Mismo espíritu de coste, pero con celdas ricas y bloques de auditoría:

- `computeEventCost` (l.124): equivalente v2 de `computeRecordCost`, sobre `RouterEvent.execution` (usa `totalTokens` o `input+output`).
- `aggregateExecutions` (l.152): suma de muestras, tokens (totales/in/out), latencia, calidad y fallos por grupo.
- `buildStatsReport` (l.179): núcleo del reporte. Produce 4 bloques:
  - **`summary`**: totales (decisiones/ejecuciones), conteo real vs sintético, modelos/familias/tareas únicos, rango de fechas, nivel de confianza (`Insuficiente`→`Alto`) y decisiones huérfanas vs emparejadas por `sessionId`.
  - **`byModel`**: por modelo, métricas medias, mejor optimizador (por nº de victorias) y ahorro ponderado vs baseline.
  - **`byModelTask`**: la tabla rica. Una fila por `(modelo, tarea)` con `baseline` y celdas `OptimizerCell` (tokens in/out, latencia, calidad, `failureRate`, coste absoluto, `relativeCost`, ahorro en tokens/%/USD, `verdict` `AHORRO|PERDIDA|NEUTRO` y flag `winner`). El ganador necesita `samples ≥ minSamples` y ahorro real positivo.
  - **`globalSavings`**: ahorro ponderado global (% tokens, tokens y USD) con veredicto literal (umbral 15%/5%/0%/negativo).
  - **`confidenceCalibration`**: empareja decisión+ejecución por `sessionId`, compara confianza declarada vs calidad real, tasa de fallo en alta confianza y `calibrationScore` 0..1 con veredicto.
- Helpers `round1`/`round3` (l.558): redondeo sin romper `Infinity`.

Dependencia externa: `../pricing/model-pricing` (`getPricing`, `computeCostUsd`) para convertir ahorro de tokens a USD usando el precio medio input/output del modelo.

## Cómo encajan ambos archivos

| Aspecto | `expected-cost-scorer.ts` (v1) | `stats-report.ts` (v2) |
|---|---|---|
| Esquema de entrada | `ExecutionRecord` | `RouterEvent` |
| Salida | `CostScore` / matriz simple | `RouterStatsReport` (4 bloques) |
| Uso | Aprendizaje del router adaptativo | Reporting `get_router_stats` format=v2 |
| Monetización | No | Sí (USD vía `model-pricing`) |
| Auditoría de confianza | No | Sí (calibración + huérfanos) |

Ambos coexisten por diseño (AGENTS.md §9): el v1 sigue alimentando al selector, el v2 aporta el reporting enriquecido y la auditoría de confianza. Para extender la función de coste hay que tocar **ambos** (`computeRecordCost` y `computeEventCost`) y, si se añaden pesos, `DEFAULT_ROUTER_OPTIONS` en `src/types.ts`.

## Metricas

- tokens_input: 27954
- tokens_output: 1287
- tokens_reasoning: 407
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 29648
- cost_usd: 0
- tool_calls: 3
- tools_usadas: read, read, read
- assistant_messages: 3
