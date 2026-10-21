# Prueba 06 - EMPAQUETADO_REPO

**Prompt:** Genera un resumen del modulo src/pricing/ con todos sus archivos y funciones exportadas.
**Categoria:** EMPAQUETADO_REPO
**TaskType:** LARGE_CONTEXT
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-21T15:42:00Z
**Duracion:** 53s
**Estado:** success

## Respuesta

# Resumen del módulo `src/pricing/`

El módulo contiene un único archivo:

## `src/pricing/model-pricing.ts`

Tabla de pricing por modelo/familia. Precios en USD por 1M tokens (datos aprox. septiembre 2026).

### Símbolos exportados

**Interfaz**
- `ModelPricing` — `{ inputPerMillion: number; outputPerMillion: number }`

**Funciones**
- `getPricing(model: string, family?: string): ModelPricing` (`model-pricing.ts:68`) — Resuelve el pricing con orden de prioridad: 1) modelo exacto (normalizado a minúsculas), 2) familia, 3) fallback genérico.
- `computeCostUsd(inputTokens, outputTokens, model, family?): number` (`model-pricing.ts:84`) — Calcula el coste en USD combinando el pricing de entrada/salida. Redondea a 6 decimales.

### Símbolos privados (no exportados)
- `FAMILY_PRICING` — pricing por familia (glm, deepseek, kimi, qwen, mistral, magistral, ministral, minimax, nemotron, gemma, devstral, cosmos, ami, codestral, llama, claude, gpt).
- `MODEL_PRICING` — pricing por modelo exacto (sobreescribe al de familia): glm-5.2, glm-5.3-flash, deepseek-v4-pro, deepseek-v4-flash-demo, deepseek-v4.1-flash, kimi-k2.6, kimi-k2.7-code, mistral-large-3, mistral-medium, minimax-m3, gemma4.
- `FALLBACK_PRICING` — pricing por defecto: input 1.0, output 3.0 USD/1M.

### Nota
No existe `index.ts` barrel en el módulo; los consumidores importan directamente de `./pricing/model-pricing` (o `../pricing/model-pricing`).

## Metricas

- tokens_input: 24636
- tokens_output: 574
- tokens_reasoning: 132
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 25342
- cost_usd: 0
- tool_calls: 2
- tools_usadas: glob, read
- assistant_messages: 3
