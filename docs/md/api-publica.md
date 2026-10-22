# API publica de `src/index.ts`

Punto de entrada del router adaptativo. Reune la fabrica del router, los
builders de contexto/registro y los simbolos de soporte (clasificacion,
historico, seleccion, descubrimiento de modelos) que un consumidor externo
necesita para enrutar tareas y registrar resultados.

Todos los tipos y funciones listados a continuacion se importan desde el
paquete raiz (`src/index.ts`).

---

## 1. Fabrica del router

### `createAdaptiveRouter(config: AdaptiveRouterOptions): AdaptiveRouter`

Construye una instancia del router adaptativo lista para enrutar tareas y
registrar ejecuciones. Es la forma recomendada de consumir el router.

Internamente crea un `JsonHistoryStore` contra `config.historyPath`, fusiona
`config.routerOptions` con `DEFAULT_ROUTER_OPTIONS` y decide si la
exploracion V3 esta activa (`config.enableExploration`, por defecto `true`).

El objeto devuelto expone tres metodos:

| Metodo | Cometido |
| --- | --- |
| `route(ctx, opts?)` | Clasifica la tarea (`ctx.signals`) y devuelve un `RouterDecision` con el optimizador recomendado. Si la exploracion V3 esta activa delega en `selectOptimizerWithExploration`; si no, cae a `selectOptimizer` o a la regla base (`V0`) cuando no hay historial para `model/taskType`. |
| `recordExecution(record)` | Persiste una `ExecutionRecord` en el historico (alta pereza, con lock interno). |
| `inferTaskType(signals)` | Atajo a `classifyTask`; devuelve el `TaskType` sin enrutar. |

### `AdaptiveRouterOptions`

Configuracion de la fabrica.

| Campo | Tipo | Defecto | Descripcion |
| --- | --- | --- | --- |
| `historyPath` | `string` | (obligatorio) | Ruta del archivo JSON de historico. |
| `routerOptions?` | `RouterOptions` | `DEFAULT_ROUTER_OPTIONS` | Pesos y umbrales del router (confianza minima, tasa de exploracion, pesos de latencia/tooling, penalizaciones). |
| `enableExploration?` | `boolean` | `true` | Si es `false`, se desactiva la exploracion automatica V3 y solo se explota evidencia. |
| `modelFamilyExtractor?` | `(model: string) => string \| undefined` | `extractModelFamily` | Funcion para inferir la familia de un modelo (útil para pruebas o herencia custom). |

### `AdaptiveRouter` (interfaz)

Contrato del router devuelto por la fabrica. Expone `route`,
`recordExecution` e `inferTaskType` (ver tabla anterior).

---

## 2. Builders de conveniencia

### `buildContextFromQuery(model, query, base?): RouterContext`

Construye un `RouterContext` a partir de una query de texto plano.

- `extractSignalsFromQuery(query, base)` rellena heuristicamente las senales
  (`hasTerminalCommands`, `isRefactor`, `isMultistep`, `isRepositorySearch`,
  `isPackaging`, `isLiteralSearch`, etc.) a partir del texto.
- Los valores pasados en `base` tienen prioridad sobre la heuristica.
- Devuelve `{ model, signals }` listo para pasarselo a `router.route(...)`.

### `buildRecord(ctx, optimizer, metrics, modelFamilyExtractor?): ExecutionRecord`

Fabrica una `ExecutionRecord` lista para `router.recordExecution(...)`.

- Infiere `modelFamily` con `modelFamilyExtractor ?? extractModelFamily`.
- Clasifica la tarea con `classifyTask(ctx.signals)`.
- Copia `fileCount`, `contextSizeBytes` y `toolCallsExpected` de las senales
  al `contextSnapshot`.
- Genera `id` y `timestamp` internamente via `createExecutionRecord`.

Permite al consumidor no lidiar con los detalles del esquema de registro.

---

## 3. Clasificacion de tareas (re-exportados)

### `classifyTask(signals, opts?): TaskType`

