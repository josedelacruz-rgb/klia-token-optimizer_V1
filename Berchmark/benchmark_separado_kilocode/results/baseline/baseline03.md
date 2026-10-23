# Prueba 03 - BUSQUEDA_REFERENCIAS

**Prompt:** Lista todos los archivos donde se llama o se importa la funcion computeCostUsd.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-23T07:24:47Z
**Duracion:** 32s
**Estado:** success

## Respuesta

Archivos de código fuente donde se define, importa o llama `computeCostUsd`:

**Definición:**
- `src/pricing/model-pricing.ts:84` — `export function computeCostUsd(...)`

**Importaciones:**
- `src/router-cli.ts:13` — `import { computeCostUsd } from './pricing/model-pricing'`
- `src/mcp-server.ts:28` — `import { computeCostUsd } from './pricing/model-pricing'`
- `src/scorer/stats-report.ts:8` — `import { computeCostUsd, getPricing } from '../pricing/model-pricing'`

**Llamadas:**
- `src/router-cli.ts:187`
- `src/mcp-server.ts:432`

El resto de coincidencias (40+ archivos) son resultados de benchmarks, logs `.jsonl` y documentación `.md`/`.txt` (reportes, `dev.md`, `repomix-output.*`), no código.

## Metricas

- tokens_input: 30271
- tokens_output: 370
- tokens_reasoning: 188
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 30829
- cost_usd: 0
- tool_calls: 3
- tools_usadas: grep, bash, grep
- assistant_messages: 4
