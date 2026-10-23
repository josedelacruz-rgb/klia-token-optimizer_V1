# Prueba 06 - EMPAQUETADO_REPO

**Prompt:** Genera un resumen del modulo src/pricing/ con todos sus archivos y funciones exportadas.
**Categoria:** EMPAQUETADO_REPO
**TaskType:** LARGE_CONTEXT
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T08:27:12Z
**Duracion:** 124s
**Estado:** success

## Respuesta

## Resumen del módulo `src/pricing/`

El módulo contiene un único archivo: **`model-pricing.ts`** (94 líneas). No existe `index.ts` barrel; las importaciones se hacen directamente desde `./pricing/model-pricing`.

### Tabla de pricing por modelo/familia

Precios en USD por 1M de tokens (datos aproximados, septiembre 2026). Define tres tablas internas (no exportadas):

- **`FAMILY_PRICING`** — pricing por familia: `glm`, `deepseek`, `kimi`, `qwen`, `mistral`, `magistral`, `ministral`, `minimax`, `nemotron`, `gemma`, `devstral`, `cosmos`, `ami`, `codestral`, `llama`, `claude`, `gpt`.
- **`MODEL_PRICING`** — sobrescribe al de familia para modelos exactos: `glm-5.2`, `glm-5.3-flash`, `deepseek-v4-pro`, `deepseek-v4-flash-demo`, `deepseek-v4.1-flash`, `kimi-k2.6`, `kimi-k2.7-code`, `mistral-large-3`, `mistral-medium`, `minimax-m3`, `gemma4`.
- **`FALLBACK_PRICING`** — `{ input: 1.0, output: 3.0 }` si no se encuentra modelo ni familia.

### Símbolos exportados

| Símbolo | Tipo | Descripción |
|---|---|---|
| `ModelPricing` | `interface` | `{ inputPerMillion: number; outputPerMillion: number }` |
| `getPricing(model, family?)` | `function` | Devuelve el `ModelPricing` siguiendo prioridad: modelo exacto (normalizado a minúsculas) → familia → fallback. |
| `computeCostUsd(inputTokens, outputTokens, model, family?)` | `function` | Calcula el coste en USD de una ejecución. Redondea a 6 decimales (`Math.round(x * 1e6) / 1e6`). |

### Consumidores

- `src/mcp-server.ts:28` — importa `computeCostUsd` (estima coste cuando `record_execution` no recibe `costUsd`).
- `src/router-cli.ts:13` — importa `computeCostUsd`.
- `src/scorer/stats-report.ts:8` — importa `computeCostUsd` y `getPricing` (usa el precio medio input/output como aproximación en el reporting).

## Metricas

- tokens_input: 48291
- tokens_output: 893
- tokens_reasoning: 387
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 49571
- cost_usd: 0
- tool_calls: 5
- tools_usadas: glob, read, bash, grep, glob
- assistant_messages: 6
