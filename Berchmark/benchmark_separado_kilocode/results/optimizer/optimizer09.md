# Prueba 09 - BUSQUEDA_FUNCION

**Prompt:** Localiza la implementacion de buildCostMatrix y dime en que archivo y linea vive.
**Categoria:** BUSQUEDA_FUNCION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:32:55Z
**Duracion:** 51s
**Estado:** success
**Router KLIA:** BASELINE/REPOSITORY_SEARCH

## Respuesta

`buildCostMatrix` vive en `src/scorer/expected-cost-scorer.ts:76`.

- **Declaración**: `export function buildCostMatrix(records: ExecutionRecord[], options: RouterOptions = {}): Map<string, Map<Optimizer, CostScore>>` (líneas 76-79).
- **Cuerpo**: líneas 80-103.
- **Docstring**: "Agrupa registros por (modelo, tarea) y devuelve una tabla de costes relativos." (líneas 73-75).

**Usos detectados**:
- `src/mcp-server.ts:26` — import.
- `src/selector/optimizer-selector.ts:90` — `const matrix = buildCostMatrix(records, opts)`.

Devuelve un `Map<clave "modelo::tarea", Map<Optimizer, CostScore>>` agrupando registros v1 (`ExecutionRecord`) para que el selector consulte el coste relativo por optimizador.

## Metricas

- tokens_input: 34471
- tokens_output: 472
- tokens_reasoning: 107
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 35050
- cost_usd: 0
- tool_calls: 3
- tools_usadas: semble_search, read, read
- assistant_messages: 4
