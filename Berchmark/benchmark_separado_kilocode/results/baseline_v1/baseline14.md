# Prueba 14 - BUSQUEDA_FUNCION

**Prompt:** Quiero saber donde aparece el texto 'version: V0' en src/. Lista las lineas.
**Categoria:** BUSQUEDA_FUNCION
**TaskType:** LITERAL_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T08:42:43Z
**Duracion:** 75s
**Estado:** success

## Respuesta

El texto `version: V0` no aparece literalmente (en el código está como `version: 'V0'`, con comillas). Aparece en 7 líneas:

- `src/index.ts:62` → `version: 'V0',`
- `src/history/migrate.ts:135` → `: (metric.version as 'V0' | 'V1' | 'V2' | 'V3')) ?? 'V0',`
- `src/types.ts:87` → `version: 'V0' | 'V1' | 'V2' | 'V3';`
- `src/types.ts:168` → `version: 'V0' | 'V1' | 'V2' | 'V3';`
- `src/selector/optimizer-selector.ts:50` → `version: 'V0',`
- `src/selector/optimizer-selector.ts:107` → `version: 'V0',`
- `src/selector/optimizer-selector.ts:164` → `version: 'V0',`

## Metricas

- tokens_input: 20053
- tokens_output: 383
- tokens_reasoning: 132
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 20568
- cost_usd: 0
- tool_calls: 3
- tools_usadas: grep, grep, grep
- assistant_messages: 3
