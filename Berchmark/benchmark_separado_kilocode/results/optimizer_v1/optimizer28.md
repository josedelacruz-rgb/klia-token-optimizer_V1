# Prueba 28 - DOCUMENTACION

**Prompt:** Documenta el API publica de src/index.ts: funciones exportadas y para que sirve cada una.
**Categoria:** DOCUMENTACION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T08:01:36Z
**Duracion:** 97s
**Estado:** success
**Router KLIA:** BASELINE/SMALL_CODE (refused -> native)

## Respuesta

# API pública de `src/index.ts`

## Interfaces exportadas

### `AdaptiveRouter`
Contrato del router adaptativo. Tres métodos:
- `route(ctx, opts?)` — Selecciona el optimizador óptimo para un `RouterContext` (modelo + señales). Si hay exploración habilitada (V3), delega en `selectOptimizerWithExploration`; si no, consulta el histórico y cae a la regla base (`defaultOptimizerForTask`) cuando no hay muestras. Devuelve un `RouterDecision`.
- `recordExecution(record)` — Persiste un `ExecutionRecord` en el histórico (`JsonHistoryStore`) para que el router aprenda.
- `inferTaskType(signals)` — Clasifica las señales en un `TaskType` (envoltura de `classifyTask`).

### `AdaptiveRouterOptions`
Configuración de `createAdaptiveRouter`:
- `historyPath` — Ruta del JSON de histórico.
- `routerOptions?` — Override de `DEFAULT_ROUTER_OPTIONS`.
- `enableExploration?` — Activa exploración/explotación V3 (default `true`).
- `modelFamilyExtractor?` — Función custom de extracción de familia de modelo.

## Funciones de factoría

### `createAdaptiveRouter(config): AdaptiveRouter` (`src/index.ts:32`)
Construye un router con su `JsonHistoryStore` y opciones fusionadas. Punto de entrada principal del paquete.

### `buildContextFromQuery(model, query, base?): RouterContext` (`src/index.ts:78`)
Extracción de señales desde texto libre mediante `extractSignalsFromQuery` y las empaqueta con el modelo en un `RouterContext`.

### `buildRecord(ctx, optimizer, metrics, modelFamilyExtractor?): ExecutionRecord` (`src/index.ts:87`)
Crea un `ExecutionRecord` listo para `recordExecution`, rellenando familia de modelo y `TaskType` a partir del contexto.

## Re-exportaciones de símbolos

| Símbolo | Origen | Para qué sirve |
|---|---|---|
| `classifyTask` | `classifier/task-classifier` | Mapea `TaskSignals` → `TaskType`. |
| `extractSignalsFromQuery` | `classifier/task-classifier` | Heurísticas que extraen señales de una consulta. |
| `createExecutionRecord` | `history/history-store` | Constructor de `ExecutionRecord`. |
| `JsonHistoryStore` | `history/history-store` | Store v1 del histórico en JSON. |
| `selectOptimizerWithExploration` | `selector/exploration` | Selector con epsilon-greedy V3. |
| `extractModelFamily` | `utils/model-family` | Familia (GPT-4, Claude…) de un modelo. |
| `normalizeModel` | `utils/model-family` | Normaliza el nombre de modelo. |
| `isChatModel` | `utils/model-family` | Distingue modelos de chat de los de embedding. |
| `DEFAULT_ROUTER_OPTIONS` | `types` | Pesos/umbrales por defecto del router. |
| `McpMetricsStore` | `history/mcp-metrics-store` | Store legacy v1 de decisiones MCP. |
| `discoverModels` | `klia-discovery` | Descubre modelos desde `/v1/models` con caché. |
| `discoverModelsFromApi` | `klia-discovery` | Llamada directa a la API de KLIA. |
| `detectKliaApiKey` | `klia-discovery` | Detecta/valida `KLIA_API_KEY`. |
| `SNAPSHOT_MODELS` | `klia-discovery` | Snapshot estático de modelos conocido. |

## Re-exportaciones de tipos

`RouterContext`, `RouterDecision`, `RouterOptions`, `TaskSignals` (de `types`); `DiscoveredModel`, `DiscoveryResult` (de `klia-discovery`).

## Resumen de uso típico

```ts
const router = createAdaptiveRouter({ historyPath: './events.json' });
const ctx = buildContextFromQuery(model, query);
const decision = await router.route(ctx);
// ...ejecutar con decision.optimizer...
await router.recordExecution(buildRecord(ctx, decision.optimizer, metrics));
```

## Metricas

- tokens_input: 15749
- tokens_output: 991
- tokens_reasoning: 465
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 17205
- cost_usd: 0
- tool_calls: 1
- tools_usadas: read
- assistant_messages: 2
