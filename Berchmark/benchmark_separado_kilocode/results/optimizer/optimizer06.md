# Prueba 06 - EMPAQUETADO_REPO

**Prompt:** Genera un resumen del modulo src/pricing/ con todos sus archivos y funciones exportadas.
**Categoria:** EMPAQUETADO_REPO
**TaskType:** LARGE_CONTEXT
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-21T16:43:10Z
**Duracion:** 62s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

# Resumen del módulo `src/pricing/`

El módulo contiene un único archivo: `model-pricing.ts` (94 líneas). No hay `index.ts` barrel.

## `src/pricing/model-pricing.ts`

Tabla de pricing por modelo/familia en USD por millón de tokens (datos aprox. septiembre 2026).

### Exportaciones

**Interfaz**
- `ModelPricing` — `{ inputPerMillion: number; outputPerMillion: number }` (USD por 1M tokens).

**Funciones**
- `getPricing(model: string, family?: string): ModelPricing` — `model-pricing.ts:68`
  Resuelve el pricing con orden de prioridad: modelo exacto (normalizado a minúsculas) → familia → fallback genérico (`1.0` / `3.0`).
- `computeCostUsd(inputTokens, outputTokens, model, family?): number` — `model-pricing.ts:84`
  Calcula el coste en USD de una ejecución usando `getPricing`. Redondea a 6 decimales.

### Símbolos internos (no exportados)
- `FAMILY_PRICING` — tabla por familia (glm, deepseek, kimi, qwen, mistral, magistral, ministral, minimax, nemotron, gemma, devstral, cosmos, ami, codestral, llama, claude, gpt).
- `MODEL_PRICING` — overrides por modelo exacto (glm-5.2, glm-5.3-flash, deepseek-v4-pro, deepseek-v4-flash-demo, deepseek-v4.1-flash, kimi-k2.6, kimi-k2.7-code, mistral-large-3, mistral-medium, minimax-m3, gemma4).
- `FALLBACK_PRICING` — `{ 1.0, 3.0 }`.

### Consumidores
- `src/mcp-server.ts:28` — importa `computeCostUsd`.
- `src/router-cli.ts:13` — importa `computeCostUsd`.
- `src/scorer/stats-report.ts:8` — importa `computeCostUsd` y `getPricing`.

## Metricas

- tokens_input: 34282
- tokens_output: 715
- tokens_reasoning: 89
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 35086
- cost_usd: 0
- tool_calls: 4
- tools_usadas: glob, read, glob, grep
- assistant_messages: 4
