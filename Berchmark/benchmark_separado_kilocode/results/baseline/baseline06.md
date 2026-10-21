# Prueba 06 - EMPAQUETADO_REPO

**Prompt:** Genera un resumen del modulo src/pricing/ con todos sus archivos y funciones exportadas.
**Categoria:** EMPAQUETADO_REPO
**TaskType:** LARGE_CONTEXT
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-21T14:25:12Z
**Duracion:** 64s
**Estado:** success

## Respuesta

# Resumen del módulo `src/pricing/`

El módulo contiene un único archivo: `model-pricing.ts` (94 líneas). Define la tabla de precios por modelo/familia y utilidades para calcular costes en USD.

## Archivo: `src/pricing/model-pricing.ts`

### Tipos exportados

- **`ModelPricing`** (interface): precios en USD por 1M de tokens.
  - `inputPerMillion: number`
  - `outputPerMillion: number`

### Funciones exportadas

1. **`getPricing(model: string, family?: string): ModelPricing`** — `model-pricing.ts:68`
   Devuelve el pricing siguiendo prioridad:
   1. Modelo exacto (normalizado a minúsculas, lookup en `MODEL_PRICING`).
   2. Familia del modelo (lookup en `FAMILY_PRICING`).
   3. Fallback genérico (`FALLBACK_PRICING`: `$1.0` input / `$3.0` output por 1M).

2. **`computeCostUsd(inputTokens, outputTokens, model, family?): number`** — `model-pricing.ts:84`
   Calcula el coste en USD usando `getPricing`. Redondea el resultado a 6 decimales.

### Símbolos internos (no exportados)

- `FAMILY_PRICING` — tabla por familia (glm, deepseek, kimi, qwen, mistral, magistral, ministral, minimax, nemotron, gemma, devstral, cosmos, ami, codestral, llama, claude, gpt).
- `MODEL_PRICING` — sobrescripciones por modelo exacto (p. ej. `glm-5.2`, `glm-5.3-flash`, `deepseek-v4-pro`, `deepseek-v4-flash-demo`, `deepseek-v4.1-flash`, `kimi-k2.6`, `kimi-k2.7-code`, `mistral-large-3`, `mistral-medium`, `minimax-m3`, `gemma4`).
- `FALLBACK_PRICING` — pricing por defecto cuando no hay coincidencia.

## Metricas

- tokens_input: 19638
- tokens_output: 613
- tokens_reasoning: 37
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 20288
- cost_usd: 0
- tool_calls: 2
- tools_usadas: glob, read
- assistant_messages: 3
