# Prueba 20 - BUSQUEDA_REFERENCIAS

**Prompt:** Busca apariciones del texto synthetic solo en src/ y resumeme en que contextos se usa.
**Categoria:** BUSQUEDA_REFERENCIAS
**TaskType:** LITERAL_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:46:33Z
**Duracion:** 63s
**Estado:** success
**Router KLIA:** BASELINE/LITERAL_SEARCH

## Respuesta

## Resumen de usos de `synthetic` en `src/`

**41 coincidencias** en 8 archivos. La palabra marca datos **no reales** (benchmark, simulación o CLI placeholder) frente a métricas reales del MCP.

### 1. Definición del esquema — `src/types.ts:260`
- `RouterEvent.synthetic?: boolean` — flag del esquema v2 que etiqueta un evento como sintético.

### 2. API MCP — `src/mcp-server.ts`
- Esquemas Zod de entrada: parámetro `synthetic` en `record_execution` (l.80) y `excludeSynthetic` en `get_router_stats` (l.98). También en los `inputSchema` JSON (l.157, 175).
- Lógica: al grabar un evento propaga `args.synthetic` (l.479); al consultar stats, si `excludeSynthetic` filtra `events.filter(e => !e.synthetic)` (l.563-564).
- `migrate_history` describe que marca `synthetic=true` los registros sospechosos de benchmark/CLI (l.183).

### 3. Migrador v1→v2 — `src/history/migrate.ts`
- `looksSynthetic(record)` (l.25): heurística que detecta datos sintéticos (p.ej. `quality=0.98` del CLI placeholder).
- `migrateExecutionRecord` acepta `synthetic?` y si no se pasa usa `looksSynthetic` (l.49-51), escribiendo `synthetic: isSyn` (l.80).
- `migrateV1ToV2` permite `forceSynthetic` (l.148-152).

### 4. Store de eventos v2 — `src/history/router-event-store.ts`
- `excludeSynthetic` en filtros de `query` (l.86, 96).
- `markAllAsSynthetic(source='benchmark')` (l.115-119): marca todos los eventos como sintéticos y reasigna `source`.
- Helpers `createDecisionEvent`/`createExecutionEvent` reciben `synthetic?` y lo propagan (l.139, 155, 172, 188).

### 5. Reporter de estadísticas — `src/scorer/stats-report.ts`
- Contadores `syntheticCount` / `realCount` en el summary (l.79-80, 522-524).
- Particiona ejecuciones en reales vs sintéticas (l.189-192).

### 6. Display CLI de stats — `src/scripts/stats-display.ts`
- Tarjetas y métricas "SINTETICOS" vs "REALES" (l.295, 372-374).
- Recomendación si la proporción sintético/real > 10 (l.652-653).
- Flag `excludeSynthetic` + opción `--real-only` (l.713, 735-736, 807).

### 7. CLI del router — `src/router-cli.ts:214`
- Registra decisiones con `synthetic: false` (siempre reales en v2).

### 8. Script de migración — `src/scripts/migrate-history.ts`
- Cuenta y reporta eventos sintéticos vs reales tras migrar (l.6, 38-39, 45-46).

**Patrón común:** `synthetic` es un booleano del `RouterEvent` v2 que separa datos de calibración (benchmark/CLI/simulación) de métricas reales; se usa para filtrarlos en reporting (`excludeSynthetic`, `--real-only`), detectarlos al migrar (`looksSynthetic`), y avisar al usuario cuando hay un desequilibrio entre ambos.

## Metricas

- tokens_input: 16929
- tokens_output: 927
- tokens_reasoning: 58
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 17914
- cost_usd: 0
- tool_calls: 1
- tools_usadas: grep
- assistant_messages: 2
