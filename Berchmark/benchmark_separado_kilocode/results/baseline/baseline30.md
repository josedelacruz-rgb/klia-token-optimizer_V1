# Prueba 30 - DOCUMENTACION

**Prompt:** Como funciona el coste relativo? Explicame computeRelativeCost con un ejemplo.
**Categoria:** DOCUMENTACION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T09:25:27Z
**Duracion:** 156s
**Estado:** success

## Respuesta

## Cómo funciona `computeRelativeCost`

Está en `src/scorer/expected-cost-scorer.ts:43`. Compara el coste medio de un optimizador contra el del `BASELINE` para la misma celda (modelo, tarea). El resultado es **adimensional**: un ratio que se interpreta así:

- `< 1` → el optimizador es más barato que el baseline (mejor).
- `= 1` → igual al baseline.
- `> 1` → peor que el baseline.
- `Infinity` → sin observaciones del optimizador o sin baseline normalizable.

### Pasos internos

1. Filtra los registros del optimizador y los del `BASELINE` del grupo recibido (`expected-cost-scorer.ts:48-49`).
2. Si no hay registros del optimizador → `{absoluteCost: Infinity, relativeCost: Infinity, sampleCount: 0}` (`:51-53`).
3. Calcula `avgOptimizerCost` = media de `computeRecordCost` sobre los registros del optimizador (`:55-57`).
4. Calcula `avgBaselineCost` = media del baseline; si no hay baseline, usa `avgOptimizerCost` (con lo que `relativeCost = 1`, neutro) (`:59-62`).
5. `relativeCost = avgOptimizerCost / avgBaselineCost` (`:64`).

`computeRecordCost` (la base) suma: `tokens + latency*latencyWeight + toolingCost*toolingCostWeight + failurePenalty (si failed) + qualityPenalty*(1 - quality)` (`:22-35`).

### Ejemplo numérico (del test `expected-cost-scorer.test.ts:77-91`)

Opciones: `latencyWeight=1, toolingCostWeight=1, failurePenalty=5, qualityPenalty=3`.

| Registro | tokens | latency | toolingCost | quality | failed |
|---|---|---|---|---|---|
| BASELINE | 10000 | 100 | 0 | 0.98 | false |
| DCP | 8000 | 100 | 0.5 | 0.98 | false |

Coste absoluto de cada uno:

```
BASELINE = 10000 + 100*1 + 0*1 + 0 + 3*(1-0.98) = 10100.06
DCP      =  8000 + 100*1 + 0.5*1 + 0 + 3*(1-0.98) =  8100.56
```

Medias (1 muestra cada uno):

```
avgBaselineCost = 10100.06
avgOptimizerCost =  8100.56
relativeCost = 8100.56 / 10100.06 ≈ 0.802
```

**Interpretación:** `relativeCost ≈ 0.80` → DCP cuesta ~80% del baseline, es decir, ~20% de ahorro para esa celda. Como `< 1`, el selector lo verá como candidato ganador frente a `BASELINE`. El test lo verifica con `expect(score.relativeCost).toBeLessThan(1)` y `sampleCount === 1`.

### Notas de diseño relevantes

- El ratio es **comparable entre modelos y tareas** aunque sus escalas de tokens sean muy distintas: por eso el selector lo usa en lugar del coste absoluto.
- Si solo hay muestras del optimizador y ninguna del baseline, el coste relativo se fija en `1` (neutro) en vez de `Infinity`, para no descartar al optimizador por falta de baseline (`:59-62`). El `Infinity` real solo aparece cuando faltan muestras del propio optimizador.
- Los pesos vienen de `DEFAULT_ROUTER_OPTIONS` (`src/types.ts:124`): `latencyWeight=1, toolingCostWeight=1, failurePenalty=5, qualityPenalty=3`. Cambiarlos recala todos los costes a la vez.

## Metricas

- tokens_input: 38041
- tokens_output: 1232
- tokens_reasoning: 443
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 39716
- cost_usd: 0
- tool_calls: 5
- tools_usadas: grep, grep, read, read, grep
- assistant_messages: 5
