# Prueba 30 - DOCUMENTACION

**Prompt:** Como funciona el coste relativo? Explicame computeRelativeCost con un ejemplo.
**Categoria:** DOCUMENTACION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T08:04:18Z
**Duracion:** 67s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

## `computeRelativeCost` — Cómo funciona el coste relativo

Implementación: `src/scorer/expected-cost-scorer.ts:43`. Compara el coste medio de un optimizador contra el del `BASELINE` **para la misma celda (modelo, tarea)**.

### Fórmula

```
relativeCost = avgOptimizerCost / avgBaselineCost
```

donde cada coste se obtiene con `computeRecordCost` (líneas 22-35):

```
coste = tokens + latency·latencyWeight + toolingCost·toolingCostWeight
        + failurePenalty (si failed) + qualityPenalty·(1 − quality)
```

### Reglas de borde

| Caso | Resultado |
|---|---|
| No hay registros del optimizador | `{ absoluteCost: Infinity, relativeCost: Infinity, sampleCount: 0 }` |
| Sí hay del optimizador pero **no hay BASELINE** | Denominador = `avgOptimizerCost` → `relativeCost = 1` (no se puede normalizar; el selector cae a la regla V0) |
| Hay ambos | `avgOptimizerCost / avgBaselineCost` |

### Interpretación

- `< 1` → el optimizador es **más barato** que el baseline (ahorra).
- `= 1` → igual al baseline.
- `> 1` → más caro que el baseline (pierde).

### Ejemplo numérico

Datos para `glm-5.2::MULTISTEP` con `latencyWeight=1, toolingCostWeight=1, failurePenalty=5, qualityPenalty=3`:

**Registro BASELINE** (`tokens=10000, latency=100s, toolingCost=0, quality=0.98, failed=false`):
```
coste = 10000 + 100·1 + 0·1 + 0 + 3·(1−0.98) = 10100.06
```

**Registro DCP** (`tokens=8000, latency=100s, toolingCost=0.5, quality=0.98, failed=false`):
```
coste = 8000 + 100·1 + 0.5·1 + 0 + 3·(1−0.98) = 8100.56
```

Cálculo de `computeRelativeCost(records, 'DCP', opts)`:
```
avgOptimizerCost = 8100.56     (1 muestra)
avgBaselineCost  = 10100.06    (1 muestra)
relativeCost     = 8100.56 / 10100.06 ≈ 0.802
→ DCP cuesta ~80% del baseline → ahorra ~20%
```

Es justo el escenario del test `tests/scorer/expected-cost-scorer.test.ts:77`, que verifica `relativeCost < 1`.

### Dónde se usa

- `buildCostMatrix` (línea 97): construye la tabla `Map<"modelo::tarea", Map<Optimizer, CostScore>>` que alimenta el selector.
- `optimizer-selector.ts:100` y `:204`: el selector elige el optimizador con menor `relativeCost` cuando hay confianza suficiente (`minSamples`, `minConfidence`); si no, cae a la regla base V0.

### Trampa importante

Si **no hay ninguna ejecución BASELINE** registrada para esa celda, todos los optimizadores quedan en `relativeCost = 1` y el selector no puede discriminar → vuelve a la regla por defecto. Por eso el AGENTS.md recomienda registrar al menos una ejecución `BASELINE` por cada `(modelo, tarea)` para tener costes relativos significativos.

## Metricas

- tokens_input: 39907
- tokens_output: 1038
- tokens_reasoning: 69
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 41014
- cost_usd: 0
- tool_calls: 3
- tools_usadas: grep, read, read
- assistant_messages: 3
