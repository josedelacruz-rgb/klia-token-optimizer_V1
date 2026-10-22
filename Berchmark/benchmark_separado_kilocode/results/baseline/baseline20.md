# Prueba 20 - BUSQUEDA_REFERENCIAS

**Prompt:** Busca apariciones del texto synthetic solo en src/ y resumeme en que contextos se usa.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** LITERAL_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T08:55:26Z
**Duracion:** 99s
**Estado:** success

## Respuesta

Resumen de los contextos donde se usa `synthetic` en `src/`:

**1. Esquema de datos (`src/types.ts:260`)**
- Campo opcional `synthetic?: boolean` en `RouterEvent`. Marca si un evento proviene de datos sintéticos (benchmark/CLI) o reales.

**2. Origen y filtrado (`src/history/migrate.ts`)**
- `looksSynthetic()` (l. 25) detecta automáticamente si un `ExecutionRecord` v1 parece sintético.
- `migrateExecutionRecord()` y `migrateAll()` lo setean durante la migración v1→v2, con opción `forceSynthetic` (l. 148).

**3. Store unificado (`src/history/router-event-store.ts`)**
- Filtra por `excludeSynthetic` en consultas (l. 86, 96).
- `markAllAsSynthetic()` (l. 115) marca eventos por `source`.
- Se persiste en creación de eventos (l. 155, 188).

**4. Server MCP (`src/mcp-server.ts`)**
- `record_execution` expone `synthetic` como parámetro (l. 80, 479).
- `get_router_stats` acepta `excludeSynthetic` (l. 98, 175) y filtra los sintéticos (l. 563-564).
- `migrate_history` los detecta automáticamente (l. 183).

**5. Reporting (`src/scorer/stats-report.ts`)**
- Separa `realExecutions` vs `syntheticExecutions` (l. 189-192).
- Cuenta `syntheticCount` (l. 79, 523) para el summary.

**6. CLI y visualización**
- `src/router-cli.ts:214` registra decisiones con `synthetic: false`.
- `src/scripts/migrate-history.ts` reporta cuántos sintéticos detectó (l. 38-45).
- `src/scripts/stats-display.ts` los muestra como tarjeta "SINTETICOS" (l. 295, 373), recomienda `--real-only` (l. 713, 735, 807) y advierte si la proporción sintético/real es muy alta (l. 652-653).

**Uso transversal:** distinguir datos de calibración (benchmark/simulación) de métricas reales para que el router adaptativo aprenda solo de lo último y el reporting no se contamine.

## Metricas

- tokens_input: 14270
- tokens_output: 612
- tokens_reasoning: 64
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 14946
- cost_usd: 0
- tool_calls: 1
- tools_usadas: grep
- assistant_messages: 2