Nucleo del clasificador. Devuelve uno de: `SMALL_CODE`, `TERMINAL`,
`LARGE_CONTEXT`, `REPOSITORY_SEARCH`, `REPO_PACKAGING`, `LITERAL_SEARCH`,
`MULTISTEP`, `REFACTOR`, `UNKNOWN`.

Orden de prioridad:

1. Senales explicitas: `isRefactor` > `isMultistep` > `hasTerminalCommands` >
   `isPackaging` > `isLiteralSearch`/`isRepositorySearch`.
2. Heuristicas por tamano de contexto y numero de archivos.
3. Fallback a `UNKNOWN`.

`opts` permite ajustar umbrales (`largeContextThresholdBytes`,
`extremeContextThresholdBytes`, `manyFilesThreshold`).

### `extractSignalsFromQuery(query, base?): TaskSignals`

Extrae senales heuristicas de un texto. Lo usa `buildContextFromQuery`.
Los campos de `base` (parcial) tienen prioridad; los ausentes se deducen por
regex sobre la query (comandos de terminal, refactor, multistep, busqueda,
empaquetado, busqueda literal vs semantica, intenciones de
documentacion/onboarding).

---

## 4. Historico y registros (re-exportados)

### `JsonHistoryStore` (clase)

Implementacion de `HistoryStore` sobre un archivo JSON. Metodos publicos:

| Metodo | Cometido |
| --- | --- |
| `add(record)` | Anade un registro (con lock para evitar escrituras concurrentes). |
| `list()` | Devuelve todos los registros. |
| `query(model, taskType, optimizer?)` | Filtra por modelo + tipo de tarea (+ optimizador opcional). |
| `queryByFamily(family, taskType, optimizer?)` | Filtra por familia heredada (confianza reducida). |

Crea el archivo y el directorio padre si no existen.

### `createExecutionRecord(model, modelFamily, taskType, optimizer, metrics, contextSnapshot): ExecutionRecord`

Fabrica de bajo nivel de un `ExecutionRecord`. Genera `id` (`Date.now()` +
aleatorio) y `timestamp` ISO. Es la base que usa `buildRecord`.

### `McpMetricsStore` (clase, re-exportada)

Store legacy v1 de decisiones/metricas MCP. Metodos publicos:

| Metodo | Cometido |
| --- | --- |
| `record(metric)` | Anade una `McpUsageMetric`. |
| `list()` | Devuelve todas las metricas. |
| `summary()` | Resumen agregado: `totalDecisions`, `totalExecutions`, `byTaskType`, `byOptimizer`, `byModelFamily`, `avgQuality`, `failureRate`. |

Se mantiene por compatibilidad; el esquema unificado v2 (`RouterEvent`) vive
en `router-event-store.ts` y no se expone desde `index.ts`.

---

## 5. Seleccion de optimizador (re-exportado)

### `selectOptimizerWithExploration(model, taskType, deps, options?, random?, forcedDefault?): Promise<ExplorationResult>`

Selector V3 con exploracion/explotacion controlada.

- Calcula la decision base con `selectOptimizer`.
- Si hay confianza suficiente pero hay savers candidatos con muestras
  insuficientes, les da oportunidad con la tasa de exploracion (evita deadlock
  de "no se elige hasta tener muestras").
- Si la confianza es baja y no se explora, cae a fallback seguro
  (`defaultOptimizerForTask`).
- Si se explora, elige un optimizador no probado entre los candidatos.

Devuelve `{ decision, explored, exploitedOptimizer }`. La `decision` ya es un
`RouterDecision` completo (version `V3`).

---

## 6. Utilidades de modelo (re-exportadas)

### `extractModelFamily(model: string): string`

Extrae la familia de un identificador de modelo (`glm`, `deepseek`, `kimi`,
`qwen`, `mistral`, `nemotron`, `minimax`, `gemma`, `devstral`, `cosmos`,
`ami`, `codestral`, `llama`, ...). Las familias mas largas se comprueban
antes para evitar matches parciales. Fallback: primer segmento alfabetico, o
`unknown`.

### `normalizeModel(model: string): string`

