# Prueba 06 - EMPAQUETADO_REPO

**Prompt:** Genera un resumen del modulo src/pricing/ con todos sus archivos y funciones exportadas.
**Categoria:** EMPAQUETADO_REPO
**TaskType:** LARGE_CONTEXT
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:28:29Z
**Duracion:** 42s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

# Resumen del módulo `src/pricing/`

El módulo contiene un único archivo: **`src/pricing/model-pricing.ts`** (94 líneas).

## Tipos exportados

### `ModelPricing` (interface)
- `inputPerMillion: number` — USD por 1M tokens de entrada.
- `outputPerMillion: number` — USD por 1M tokens de salida.

## Funciones exportadas

### `getPricing(model: string, family?: string): ModelPricing`
Devuelve el pricing aplicable a un modelo. Orden de prioridad:
1. Modelo exacto (normalizado a minúsculas) en `MODEL_PRICING`.
2. Familia del modelo en `FAMILY_PRICING`.
3. `FALLBACK_PRICING` genérico (`input: 1.0`, `output: 3.0`).

### `computeCostUsd(inputTokens, outputTokens, model, family?): number`
Calcula el coste en USD de una ejecución combinando `getPricing` con el conteo de tokens. El resultado se redondea a 6 decimales.

## Datos internos (no exportados)

- **`FAMILY_PRICING`**: 16 familias (`glm`, `deepseek`, `kimi`, `qwen`, `mistral`, `magistral`, `ministral`, `minimax`, `nemotron`, `gemma`, `devstral`, `cosmos`, `ami`, `codestral`, `llama`, `claude`, `gpt`).
- **`MODEL_PRICING`**: 11 modelos exactos que sobrescriben a su familia (`glm-5.2`, `glm-5.3-flash`, `deepseek-v4-pro`, `deepseek-v4-flash-demo`, `deepseek-v4.1-flash`, `kimi-k2.6`, `kimi-k2.7-code`, `mistral-large-3`, `mistral-medium`, `minimax-m3`, `gemma4`).
- **`FALLBACK_PRICING`**: `{ input: 1.0, output: 3.0 }`.

**Nota**: No existe `index.ts` de barrel en el módulo; las importaciones deben apuntar directamente a `src/pricing/model-pricing.ts`.

## Metricas

- tokens_input: 23365
- tokens_output: 626
- tokens_reasoning: 53
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 24044
- cost_usd: 0
- tool_calls: 2
- tools_usadas: glob, read
- assistant_messages: 3
