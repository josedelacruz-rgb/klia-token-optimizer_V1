# Guía de desarrollo

> Documentación técnica para desarrolladores que contribuyen o extienden el router adaptativo de optimizadores de contexto `klia-token-optimizer`.

---

## Tabla de contenidos

- [Entorno de desarrollo](#entorno-de-desarrollo)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Build y ejecución](#build-y-ejecución)
- [Testing](#testing)
- [Arquitectura interna](#arquitectura-interna)
- [Flujo de decisión](#flujo-de-decisión)
- [Módulos clave](#módulos-clave)
- [Formatos de datos](#formatos-de-datos)
- [Referencia de configuración](#referencia-de-configuración)
- [Depuración](#depuración)
- [Añadir un optimizador](#añadir-un-optimizador)
- [Añadir un tipo de tarea](#añadir-un-tipo-de-tarea)
- [Cambiar la función de coste](#cambiar-la-función-de-coste)
- [Internos del servidor MCP](#internos-del-servidor-mcp)
- [Convenciones de código](#convenciones-de-código)
- [Errores comunes](#errores-comunes)

---

## Entorno de desarrollo

### Requisitos previos

- Node.js >= 22.5 (requerido por Context Mode)
- npm
- TypeScript 7 (instalado como dependencia de desarrollo)
- Vitest 5 (instalado como dependencia de desarrollo)
- uv (para Semble; auto-instalado por el instalador unificado si falta)

### Configuración inicial

```bash
git clone <repo-url>
cd klia-token-optimizer
npm install
```

### Instalador unificado (recomendado para entorno completo)

El instalador unificado `install_klia_tokens.ps1` instala el router y los optimizadores de contexto (Semble, Context Mode, RTK, Repomix), el plugin de auto-registro, el system prompt, los cinco comandos slash `/klia_*` y los plugins de arranque `klia-healthcheck` para OpenCode y Kilo (el chequeo de salud con popup corre en cada arranque del editor, no durante la instalación):

```powershell
.\install_klia_tokens.ps1
```

Es idempotente y genera backups `.bak-<fase>-<timestamp>`. Ver [instaladores/install.md](./instaladores/install.md) para detalles completos. Tras ejecutarlo, el proyecto queda compilado en `dist/`, el histórico calibrado y el servidor MCP registrado en `opencode.jsonc`.

### Herramientas necesarias

| Herramienta | Propósito |
| ----------- | --------- |
| `tsc` | Type checking y build (`npm run build`). |
| `tsx` | Ejecutar TypeScript directamente sin compilar (`npm run router`, `npm run route`, `npm run mcp-server`). |
| `vitest` | Runner de tests (`npm test`). |

---

## Estructura del proyecto

```text
klia-token-optimizer/
  src/
    classifier/
      task-classifier.ts   # classifyTask, classifyContextSize, extractSignalsFromQuery
    rules/
      base-rules.ts         # BASE_RULES, candidatesForTask, defaultOptimizerForTask
    scorer/
      expected-cost-scorer.ts  # computeRecordCost, computeRelativeCost, buildCostMatrix, keyFor
      stats-report.ts           # buildStatsReport (summary, byModel, byModelTask, globalSavings), OptimizerCell, ModelRow
    selector/
      optimizer-selector.ts    # selectOptimizer, evaluateOptimizer
      exploration.ts           # selectOptimizerWithExploration (V3)
    history/
      history-store.ts         # HistoryStore interface, JsonHistoryStore, createExecutionRecord (v1)
      router-event-store.ts     # RouterEventStore (v2 unified events), createDecisionEvent, createExecutionEvent, compact
      mcp-metrics-store.ts      # McpMetricsStore (legacy usage telemetry)
      migrate.ts                # migrateV1ToV2, isMigratedToV2 (v1 -> v2 with synthetic detection)
    pricing/
      model-pricing.ts          # computeCostUsd, getPricing, ModelPricing
    autopilot/
      auto-pilot.ts             # AutoPilot (evaluate, checkAndAct), AutoPilotAction, AutoPilotOptions
    dashboard/
      web-dashboard.ts          # startWebDashboard (HTTP server, default 127.0.0.1:6283)
      stats-adapter.ts          # buildDashboardReport (report + DashboardSummary)
      benchmark-adapter.ts      # benchmark-results.json -> aggregates + calibration
    utils/
      model-family.ts          # extractModelFamily, normalizeModel, isChatModel
      cli-args.ts              # parseCliArgs (positionals, values, flags)
      json.ts                  # readJsonSync/Async, writeFileSyncAtomic, stripBom, ensureJsonFile
    scripts/
      calibrate.ts             # runCalibration + CLI entry
      migrate-history.ts       # CLI to migrate history.json -> events.json
      stats-display.ts         # runStatsCli: `router stats` professional report (8 ANSI sections)
      calibrate-display.ts     # runCalibrateCli: `router calibrate` (confidence calibration)
      compact-display.ts       # runCompactCli: `router compact` (store cleanup plan)
      autopilot-display.ts     # runAutopilotCli: `router autopilot` (maintenance actions)
      dashboard-display.ts     # runDashboardCli: `router dashboard` (--detach daemon)
      min-confidence-config.ts # resolveMinConfidence + write to global OpenCode config
      health-check.ts          # runHealthCheckCli: chequeo de salud al arranque (popup, throttle, estado)
    klia-discovery.ts          # detectKliaApiKey, discoverModels, discoverModelsFromApi, SNAPSHOT_MODELS
    index.ts                   # Public API: createAdaptiveRouter, buildContextFromQuery, buildRecord + re-exports
    cli.ts                     # `route` CLI (JSON output)
    router-cli.ts              # `router` CLI (decide / record / stats / calibrate / compact / autopilot / dashboard)
    mcp-server.ts              # MCP server (route_task, record_execution, get_router_stats, migrate_history)
    types.ts                   # Shared types + DEFAULT_ROUTER_OPTIONS + RouterEvent (v2)
  commands/                    # Slash command sources (klia_stats, klia_calibrate, klia_compact, klia_dashboard, klia_autopilot)
  plugins/                     # Plugins finos de host (klia-router-inject, klia-auto-record, klia-healthcheck) por host:
    kilo/
    opencode/
    opencode/v2/               # v2 lee de plugins (plural); klia-badge solo en kilo/tui y opencode/v2
  tests/                       # Mirror of src/, plus integration tests
  instaladores/                # Installer documentation (install.md, opencode.json)
  install_klia_tokens.ps1          # Unified installer (router + optimizers + auto-record plugin + slash commands)
  tsconfig.json                # Base config (includes tests)
  tsconfig.build.json          # Build config (src only, declarations)
  package.json
  AGENTS.md
  OPENCODE_USAGE.md
  SYSTEM_PROMPT.md
  router.md
  README.md / README_en.md
  dev.md / dev_es.md
```

### Puntos de entrada recomendados

| Objetivo | Empezar por |
| -------- | ----------- |
| Entender la API pública | `src/index.ts` |
| Entender la clasificación de tareas | `src/classifier/task-classifier.ts` |
| Entender la selección de optimizador | `src/selector/optimizer-selector.ts` + `src/selector/exploration.ts` |
| Entender el scoring de coste | `src/scorer/expected-cost-scorer.ts` |
| Entender el reporte enriquecido v2 | `src/scorer/stats-report.ts` |
| Entender el store de eventos v2 | `src/history/router-event-store.ts` + `src/history/migrate.ts` |
| Entender la limpieza del store | `src/history/router-event-store.ts` (`compact`) + `src/scripts/compact-display.ts` |
| Entender el autoajuste | `src/autopilot/auto-pilot.ts` + `src/scripts/calibrate-display.ts` |
| Entender el panel web | `src/dashboard/web-dashboard.ts` + `src/dashboard/stats-adapter.ts` |
| Entender el pricing en USD | `src/pricing/model-pricing.ts` |
| Entender el descubrimiento de modelos | `src/klia-discovery.ts` |
| Entender el servidor MCP | `src/mcp-server.ts` |
| Entender las CLIs | `src/router-cli.ts` (unificada), `src/cli.ts` (JSON) |

---

## Build y ejecución

### Build

```bash
npm run build
```

Produce `dist/` con `.js` + `.d.ts` solo desde `src/`. Los tests se excluyen mediante `tsconfig.build.json`.

### Watch durante el desarrollo

No hay script de watch dedicado. Usa `tsc --noEmit --watch` en otra terminal para type checking mientras editas, y `npm run test:watch` para tests.

### Ejecutar las CLIs sin compilar

Las CLIs usan `tsx`, así que puedes iterar sin reconstruir:

```bash
npm run router -- --model glm-5.2 --query "refactoriza auth" --files 12 --size 250000
npm run route  -- --model glm-5.2 --query "refactoriza auth" --files 12 --size 200000
npm run router -- stats
```

La CLI `router` acepta un subcomando como primer argumento posicional:

| Subcomando | Propósito |
| ---------- | --------- |
| (ninguno) | Decidir: enruta la tarea y registra el evento de decisión. |
| `stats` | Informe de ahorro de 8 secciones a partir de `events.json`. |
| `calibrate` | Compara la confianza declarada vs. la calidad real; sugiere `ROUTER_MIN_CONFIDENCE`; `--write` lo aplica. |
| `compact` | Construye un plan de limpieza de `events.json` (dry-run por defecto; `--write` lo aplica). |
| `autopilot` | Evalúa burn/fallos/tamaño del store y devuelve acciones de mantenimiento (no las ejecuta). |
| `dashboard` | Arranca el panel web local (por defecto `http://127.0.0.1:6283`). |

Flags de decisión: `--model`, `--query`, `--files`, `--size`, `--history`, `--explore`, `--json`.
Flags de registro: `--record-id <id> --tokens N --latency N --quality N` (actualización de métricas v1) o `--record-execution --model M --query Q --optimizer O --tokens N [--input-tokens --output-tokens] --latency N [--quality --cost-usd --session-id --failed --context-after --tokens-pruned --actual-tool-calls --router-latency-ms --started-at --completed-at --events --metrics]` (escribe el registro v1, el evento de ejecución v2 y la métrica MCP legacy).

### Ejecutar el servidor MCP

```bash
npm run mcp-server
```

Escucha en stdio. Los logs van a stderr y al archivo JSON de logs (por defecto `.router-history/mcp-server.log.json`).

### Calibrar desde benchmarks

```bash
npm run calibrate -- --history .router-history/benchmark.json --repetitions 3
```

Este script sobrescribe el archivo de histórico destino. Incluye matrices de benchmark integradas para `glm-5.2`, `deepseek-v4`, `gpt-4o` y `claude-sonnet-4`.

> En Windows CMD usa `^` para continuar líneas. En PowerShell usa `` ` `` o una sola línea.

---

## Testing

### Ejecutar todos los tests

```bash
npm test
```

Vitest corre en modo `--run` (sin watch). Para modo watch:

```bash
npm run test:watch
```

### Estructura de tests

Los tests espejan `src/`:

- `tests/classifier/` - tests de clasificación.
- `tests/rules/` - tests de reglas base.
- `tests/scorer/` - tests de coste esperado.
- `tests/selector/` - tests del selector + exploración.
- `tests/history/` - tests del history store.
- `tests/index.test.ts` - integración de la API pública.
- `tests/benchmark-integration.test.ts` - end-to-end con datos de benchmark.
- `tests/mcp-server.test.ts`, `tests/mcp-server-stats.test.ts`, `tests/mcp-metrics.test.ts` - tests del servidor MCP.

### Cómo escribir tests

- Los globales de Vitest NO están habilitados; importa `describe`, `it`, `expect` desde `vitest`.
- Usa directorios temporales bajo `tests/.tmp-*` para tests basados en archivos. Limpia en `beforeEach`/`afterEach`.
- Para tests de exploración deterministas, inyecta una función `random` personalizada (ver la firma de `selectOptimizerWithExploration`).

---

## Arquitectura interna

### Componentes y responsabilidades

```text
                  OpenCode / CLI / MCP client
                            |
                            v
                  createAdaptiveRouter()
                            |
            +---------------+---------------+
            |               |               |
            v               v               v
   classifyTask()    extractModelFamily()   (classifyContextSize:
            |               |               internal to classifyTask
            +---------------+---------------+   for LARGE_CONTEXT)
                            |
                            v
                   RuleEngine (BASE_RULES)
                   -> candidates for task
                            |
                            v
                   HistoryStore.query()       RouterEventStore.add() (v2)
                   -> records for (model, task)   -> decision/execution events
                            |
                            v
                   ExpectedCostScorer
                   -> buildCostMatrix, computeRelativeCost
                            |
                            v
                   selectOptimizer()
                   -> V0/V1/V2 decision
                            |
                            v
                   selectOptimizerWithExploration() (V3)
                   -> exploration vs exploitation
                            |
                            v
                   RouterDecision
                            |
                            v
                   (pricing: computeCostUsd when costUsd not provided)
                   (stats: buildStatsReport for get_router_stats v2)
```

### Versionado de las decisiones

El campo `version` en `RouterDecision` indica qué estrategia produjo la decisión:

| Versión | Cuándo |
| ------- | ------ |
| `V0` | No hay histórico para `(modelo, tarea)`. Usa la regla base. |
| `V1` | Hay histórico pero la confianza < `minConfidence` o las muestras < `minSamples`. |
| `V2` | Evidencia suficiente; elige el optimizador con menor coste relativo. |
| `V3` | La capa de exploración/explotación intervino (fallback forzado o prueba controlada). |

### Confianza

`confidenceFromSamples(sampleCount, minSamples)`:

- 0 muestras -> 0
- `>= minSamples * 2` -> 1
- en caso contrario -> `sampleCount / minSamples` (limitado a 1)

Es intencionadamente simple. Sustitúyela por un intervalo de confianza o un posterior bayesiano si necesitas garantías más fuertes.

---

## Flujo de decisión

1. **Construcción del contexto** (`buildContextFromQuery`): envuelve `(model, signals)`. Las señales se extraen del texto de la query mediante heurísticas de regex salvo que se proporcionen señales explícitas.
2. **Routing** (`router.route(ctx)`):
   - Clasificar la tarea (`classifyTask`). `classifyContextSize` se usa internamente por `classifyTask` para detectar `LARGE_CONTEXT`; ya no se usa para forzar un optimizador.
   - Si la exploración está habilitada, llamar a `selectOptimizerWithExploration`. Si no, llamar a `selectOptimizer` directamente.
3. **Selección** (`selectOptimizer`):
   - Consultar el histórico para `(model, taskType)`.
   - Si está vacío -> V0, devolver el default de la regla base.
   - En caso contrario, construir la matriz de costes y elegir el candidato con menor coste relativo cuya confianza >= `minConfidence`.
   - Si ninguno cumple el umbral -> V1, devolver baseline.
4. **Exploración** (`selectOptimizerWithExploration`):
   - Si `baseDecision.confidence >= minConfidence`, explotar (devolver la decisión base).
   - Con probabilidad `1 - explorationRate`, hacer fallback al default de la regla base (V3).
   - Con probabilidad `explorationRate`, elegir un candidato no explorado al azar (que no sea `BASELINE` ni probado antes).
5. **Registro** (`router.recordExecution(record)`): añade al histórico JSON. La siguiente llamada a routing para el mismo `(modelo, tarea)` verá la nueva evidencia.
6. **Emisión de eventos v2**: el servidor MCP y `router-cli.ts` emiten además un `RouterEvent` (`decision` para `route_task`, `execution` para `record_execution`) en `events.json` vía `RouterEventStore`. El `history.json` v1 se mantiene en sincronía para que el router adaptativo siga aprendiendo.

---

## Módulos clave

### `src/classifier/task-classifier.ts`

- `classifyTask(signals, opts?)` - devuelve un `TaskType`.
- `classifyContextSize(signals, opts?)` - devuelve `'LARGE_CONTEXT'`, `'LARGE_CONTEXT_EXTREME'` o `null`.
- `extractSignalsFromQuery(query, base?)` - extracción heurística de `hasTerminalCommands`, `isMultistep`, `isRefactor`, `isRepositorySearch` a partir del texto de la query.

Prioridad de clasificación:

1. Señales explícitas (`isRefactor`, `isMultistep`, `hasTerminalCommands`, `isRepositorySearch`).
2. Tamaño de contexto (large / extremo).
3. Número de archivos (`manyFilesThreshold`).
4. Comprobación de small code (`fileCount <= 3`, contexto pequeño, tool calls bajos).
5. Fallback `UNKNOWN`.

Umbrales por defecto:

- `largeContextThresholdBytes`: 1 MB
- `extremeContextThresholdBytes`: 5 MB
- `manyFilesThreshold`: 8

### `src/rules/base-rules.ts`

`BASE_RULES` mapea cada `TaskType` a una lista priorizada de optimizadores candidatos. El primer elemento es el default V0. Se puede sobrescribir editando este mapa; el scorer y el history store cogen las entradas nuevas automáticamente.

### `src/scorer/expected-cost-scorer.ts`

- `computeRecordCost(record, options)` - coste absoluto de una ejecución.
- `computeRelativeCost(records, optimizer, options)` - coste relativo vs el baseline del mismo grupo. `Infinity` si no hay registros; `absoluteCost / avgBaselineCost` en caso contrario. Si no existen registros de baseline, se usa como denominador la media del propio optimizador (con lo que `relativeCost = 1`).
- `buildCostMatrix(records, options?)` - agrupa los registros por `model::taskType` y devuelve `Map<key, Map<Optimizer, CostScore>>`.
- `keyFor(model, taskType)` - devuelve la clave de agrupación.

### `src/scorer/stats-report.ts`

Construye el reporte enriquecido v2 consumido por `get_router_stats` (format=v2) y `router stats`:

- `OptimizerCell` - celda enriquecida por optimizador: `samples`, `avgTokens`, `avgInputTokens`, `avgOutputTokens`, `avgLatency`, `avgQuality`, `failureRate`, `avgAbsoluteCost`, `relativeCost`, `savingsTokens`, `savingsPercent`, `savingsUsd`, `verdict` (`AHORRO` | `PERDIDA` | `NEUTRO`), `winner`.
- `ModelTaskRow` - una fila por `(model, task)`: `totalSamples`, `baseline`, `optimizers[]`, `bestOptimizer`.
- `ModelRow` - una fila por modelo: `executions`, `avgTokens`, `avgLatency`, `avgQuality`, `failureRate`, `bestOptimizer`, `savingsVsBaselinePercent`, `savingsVsBaselineTokens`.
- `RouterStatsReport` - nivel superior: `summary` (`totalDecisions`, `totalExecutions`, `syntheticCount`, `realCount`, ...), `byModel`, `byModelTask`, `globalSavings` (ahorro ponderado + veredicto literal).
- `buildStatsReport(events, options?)` - el punto de entrada. `computeEventCost` vive aquí (equivalente v2 de `computeRecordCost`).

### `src/selector/optimizer-selector.ts`

- `selectOptimizer(model, taskType, deps, options?, forcedDefault?)` - el selector central V0/V1/V2 con herencia por familia.
- Si el modelo no tiene histórico, consulta `queryByFamily(family, taskType)` y usa esos registros con confianza reducida (`familyConfidenceWeight`, por defecto 0.5).
- Solo considera optimizadores que estén en `BASE_RULES[taskType]` o sean `BASELINE`.
- Devuelve alternativas ordenadas por coste relativo.
- `evaluateOptimizer(records, optimizer, options?)` - utilidad para tests.

### `src/selector/exploration.ts`

- `selectOptimizerWithExploration(...)` - envoltorio V3 sobre `selectOptimizer`.
- Devuelve `ExplorationResult` con `decision`, `explored` (true si se activó la exploración) y `exploitedOptimizer` (lo que habría elegido la explotación pura).
- Inyecta una función `random` para tests deterministas.

### `src/klia-discovery.ts`

Descubrimiento dinámico de modelos desde la API de KLIA.

- `detectKliaApiKey()` - detecta la API key en este orden:
  1. Variable de entorno `KLIA_API_KEY` (debe empezar por `key-`)
  2. Variable de entorno `OPENAI_API_KEY` si empieza por `key-`
  3. `provider.klia.options.apiKey` en `opencode.jsonc` (parseado con limpieza de comentarios JSONC)
- `discoverModelsFromApi(apiKey?)` - llama a `GET https://api.klia.tech/v1/models` y devuelve los modelos de chat (embeddings, image y moderation se filtran con `isChatModel`).
- `discoverModels(apiKey?)` - envuelve `discoverModelsFromApi` con fallback a `SNAPSHOT_MODELS` si la API falla. Devuelve `{ models, source: 'api' | 'snapshot', error? }`.
- `SNAPSHOT_MODELS` - lista estática de 26 modelos de chat de KLIA para el fallback sin conexión.

### `src/history/history-store.ts` (v1)

- Interfaz `HistoryStore`: `add`, `list`, `query`, `queryByFamily`.
- `JsonHistoryStore` - basado en fichero, con un lock de cadena de Promesas para serializar escrituras concurrentes.
- `queryByFamily(family, taskType, optimizer?)` - devuelve registros que cumplen `modelFamily === family` y `taskType`. Lo usa el selector para la herencia por familia.
- `createExecutionRecord(...)` - construye un `ExecutionRecord` con un `id` de `${Date.now()}-${random}`.

Este es el store que lee el router adaptativo para decidir. Se mantiene por compatibilidad incluso después de la v2.

### `src/history/router-event-store.ts` (v2)

- `RouterEventStore` - store basado en fichero para `RouterEvent`. Lock de cadena de Promesas, como `JsonHistoryStore`. Las lecturas y escrituras pasan por `src/utils/json.ts` (`stripBom`, `writeFileSyncAtomic`), de modo que escrituras parciales de procesos concurrentes no corrompen el fichero.
- `createDecisionEvent(...)` - construye un evento `type: 'decision'` a partir de un `RouterDecision`.
- `createExecutionEvent(...)` - construye un evento `type: 'execution'` a partir del payload de `record_execution`.
- `migrateFile()` - migra el fichero subyacente de v1 a v2 in situ (lo usa la herramienta MCP `migrate_history`).
- `compact(options)` - devuelve un `CompactReport` puro basado en `planCompact`; lo llama `router compact` (ver más abajo). Por sí solo no escribe.
- Al leer, si se detectan registros v1, se migran en memoria (migración perezosa) vía `migrateV1ToV2`.

### `src/history/migrate.ts`

- `migrateV1ToV2(records, { source })` - convierte un array v1 `ExecutionRecord[]` en events v2 `RouterEvent[]`. Marca los registros como `synthetic=true` cuando parecen datos de benchmark o placeholders de CLI (heurísticas sobre el texto de la query y las métricas).
- `isMigratedToV2(events)` - type guard: devuelve true si el array ya está en esquema v2 (`schemaVersion === 2`).

### `src/history/mcp-metrics-store.ts` (legacy)

- `McpMetricsStore` - lectura/escritura síncrona de métricas de uso MCP.
- `summary()` - devuelve agregados: `totalDecisions`, `totalExecutions`, `byTaskType`, `byOptimizer`, `byModelFamily`, `avgQuality`, `failureRate`.

### `src/pricing/model-pricing.ts`

- `ModelPricing` - `{ inputPerMillion, outputPerMillion }` (USD por 1M de tokens).
- `FAMILY_PRICING` - defaults por familia (glm, deepseek, kimi, qwen, mistral, ...).
- `MODEL_PRICING` - overrides por modelo (p. ej. `glm-5.2`, `deepseek-v4-pro`).
- `FALLBACK_PRICING` - fallback genérico cuando ni el modelo ni la familia son conocidos.
- `getPricing(model, family?)` - resuelve el pricing con la prioridad: modelo exacto -> familia -> fallback.
- `computeCostUsd(inputTokens, outputTokens, model, family?)` - coste en USD de una ejecución. Lo usa `record_execution` cuando no se proporciona `costUsd`, y `buildStatsReport` para `savingsUsd`.

### `src/utils/model-family.ts`

- `extractModelFamily(model)` - pasa a minúsculas y comprueba contra las familias conocidas: `glm`, `deepseek`, `gpt`, `claude`, `kimi`, `qwen`, `mistral`, `llama`. En caso de no coincidir, usa el primer prefijo alfabético.
- `normalizeModel(model)` - normaliza un id de modelo para el matching.
- `isChatModel(id)` - filtra modelos de embeddings, image y moderation de la respuesta de la API de KLIA.

### `src/scripts/calibrate.ts`

- `runCalibration(...)` - siembra `history.json` con registros `BASELINE` para cada modelo descubierto desde la API de KLIA (o el snapshot estático). Sin matrices de coste sintéticas.
- Entrada CLI: `npm run calibrate -- --history <path> --repetitions N [--models a,b] [--tasks x,y]`.

### `src/scripts/migrate-history.ts`

- CLI independiente que migra `.router-history/history.json` (v1) a `.router-history/events.json` (v2). Imprime un resumen de registros sintéticos vs. reales. Idempotente.

### `src/scripts/stats-display.ts`

- `runStatsCli(argv)` - el comando `router stats`. Imprime 8 secciones ANSI: cabecera, resumen ejecutivo (tarjetas KPI), salud del sistema, ranking de modelos, heatmap modelo x tarea, detalle por (modelo, tarea), ahorro global + veredicto, calibración de confianza + recomendaciones. Flags: `--model`, `--task`, `--real-only`, `--no-color`.
- `resolveEventsPath(explicit?)` - elige el fichero de eventos en este orden (gana el primer candidato existente): `--events` explícito; `ROUTER_EVENTS_PATH`; `KLIA_STORE_DIR/events.json`; `KLIA_HOME/data/events.json`; `~/.klia/data/events.json`; fallback legacy `<cwd>/.router-history/events.json`.

### `src/scripts/calibrate-display.ts` + `src/scripts/min-confidence-config.ts`

- `runCalibrateCli(argv)` - el comando `router calibrate`. Empareja decisiones y ejecuciones por `sessionId` (reutiliza la calibración de confianza de `buildStatsReport`) y compara la confianza declarada contra la calidad real por modelo:
  - sobreconfianza (conf > calidad) -> sugiere subir `minConfidence`
  - infraconfianza -> sugiere bajarlo
  - alineado -> mantener el valor actual
- Valor sugerido = `clamp(actual + sobreconfianza, 0.3, 0.95)` redondeado a 0.05. Sin datos emparejados el veredicto es `sin-datos`.
- Resolución del umbral (el flag explícito gana a la env, que gana al fichero, que gana al default): `--min-confidence` > env `ROUTER_MIN_CONFIDENCE` > valor del fichero de configuración global de OpenCode > `0.6`. El fallback al fichero existe para que la recomendación converja tras `--write`.
- `min-confidence-config.ts` - `resolveMinConfidence(...)` implementa esa cadena (`KLIA_OPENCODE_CONFIG` sobrescribe el candidato de configuración; candidatos `~/.config/opencode/opencode.json` / `opencode.jsonc`). Aplicar el valor sugerido edita la configuración global de OpenCode con una regex quirúrgica que preserva los comentarios JSONC (clave V2 `mcp.servers['klia-token-optimizer'].environment.ROUTER_MIN_CONFIDENCE` o V1 `mcp[...].env`), creando antes un backup `.bak-<timestamp>`.

### `src/scripts/compact-display.ts`

- `runCompactCli(argv)` - el comando `router compact`. Envuelve `RouterEventStore.compact`:
  - TTL: los eventos más antiguos que `DEFAULT_MAX_AGE_DAYS` (90) caducan; los eventos con timestamp ausente/inválido se consideran caducados.
  - Purga de huérfanos: las decisiones sin ejecución emparejada se eliminan tras `DEFAULT_ORPHAN_GRACE_DAYS` (7); el emparejamiento es por `sessionId`. Los huérfanos de ejecución se conservan por defecto porque alimentan el aprendizaje de coste; `--drop-orphan-executions` los purga.
  - Los eventos sintéticos sobreviven al TTL salvo con `--purge-synthetic`.
  - Rotación: `--rotate` archiva el exceso más antiguo en `<base>.rotated-<stamp>.json`, conservando `DEFAULT_KEEP_EVENTS` (5000).
  - El modo por defecto es dry-run; `--write` crea un backup `events.backup-*` con timestamp antes de sobrescribir (escritura atómica).
- Exporta: `CompactOptions`, `CompactStats` (`examined`, `removedExpired`, `removedOrphanDecisions`, `removedOrphanExecutions`, `kept`), `CompactReport` (añade bytes/dryRun/rotación), `planCompact`.

### `src/autopilot/auto-pilot.ts`

- `AutoPilot` - evalúa métricas y devuelve acciones sugeridas **sin ejecutarlas**.
- Tipos de `AutoPilotAction`: `adjust_confidence`, `force_baseline`, `compact_store`, `alert_burn`, `retrain_classifier` (cada una con `reason` y `payload`).
- Defaults de `AutoPilotOptions`: `enabled: true`, `burnThresholdTokensPerHour: 500_000`, `failureRateThreshold: 0.4`, `maxStoreSizeBytes: 50 MB`, `cooldownMinutes: 60`.
- `evaluate(...)` y `checkAndAct(...)`: `alert_burn` si los tokens de la última hora superan el umbral; `force_baseline` si la tasa de fallos de la última hora supera 0.4; `compact_store` si el fichero de eventos supera 50 MB. Un cooldown evita repetir acciones; se exponen `disableUntil`/`enable`.
- El estado se persiste en `(KLIA_HOME ?? ~/.klia)/data/autopilot-state.json` (se conservan las últimas 100 acciones).
- CLI: `src/scripts/autopilot-display.ts` calcula tokens/tasa de fallos de la última hora desde `events.json`, llama a `checkAndAct` e imprime las acciones (o `--json`); `--disable` / `--enable` / `--events` / `--json`.

### `src/dashboard/web-dashboard.ts`

- `startWebDashboard({ port, host, eventsPath, benchmarkPath })` - servidor HTTP que sirve el dashboard HTML. Defaults: `127.0.0.1:6283`.
- `src/dashboard/stats-adapter.ts` - `buildDashboardReport(...)`: construye el reporte de `buildStatsReport` más un `DashboardSummary` (`totalEvents`, `totalDecisions`, `totalExecutions`, `totalTokens`, `avgQuality`, `failureCount`, `avgLatencySeconds`, `optimizerCounts`, `generatedAt`, campos de ahorro, `hasRealData`, `realCount`, `syntheticCount`). Si no hay ejecuciones reales, el ahorro usa los datos de benchmark cuando están disponibles.
- `src/dashboard/benchmark-adapter.ts` - parsea las filas de `benchmark-results.json` (`taskId`, `model`, `optimizer`, `estimatedTokens`, `latencySeconds`, `quality`, `failed`, ...) y calcula el ahorro por fila vs `BASELINE` agrupado por `taskId`, agrega por optimizador y por grupo (`BenchmarkOptimizerAggregate`, `BenchmarkGroupAggregate`) y deriva `BenchmarkCalibration` (`pairsMatched`, `avgDeclaredConfidence`, `avgActualQuality`, `calibrationScore`, `verdict`, `byOptimizer[]`).
- CLI: `src/scripts/dashboard-display.ts`. Flags: `--port`, `--host`, `--events`, `--benchmark`, `--detach`, `--child`. `--detach` lanza un proceso hijo desacoplado (log en `~/.klia/logs/dashboard.log`), imprime la URL y el PID, y rechaza arrancar un duplicado si el puerto está ocupado.
- Dashboard HTML: tarjetas KPI, gráficos de distribución de optimizadores, filas de benchmark (o las top-100 celdas modelo x tarea del reporte), tablas `byModel` / `byModelTask`, formato numérico `es-ES`, auto-refresco.

### `src/scripts/health-check.ts` + `plugins/*/klia-healthcheck.ts`

- `runHealthCheckCli(argv)` - el chequeo de salud al arranque. Flags: `--json`, `--popup`, `--no-popup`, `--force` (se salta el throttle), `--interval-hours N`, `--timeout MS`, `--help`.
- Chequeos (cada uno produce un `CheckResult` con estado `ok` / `warn` / `fail`):
  1. Node >= 22.5 (`MIN_NODE_VERSION`).
  2. CLI del runtime: el primer candidato existente entre `KLIA_ROUTER_CLI_PATH`, `%LOCALAPPDATA%\klia-token-optimizer\dist\router-cli.js` y `KLIA_PROJECT_ROOT/dist/router-cli.js` (`resolveRuntimeCli`).
  3. Almacén de eventos: sonda de escritura junto al primer candidato de eventos existente (`resolveEventsCandidates`: `ROUTER_EVENTS_PATH`, `KLIA_STORE_DIR`, `KLIA_HOME/data`, `~/.klia/data`, legacy `<cwd>/.router-history`).
  4. Registro MCP: entradas `repomix` y `semble` buscando (tras quitar BOM y comentarios de línea) en los ficheros de configuración de OpenCode / Kilo.
  5. Binarios: `rtk`, `repomix` y `semble` responden a `--version` (timeout `DEFAULT_BIN_TIMEOUT_MS`, 10 s).
  6. Ficheros de plugin: `klia-router-inject.ts`, `klia-auto-record.ts` y `klia-healthcheck.ts` presentes en los directorios de plugins de Kilo / OpenCode v1 / v2 (y AppData).
- Helpers puros exportados para tests: `severityOf`, `summarize`, `parsePopupPolicy`, `decidePopup`, `formatPopupMessage`, `stripJsonComments`, `hasMcpEntry`.
- Estado: `HealthState` en `resolveStatePath` (por defecto `~/.klia/data/health-state.json`), escrito de forma atómica. El chequeo completo corre una vez cada `DEFAULT_INTERVAL_HOURS` (24; `KLIA_HEALTH_HOURS`); los arranques cacheados informan desde el estado y no muestran popup.
- Popup: `showSystemPopup` ejecuta `WScript.Shell.Popup` vía un hijo de PowerShell desacoplado (mensaje UTF-8 pasado en base64; autocierre `DEFAULT_POPUP_TIMEOUT_SECONDS`, 10 s). Política env `KLIA_HEALTH_POPUP`: `always` (por defecto) / `fail-only` / `off`; exit code 1 solo cuando el estado es `fail`.
- Los plugins finos (`plugins/kilo|opencode|opencode/v2/klia-healthcheck.ts`, uno por API de host) resuelven `dist/scripts/health-check.js` junto a `router-cli.js` y lo lanzan desacoplado con `--popup` en el arranque del host. Si falta el script muestran un aviso de "instalación incompleta" y nunca lanzan excepciones; log de depuración en `~/.klia/logs/healthcheck-debug.log`.

### `src/utils/cli-args.ts` y `src/utils/json.ts`

- `parseCliArgs(tokens, valueFlags)` - parser compartido para los subcomandos de la CLI `router`; devuelve `{ positionals, values, flags }` (los tokens que no empiezan por `--` son posicionales).
- `ensureJsonFile(path)` - crea el directorio padre y un fichero JSON vacío (array) a demanda.
- `stripBom(text)` - elimina un U+FEFF inicial (los editores de Windows añaden un BOM que rompe `JSON.parse`).
- `readJsonSync` / `readJsonAsync` - lecturas JSON tolerantes al BOM.
- `writeFileSyncAtomic` / `writeFileAtomic` - escribe en `<base>.tmp.<pid>.<ts>.tmp` y renombra, reintentando ante errores transitorios `EPERM`/`EACCES`/`EBUSY` con backoff de 50 ms. Lo usan ambos history stores para que los spawns de la CLI del plugin y el servidor MCP nunca dejen un fichero JSON a medio escribir.

### `src/index.ts` (API pública)

Exporta:

- `createAdaptiveRouter(config)` - devuelve `{ route, recordExecution, inferTaskType }`.
- `buildContextFromQuery(model, query, base?)` - construye un `RouterContext` con señales heurísticas.
- `buildRecord(ctx, optimizer, metrics, modelFamilyExtractor?)` - construye un `ExecutionRecord` listo para registrar.
- Re-exports: `classifyTask`, `extractSignalsFromQuery`, `createExecutionRecord`, `JsonHistoryStore`, `selectOptimizerWithExploration`, `extractModelFamily`, `normalizeModel`, `DEFAULT_ROUTER_OPTIONS`, `McpMetricsStore`, `discoverModels`, `discoverModelsFromApi`, `detectKliaApiKey`, `SNAPSHOT_MODELS`, `isChatModel`.
- Tipos re-exportados: `RouterContext`, `RouterDecision`, `RouterOptions`, `TaskSignals`, `DiscoveredModel`, `DiscoveryResult`.

---

## Formatos de datos

### `ExecutionRecord` (v1)

```jsonc
{
  "id": "1791207861095-5jro5tu",
  "timestamp": "2026-10-05T12:34:56.789Z",
  "model": "glm-5.2",
  "modelFamily": "glm",
  "taskType": "REFACTOR",
  "optimizer": "RTK",
  "metrics": {
    "tokens": 9500,
    "latencySeconds": 88,
    "toolingCost": 0.5,
    "quality": 0.98,
    "failed": false
  },
  "contextSnapshot": {
    "fileCount": 12,
    "contextSizeBytes": 250000,
    "toolCallsExpected": "medium"
  }
}
```

### `RouterEvent` (v2)

Un evento `decision`:

```jsonc
{
  "id": "evt-...",
  "schemaVersion": 2,
  "timestamp": "2026-10-05T12:34:56.789Z",
  "type": "decision",
  "sessionId": "sess-...",
  "projectId": "C:/Proyectos/...",
  "query": "refactoriza auth",
  "model": "glm-5.2",
  "modelFamily": "glm",
  "taskType": "REFACTOR",
  "signals": { "fileCount": 12, "contextSizeBytes": 250000, "toolCallsExpected": "medium" },
  "decision": {
    "optimizer": "RTK",
    "version": "V2",
    "confidence": 1,
    "reason": "Para glm-5.2/REFACTOR, RTK tiene el menor coste relativo (0.58) con 3 muestras.",
    "alternatives": [
      { "optimizer": "RTK", "relativeCost": 0.58, "sampleCount": 3 },
      { "optimizer": "DCP", "relativeCost": 0.59, "sampleCount": 3 }
    ]
  },
  "source": "mcp",
  "synthetic": false
}
```

Un evento `execution` (solo difiere el bloque `execution`):

```jsonc
{
  "...": "...campos comunes como arriba...",
  "type": "execution",
  "execution": {
    "optimizer": "RTK",
    "inputTokens": 8000,
    "outputTokens": 1500,
    "totalTokens": 9500,
    "latencySeconds": 88,
    "costUsd": 0.00625,
    "toolingCost": 0.5,
    "quality": 0.95,
    "failed": false,
    "retries": 0,
    "contextSizeBytesAfter": 120000,
    "tokensPruned": 130000,
    "actualToolCalls": 4,
    "routerLatencyMs": 12,
    "startedAt": "2026-10-05T12:34:50Z",
    "completedAt": "2026-10-05T12:36:18Z"
  },
  "source": "mcp",
  "synthetic": false
}
```

### `RouterDecision`

```jsonc
{
  "optimizer": "RTK",
  "version": "V2",
  "reason": "Para glm-5.2/REFACTOR, RTK tiene el menor coste relativo (0.58) con 3 muestras.",
  "confidence": 1,
  "taskType": "REFACTOR",
  "alternatives": [
    { "optimizer": "RTK", "relativeCost": 0.58, "sampleCount": 3 },
    { "optimizer": "DCP", "relativeCost": 0.59, "sampleCount": 3 },
    { "optimizer": "CONTEXT_MODE", "relativeCost": 0.71, "sampleCount": 3 },
    { "optimizer": "BASELINE", "relativeCost": 1.0, "sampleCount": 3 }
  ]
}
```

### Fichero de histórico (v1, `history.json`)

Un array JSON de `ExecutionRecord`. Escrito atómicamente por cada `add()` mediante un lock de cadena de Promesas. El fichero se crea a demanda; el directorio padre se crea con `recursive: true`. Es el fichero que lee el router adaptativo para decidir.

### Fichero de eventos (v2, `events.json`)

Un array JSON de `RouterEvent`. Escrito por `RouterEventStore` con el mismo patrón de lock de cadena de Promesas. Es la fuente de `get_router_stats` (format=v2) y `router stats`. Migrado perezosamente desde v1 al leer.

### Fichero de métricas MCP (legacy, `mcp-metrics.json`)

Un array JSON de `McpUsageMetric`. Escrito síncronamente en cada llamada a `record()`. Lo usa `get_router_stats` (format=legacy) para el campo `mcpUsageSummary`.

### `benchmark-results.json` (harness de benchmark, lo consume el dashboard)

Un array JSON de filas de resultado de benchmark. El adaptador de benchmark del dashboard lo lee cuando se pasa `--benchmark` (o vía defaults del instalador):

```jsonc
[
  {
    "taskId": "Q05",
    "taskName": "...",
    "model": "glm-5.2",
    "optimizer": "REPOMIX",
    "taskType": "REPO_PACKAGING",
    "estimatedTokens": 18780,
    "latencySeconds": 65,
    "quality": 0.95,
    "failed": false
  }
]
```

El ahorro por fila se calcula contra la fila `BASELINE` con el mismo `taskId`; los agregados (`BenchmarkOptimizerAggregate`, `BenchmarkGroupAggregate`) y el resumen de calibración (`BenchmarkCalibration`) se derivan en `src/dashboard/benchmark-adapter.ts`.

### Fichero de estado del health check (`health-state.json`)

Un objeto único escrito por `src/scripts/health-check.ts` tras cada chequeo completo:

```jsonc
{
  "lastRunAt": "2026-10-22T15:12:40.000Z",
  "status": "ok",            // ok | warn | fail
  "okCount": 8,
  "failedCount": 0,
  "warnCount": 1,
  "lastMessage": "Resumen: 8 correctas, 1 avisos, 0 fallos",
  "lastPopupAt": "2026-10-22T15:12:41.000Z",
  "runs": 42
}
```

El chequeo completo corre cuando el `lastRunAt` almacenado es más antiguo que el intervalo (24 h por defecto); si no, la CLI informa desde este fichero (cacheado solo el resumen) y no muestra popup.

---

## Referencia de configuración

### `RouterOptions` (en código)

```typescript
{
  minConfidence: 0.6,        // Confianza mínima para usar una regla aprendida V2
  explorationRate: 0.1,      // Probabilidad de exploración V3
  minSamples: 3,             // Muestras mínimas para fiarse de una regla
  latencyWeight: 1.0,        // Peso de la latencia en el coste
  toolingCostWeight: 1.0,    // Peso del coste de tooling en el coste
  failurePenalty: 5.0,       // Se añade cuando failed === true
  qualityPenalty: 3.0,       // Se multiplica por (1 - quality)
  familyConfidenceWeight: 0.5, // Reducción de confianza para herencia por familia
}
```

### Variables de entorno (servidor MCP)

Ver [README.md - Variables de entorno](./README.md#entorno-de-desarrollo). Todas se parsean con `parseFloat`; los valores inválidos se ignoran (se cae al default). La lista completa:

| Variable | Descripción | Default |
| -------- | ----------- | ------- |
| `ROUTER_HISTORY_PATH` | Fichero de histórico v1 (aprendizaje del router adaptativo) | `./.router-history/history.json` |
| `ROUTER_EVENTS_PATH` | Fichero de eventos unificados v2 (reporting) | `./.router-history/events.json` |
| `ROUTER_METRICS_PATH` | Fichero legacy de métricas MCP | `./.router-history/mcp-metrics.json` |
| `ROUTER_LOG_PATH` | Log JSON del servidor MCP | `./.router-history/mcp-server.log.json` |
| `ROUTER_MIN_CONFIDENCE` | Confianza mínima para una regla aprendida | `0.6` |
| `ROUTER_EXPLORATION_RATE` | Tasa de exploración V3 | `0.1` |
| `ROUTER_MIN_SAMPLES` | Muestras mínimas para fiarse de una regla | `3` |
| `ROUTER_LATENCY_WEIGHT` | Peso de la latencia | `1.0` |
| `ROUTER_TOOLING_COST_WEIGHT` | Peso del coste de tooling | `1.0` |
| `ROUTER_FAILURE_PENALTY` | Penalización por fallo | `5.0` |
| `ROUTER_QUALITY_PENALTY` | Penalización por calidad perdida | `3.0` |

### Variables de entorno (CLI e instalador)

| Variable | Descripción | Default |
| -------- | ----------- | ------- |
| `KLIA_HOME` | Directorio base para datos y logs de KLIA instalados (lo fija el instalador) | `~/.klia` |
| `KLIA_STORE_DIR` | Directorio alternativo de eventos/datos usado por `resolveEventsPath` | unset |
| `KLIA_OPENCODE_CONFIG` | Sobrescribe la ruta del fichero de configuración de OpenCode usada por `router calibrate --write` | unset |
| `KLIA_HEALTH_POPUP` | Política de popup del health check (`always`, `fail-only`, `off`) | `always` |
| `KLIA_HEALTH_POPUP_TIMEOUT` | Autocierre del popup, en segundos | `10` |
| `KLIA_HEALTH_HOURS` | Horas entre chequeos de salud completos | `24` |
| `KLIA_HEALTH_TIMEOUT` | Timeout del chequeo de binarios, en ms | `10000` |
| `KLIA_HEALTH_DISABLE` | `1` o `true` desactiva el chequeo de salud al arrancar | unset |
| `KLIA_HEALTH_STATE_PATH` | Sobrescribe la ruta del fichero de estado del health check | `<KLIA_STORE_DIR ?? ~/.klia/data>/health-state.json` |

### Orden de resolución del fichero de eventos

`router stats`, `compact`, `autopilot` y `dashboard --events` aceptan un `--events` explícito. Sin él, gana el primer candidato existente:

1. `--events` explícito
2. `ROUTER_EVENTS_PATH`
3. `KLIA_STORE_DIR/events.json`
4. `KLIA_HOME/data/events.json`
5. `~/.klia/data/events.json`
6. fallback legacy `<cwd>/.router-history/events.json`

`ROUTER_MIN_CONFIDENCE` también puede vivir en la configuración global de OpenCode (`mcp.servers['klia-token-optimizer'].environment.ROUTER_MIN_CONFIDENCE` en JSONC, o `mcp[...].env` en el layout V1); `router calibrate --write` actualiza esa clave.

### `tsconfig.json` vs `tsconfig.build.json`

- `tsconfig.json` incluye `src/**/*` y `tests/**/*`. Lo usan Vitest y el type checking del IDE.
- `tsconfig.build.json` extiende el base, fija `rootDir: ./src`, excluye los tests y emite declaraciones. Lo usa `npm run build`.

---

## Depuración

### Inspeccionar el histórico v1

```bash
node -e "console.table(require('./.router-history/history.json').map(r => ({model: r.model, task: r.taskType, opt: r.optimizer, tokens: r.metrics.tokens, quality: r.metrics.quality})))"
```

### Inspeccionar los eventos v2

```bash
node -e "const e=require('./.router-history/events.json'); console.log('events:', e.length); console.table(e.slice(-10).map(x => ({type:x.type, model:x.model, task:x.taskType, opt:(x.decision||x.execution||{}).optimizer, synthetic:x.synthetic})))"
```

### Inspeccionar las métricas MCP

```bash
node -e "const m = require('./.router-history/mcp-metrics.json'); console.log('decisions:', m.length); console.table(m.slice(-10))"
```

### Inspeccionar la matriz de costes

Usa la herramienta MCP `get_router_stats` (format=legacy), o:

```typescript
import { JsonHistoryStore, buildCostMatrix, DEFAULT_ROUTER_OPTIONS } from 'klia-token-optimizer';

const store = new JsonHistoryStore({ filePath: './.router-history/history.json' });
const records = await store.list();
const matrix = buildCostMatrix(records, DEFAULT_ROUTER_OPTIONS);
for (const [key, scores] of matrix) {
  console.log(key);
  for (const [opt, score] of scores) {
    console.log('  ', opt, score);
  }
}
```

### Inspeccionar el reporte enriquecido v2

```bash
npm run router -- stats --model glm-5.2 --real-only
```

O llama a `get_router_stats` con `format=v2` desde el servidor MCP.

### Probar compact sin escribir

`router compact` es dry-run por defecto; el informe muestra lo que se eliminaría (TTL, huérfanos, rotación) sin tocar el fichero. Verifica el plan con `--json` antes de añadir `--write`.

### Logs del servidor MCP

El servidor MCP escribe logs JSON estructurados en `ROUTER_LOG_PATH` (por defecto `.router-history/mcp-server.log.json`). Cada entrada tiene `timestamp`, `level`, `message` y `meta`. Niveles: `debug`, `info`, `error`.

### Inspeccionar el health check

```bash
node dist/scripts/health-check.js --force --json
```

El estado vive en `~/.klia/data/health-state.json`; los plugins finos escriben su log de depuración en `~/.klia/logs/healthcheck-debug.log`. `KLIA_HEALTH_DISABLE=1` silencia el chequeo al arrancar.

### Problemas comunes

| Síntoma | Causa probable | Solución |
| ------- | -------------- | -------- |
| La decisión es siempre `V0` | El histórico está vacío para `(modelo, tarea)` | Registra ejecuciones o ejecuta `npm run calibrate`. |
| La decisión es siempre `V1` | `minSamples` o `minConfidence` no se cumplen | Baja los umbrales o registra más muestras. |
| `SEMBLE` nunca se selecciona | No está en `BASE_RULES` para la tarea, o evidencia/muestras insuficientes | Revisa `BASE_RULES` y registra más ejecuciones. |
| Las herramientas MCP no aparecen | El servidor no está arrancado o `opencode.jsonc` no está cargado | Ejecuta `npm run mcp-server` y revisa `opencode.jsonc`. |
| El reporte v2 de `get_router_stats` está vacío | `events.json` está vacío o todos los eventos son sintéticos | Llama a `migrate_history` o registra ejecuciones reales; pasa `excludeSynthetic=false` para ver datos sintéticos. |
| El fichero de histórico crece sin límite | Sin política de expulsión | Ejecuta `npm run router -- compact --write` (TTL 90 días, purga de huérfanos, `--rotate`). |
| `router stats` no ve datos | El fichero de eventos no está donde lo busca la CLI | Pasa `--events <path>` o fija `KLIA_HOME`/`ROUTER_EVENTS_PATH` (ver el orden de resolución de arriba). |
| El dashboard no arranca | El puerto 6283 ya está ocupado (u otra instancia del dashboard) | Usa `--port`, o revisa `~/.klia/logs/dashboard.log` tras `--detach`. |
| El autopilot no imprime nada | No hay ejecuciones en la última hora, o está deshabilitado | Solo reacciona a métricas de la última hora; comprueba con `npm run router -- autopilot --json`; re-habilita con `--enable`. |
| `router calibrate` sugiere el mismo valor | El umbral viene del fichero de configuración de OpenCode | Aplica la sugerencia con `--write`; verifica con `--min-confidence` para forzar un valor. |
| `JSON.parse` falla en un fichero del store | Un editor añadió un BOM | `stripBom` en `src/utils/json.ts` lo maneja al leer; re-guarda el fichero sin BOM. |
| El health check informa de datos antiguos tras un cambio | Los chequeos se limitan a `KLIA_HEALTH_HOURS` (24 h); los cacheados leen `health-state.json` | Ejecuta `node dist/scripts/health-check.js --force --json` para forzar un chequeo fresco. |
| El popup no aparece al arrancar | `KLIA_HEALTH_POPUP=off` o `KLIA_HEALTH_DISABLE=1`, o el chequeo estaba cacheado | Quita los deshabilitados o re-ejecuta con `--popup --force`; los errores de los plugins van a `~/.klia/logs/healthcheck-debug.log`. |

---

## Añadir un optimizador

1. Añade el optimizador a `Optimizer` en `src/types.ts`.
2. Añádelo a `BASE_RULES` en `src/rules/base-rules.ts` para los tipos de tarea relevantes. El orden importa: la primera entrada es el default V0.
3. Actualiza el enum de `RecordExecutionSchema` del servidor MCP en `src/mcp-server.ts` para permitir el nuevo optimizador en `record_execution`.
4. Actualiza la descripción de la herramienta `get_router_stats` en `src/mcp-server.ts` si hace falta.
5. Añade tests:
   - El selector lo elige cuando tiene el menor coste relativo.
   - El explorador puede elegirlo cuando no está explorado.
   - `record_execution` lo acepta.
6. Actualiza `README.md`, `README_en.md`, `dev.md` y `dev_es.md`.

El scorer y el history store no necesitan cambios; funcionan genéricamente con cualquier valor de `Optimizer`. El store de eventos v2 también recoge los optimizadores nuevos automáticamente.

---

## Añadir un tipo de tarea

1. Añade el tipo de tarea a `TaskType` en `src/types.ts`.
2. Actualiza `classifyTask` en `src/classifier/task-classifier.ts`. Añade las señales heurísticas si aplica.
3. Añade una entrada a `BASE_RULES` en `src/rules/base-rules.ts`.
4. Actualiza el enum `taskType` de la herramienta `get_router_stats` en `src/mcp-server.ts` (`GetStatsSchema`).
5. Actualiza `RouteTaskSchema` si añades nuevas señales específicas de la tarea.
6. Añade tests de clasificación, selección y exploración.
7. Actualiza la documentación.

---

## Cambiar la función de coste

La función de coste v1 vive en `computeRecordCost` en `src/scorer/expected-cost-scorer.ts`:

```typescript
let cost = metrics.tokens;
cost += metrics.latencySeconds * options.latencyWeight;
cost += metrics.toolingCost * options.toolingCostWeight;
if (metrics.failed) cost += options.failurePenalty;
cost += options.qualityPenalty * (1 - metrics.quality);
```

El equivalente v2 es `computeEventCost` en `src/scorer/stats-report.ts` (opera sobre eventos de ejecución `RouterEvent`). Mantén ambos sincronizados si cambias uno.

Para cambiarla:

1. Edita `computeRecordCost` (y `computeEventCost` si quieres que el reporte v2 coincida).
2. Si añades un nuevo peso, añádelo a `RouterOptions` y `DEFAULT_ROUTER_OPTIONS` en `src/types.ts`.
3. Añade la variable de entorno `ROUTER_*` correspondiente en `loadRouterOptionsFromEnv` en `src/mcp-server.ts`.
4. Añade tests en `tests/scorer/`.
5. Actualiza la documentación.

El coste relativo es `avgOptimizerCost / avgBaselineCost` por `(modelo, tarea)`. Si no hay baseline, se usa como denominador la media del propio optimizador, con lo que `relativeCost = 1`. Mantén este invariante salvo que quieras deliberadamente otra normalización.

---

## Internos del servidor MCP

El servidor MCP (`src/mcp-server.ts`, versión `2.0.0`) expone **cuatro** herramientas vía el Model Context Protocol sobre stdio:

| Herramienta | Schema | Efecto |
| ---- | ------ | ------ |
| `route_task` | `RouteTaskSchema` | Llama a `router.route(ctx)`, registra un `RouterEvent` de `decision` y registra una métrica MCP legacy. Devuelve la decisión más un `sessionId` para emparejar con `record_execution`. Acepta `sessionId` y `projectId` para el emparejamiento. |
| `record_execution` | `RecordExecutionSchema` | Construye un registro v1 vía `buildRecord` y llama a `router.recordExecution`. Además construye un `RouterEvent` de `execution` con `inputTokens`/`outputTokens` separados, `costUsd` (estimado vía `computeCostUsd` si no se proporciona), `retries`, `errorMessage`, `contextSizeBytesAfter`, `tokensPruned`, `actualToolCalls`, `routerLatencyMs`, `startedAt`, `completedAt`, `source`, `synthetic`. |
| `get_router_stats` | filtros opcionales `model`/`taskType`/`excludeSynthetic`/`format` | `format=v2` (por defecto): el reporte enriquecido (`summary`, `byModel`, `byModelTask`, `globalSavings`). `format=legacy`: total de registros, modelos únicos, la matriz de costes relativos y el resumen de uso MCP. |
| `migrate_history` | ninguno | Migra `events.json` de v1 a v2 in situ vía `RouterEventStore.migrateFile()`. Devuelve `{ migrated, migratedCount, eventsPath }`. Idempotente. |

Comportamientos clave:

- **Resolución de rutas**: las rutas relativas se resuelven contra la raíz del proyecto (encontrada subiendo hasta el package.json de `klia-token-optimizer`). Las rutas absolutas se usan tal cual.
- **Exploración**: deshabilitada por defecto en el servidor MCP (`enableExploration: false`). Pasa `explore: true` en `route_task` para habilitar V3 en esa única llamada.
- **Emparejamiento de sesiones**: `route_task` devuelve un `sessionId`. Pasa el mismo `sessionId` a `record_execution` para emparejar la decisión con su ejecución en el store de eventos v2.
- **Pricing**: cuando no se proporciona `costUsd` a `record_execution`, se estima vía `computeCostUsd(inputTokens, outputTokens, model, family)`.
- **Logging**: JSON estructurado a `ROUTER_LOG_PATH`. Cada llamada a herramienta registra la petición y el resultado o error.
- **Manejo de errores**: los errores de parseo y los nombres de herramienta desconocidos lanzan; el logger registra el error antes de relanzarlo.

### Instalar el servidor MCP en OpenCode

El instalador unificado (`install_klia_tokens.ps1`) lo hace automáticamente. Para una instalación manual:

Edita `opencode.jsonc`:

```jsonc
{
  "mcpServers": {
    "klia-token-optimizer": {
      "type": "local",
      "command": ["node", "C:/ProyectosV2/telemetria/klia-token-optimizer/dist/mcp-server.js"],
      "enabled": true,
      "env": {
        "ROUTER_HISTORY_PATH": "C:/ProyectosV2/telemetria/klia-token-optimizer/.router-history/history.json",
        "ROUTER_EVENTS_PATH": "C:/ProyectosV2/telemetria/klia-token-optimizer/.router-history/events.json",
        "ROUTER_METRICS_PATH": "C:/ProyectosV2/telemetria/klia-token-optimizer/.router-history/mcp-metrics.json"
      }
    }
  }
}
```

Ejecuta primero `npm run build` para que exista `dist/mcp-server.js`.

El instalador unificado también:
- Escribe el plugin `klia-auto-record.ts` (auto-registra métricas reales tras cada sesión vía `router-cli.js --record-execution`).
- Inyecta el system prompt en `opencode.jsonc`.
- Ajusta `base-rules.ts` si algún optimizador falló al instalarse.
- Calibra el histórico con registros baseline.
- Instala los cinco comandos slash `/klia_*` en los directorios de comandos de OpenCode y Kilo (desde `commands/`, reescribiendo los placeholders `__KLIA_INSTALL_DIR__` y `__KLIA_HOME__`).
- Instala los plugins finos `klia-healthcheck.ts` en los directorios de plugins de Kilo y OpenCode (v1/v2) (fase 16). Ejecutan `dist/scripts/health-check.js --popup` en el arranque del editor y muestran un popup de Windows con el resultado, o con el componente que falló.

---

## Convenciones de código

- **Lenguaje**: TypeScript con `strict: true`.
- **Sistema de módulos**: CommonJS (`"type": "commonjs"` en `package.json`).
- **Nombres**: Inglés descriptivo para los símbolos, español para los comentarios.
- **Sin emojis** en código ni documentación.
- **Responsabilidad única**: mantener los módulos pequeños.
- **Los tests espejan src**: `tests/scorer/` para `src/scorer/`, etc.
- **Imports**: imports relativos dentro de `src/`; imports de tipos con `import type` siempre que sea posible.
- **Sin globales de Vitest**: importa `describe`, `it`, `expect` desde `vitest`.
- **v1 y v2 sincronizados**: al cambiar la función de coste v1, actualiza el equivalente v2 (`computeEventCost`) para que el reporte enriquecido coincida con las decisiones del router adaptativo.

---

## Errores comunes

### Olvidar registrar métricas reales

El router solo aprende cuando se llama a `recordExecution`. Si solo llamas a `route_task`, las decisiones se quedan en V0/V1 para siempre. Las CLIs y el servidor MCP están diseñados para facilitar el registro; úsalos. El plugin `klia-auto-record` cierra el ciclo automáticamente.

### Editar `tsconfig.json` en lugar de `tsconfig.build.json`

`tsconfig.json` incluye los tests y lo usan Vitest y el IDE. `tsconfig.build.json` es el que produce `dist/`. Editar el fichero equivocado hará que el build incluya los tests o que falle el type checking del editor.

### Escrituras concurrentes en el fichero de histórico

`JsonHistoryStore` y `RouterEventStore` serializan las escrituras con un lock de cadena de Promesas dentro del proceso, y ambos usan `writeFileSyncAtomic` (fichero temporal + rename) de `src/utils/json.ts`, de modo que un crash ya no deja un fichero JSON a medio escribir. Aun así, dos procesos pueden sobrescribirse mutuamente la última escritura; ejecuta un único servidor MCP por fichero de histórico.

### BOM en los ficheros JSON del store

Algunos editores de Windows añaden un BOM U+FEFF que rompe `JSON.parse`. Los stores leen a través de `readJsonSync`/`readJsonAsync` (tolerantes al BOM), con lo que lo toleran, pero ficheros temp editados a mano o herramientas externas pueden no hacerlo. Guarda los ficheros del store sin BOM o repasa por la API del store.

### Puerto del dashboard ocupado

`router dashboard` escucha por defecto en `127.0.0.1:6283`. Un segundo arranque (o un hijo `--detach` residual) falla al bindear; cambia el puerto con `--port` o revisa `~/.klia/logs/dashboard.log`.

### Coste relativo sin baseline

Si no existen registros `BASELINE` para un `(modelo, tarea)`, `computeRelativeCost` usa como denominador la media del propio optimizador, con lo que `relativeCost = 1`. Esto significa que la matriz mostrará `1.0` para todos los optimizadores y el selector caerá a la regla V0. Registra al menos una ejecución baseline por `(modelo, tarea)` para obtener costes relativos con sentido.

### Olvidar actualizar el enum del MCP

Cuando añades un optimizador, debes actualizar el enum `optimizer` de `RecordExecutionSchema` en `src/mcp-server.ts`. Si no, `record_execution` rechazará los registros del nuevo optimizador con un error de validación de Zod.

### Mezclar costes v1 y v2

`computeRecordCost` (v1) y `computeEventCost` (v2) deben mantenerse alineados. Si cambias la función de coste v1 y olvidas la v2, el reporte enriquecido (`get_router_stats` format=v2 y `router stats`) divergirá de las decisiones que toma realmente el router adaptativo.

### `forceConsistentCasingInFileNames`

Está habilitado en `tsconfig.json`. En filesystems case-insensitive (Windows, default de macOS), un casing inconsistente compila pero falla en CI de Linux. Sé consistente.