Normaliza a minusculas y recorta espacios. KLIA acepta casing mixto
(`GLM-5.2`, `glm-5.2`); se usa al guardar y consultar para evitar entradas
duplicadas en el historico.

### `isChatModel(modelId: string): boolean`

Filtra modelos que no son de chat (embeddings, imagen, moderacion, flux).
KLIA expone todos los modelos en `/v1/models`, pero el router solo enruta
modelos de chat.

---

## 7. Descubrimiento de modelos KLIA (re-exportados)

### `discoverModels(apiKey?): Promise<DiscoveryResult>`

Descubrimiento con fallback: intenta la API de KLIA (`/v1/models`) si hay
API key; si falla o devuelve 0 modelos, usa `SNAPSHOT_MODELS`. Devuelve
`{ models, source: 'api' | 'snapshot', error? }`. Cada modelo viene como
`{ id, family }`.

### `discoverModelsFromApi(apiKey?): Promise<DiscoveredModel[]>`

Llamada directa a la API de KLIA. Lanza si no hay API key o si la respuesta
no es valida. Filtra solo modelos de chat (`isChatModel`).

### `detectKliaApiKey(): string | null`

Resuelve la API key de KLIA en este orden:

1. `process.env.KLIA_API_KEY` (debe empezar por `key-`).
2. `process.env.OPENAI_API_KEY` si empieza por `key-`.
3. `provider.klia.options.apiKey` en `opencode.jsonc`/`opencode.json`.

Devuelve `null` si no la encuentra.

### `SNAPSHOT_MODELS: string[]`

Lista estatica de modelos de KLIA (copia de seguridad). Se ignora si la API
responde. Se actualiza manualmente al publicar una nueva version.

### Tipos: `DiscoveredModel`, `DiscoveryResult`

- `DiscoveredModel`: `{ id: string; family: string }`.
- `DiscoveryResult`: `{ models: DiscoveredModel[]; source: 'api' | 'snapshot'; error?: string }`.

---

## 8. Tipos re-exportados

| Tipo | Descripcion |
| --- | --- |
| `RouterContext` | Entrada de `route`: `{ model, signals }`. |
| `RouterDecision` | Salida de `route`: optimizador, version (`V0`-`V3`), razon, confianza, `taskType`, flags de exploracion y alternativas. |
| `RouterOptions` | Umbrales y pesos del router (`minConfidence`, `explorationRate`, `minSamples`, pesos de latencia/tooling, penalizaciones, `familyConfidenceWeight`). |
| `TaskSignals` | Senales de la tarea: `query`, `fileCount`, `contextSizeBytes`, `toolCallsExpected` y flags booleanos de intencion. |

---

## 9. Constante: `DEFAULT_ROUTER_OPTIONS`

Valores por defecto de `RouterOptions` (todos los campos requeridos):

| Campo | Valor |
| --- | --- |
| `minConfidence` | `0.6` |
| `explorationRate` | `0.1` |
| `minSamples` | `3` |
| `latencyWeight` | `1.0` |
| `toolingCostWeight` | `1.0` |
| `failurePenalty` | `5.0` |
| `qualityPenalty` | `3.0` |
| `familyConfidenceWeight` | `0.5` |

---

## Uso tipico

```ts
import {
  createAdaptiveRouter,
  buildContextFromQuery,
  buildRecord,
} from 'klia-token-optimizer';

const router = createAdaptiveRouter({
  historyPath: './data/history.json',
});

const ctx = buildContextFromQuery('glm-5.2', 'refactoriza el modulo de auth', {
  fileCount: 12,
  contextSizeBytes: 200_000,
});

const decision = await router.route(ctx);
// decision.optimizer, decision.reason, decision.confidence, decision.taskType

// ... ejecutar la tarea con decision.optimizer y medir metrics ...

await router.recordExecution(
  buildRecord(ctx, decision.optimizer, {
    tokens: 4350,
    latencySeconds: 1.2,
    toolingCost: 0,
    quality: 0.9,
    failed: false,
  }),
);
```
