# Prueba 32 - DOCUMENTACION

**Prompt:** Que hace el hook chat.message del plugin? Explica el flujo completo paso a paso.
**Categoria:** DOCUMENTACION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T08:06:25Z
**Duracion:** 184s
**Estado:** success
**Router KLIA:** DCP/MULTISTEP

## Respuesta

The plugin is `klia-router-inject.ts`. Let me find and read it.El plugin es `klia-router-inject.ts` (en `~/.config/kilo/plugin/`). Exporta `{ id, server }` (API V1 de Kilo). El `server` devuelve un objeto de hooks con `chat.message` (klia-router-inject.ts:784-906). Flujo completo del hook:

## 1. Disparo del hook
Kilo llama `chat.message(input, output)` en cada mensaje de usuario. `input` trae `{ sessionID, agent, model, messageID, variant }`; `output` trae `{ message, parts }` (klia-router-inject.ts:791).

## 2. Extracción y guardas iniciales (klia-router-inject.ts:793-797)
- `resolveParts(input, output)` localiza el array de partes (prefiere `output.parts`).
- `extractPromptText(parts)` concatena las partes de tipo `text`.
- **Guardas de salida temprana**: si no hay texto, o el texto ya contiene el marcador `[KLIA]` (evita re-procesar inyecciones previas), o no hay `sessionID` → return.

## 3. Resolución de modelo y messageID (klia-router-inject.ts:798-799)
`resolveDefaultModel(input.model)`: usa `providerID/modelID` del evento; si no, lee `model` de `kilo.jsonc`/`opencode.jsonc`; si no, `KLIA_DEFAULT_MODEL`; fallback `klia/deepseek-v4-flash-demo`.

## 4. Llamadas paralelas al router (klia-router-inject.ts:801-804)
`Promise.all` de dos invocaciones al CLI compilado (`dist/router-cli.js`):
- **`routeRecommendation(text, model, sessionID)`** (klia-router-inject.ts:242-319): consulta al router. Revisa caché LRU (solo aciertos, TTL 5 min, 100 entradas); si miss, lanza `node router-cli.js --model --query --history --events --session-id --project-id --explore` con timeout 15s. Parsea JSON (o `KEY=VALUE` como fallback). Devuelve `{ optimizer, taskType, refused? }`.
- **`checkReprompt(text, sessionID)`** (klia-router-inject.ts:652-678): lanza `router-cli.js reprompt --query --session-id --events` (timeout 12s). Devuelve `boolean` si la consulta es repetida dentro de la ventana (30 min por defecto).

## 5. Recolector de partes extra (klia-router-inject.ts:806-807)
`extraParts = []`. Si `isRepeatPrompt`, añade `RETRY_NOTICE` ("cambia de enfoque").

## 6. Rama: sin recomendación (klia-router-inject.ts:809-813)
Si el router no respondió (timeout/no disponible): añade `extraParts` si hay, loguea, return. No hay inyección (sesión 100% nativa).

## 7. Rama: gate "refused" (tarea pequeña/trivial) (klia-router-inject.ts:819-851)
El router marca `{refused:true}` cuando la tarea es pequeña:
- `rememberPending(...)` registra la decisión pendiente (para que `klia-auto-record` cierre el bucle después).
- Si `refusedMayBenefitFromSearch(text)` (query ≥ 40 chars Y coincide con regex de vocabulario de código: `funcion|clase|busca|dónde|referencias|...`), ejecuta `computePrunedContext` con Semble forzado a `SEMBLE`/`REPOSITORY_SEARCH`.
  - **Si hay resultado podado**: sobreescribe el pending a `SEMBLE` (para que el registro sea veraz), escribe class-state, e inyecta `PRUNED_HEADER + pruned` (la búsqueda ya hecha, 0 tool calls del agente).
  - **Si no**: queda 100% nativa (solo `extraParts`).
- Return.

## 8. Registro pendiente (no-refused) (klia-router-inject.ts:860)
Siempre `rememberPending` **antes** del chequeo de directiva. Crítico: si no, las tareas BASELINE no pequeñas (cuya `buildDirective` retorna null) nunca registrarían pending → el auto-record no escribe eventos → el router no aprende de BASELINE → `relativeCost=1` → el gate fuerza BASELINE siempre (memoria muerta).

## 9. Construcción de la directiva (klia-router-inject.ts:861-866)
`buildDirective(optimizer, taskType)` (klia-router-inject.ts:120-129):
- Si `optimizer` ∈ `DIRECT_OPTIMIZERS` (RTK/SEMBLE/REPOMIX/CONTEXT_MODE/DCP) → devuelve `[KLIA] TASKTYPE: <texto saver>. Sin route_task.`
- Si no (BASELINE/SMALL_CODE/UNKNOWN) → `null`.

Si es `null`: añade `extraParts` si hay, return (sesión nativa, 0 overhead).

## 10. Dedup por sesión (klia-router-inject.ts:868-872)
`shouldInject(sessionID, directive)`: si la directiva es idéntica a la última inyectada en esa sesión, la omite (escribe class-state `injected=false`) y return. LRU cap 200 sesiones. Evita pagar la misma directiva N veces.

## 11. Contexto podado pre-computado (klia-router-inject.ts:873-888)
`computePrunedContext(text, optimizer, taskType, projectRoot)` (klia-router-inject.ts:599-645):
- Solo procede si `optimizer ∈ PRUNED_OPTIMIZERS` (`['SEMBLE']`) Y `taskType ∈ PRUNED_TASK_TYPES` (`['REPOSITORY_SEARCH','LARGE_CONTEXT']`).
- Resuelve el binario de Semble (`resolveSembleCommand`: rutas conocidas en Windows sin pasar por cmd.exe por seguridad).
- Lanza `semble search <query> <projectRoot> --max-snippet-lines 10 -k 3` (timeout 20s).
- `compactSembleOutput` convierte el JSON a líneas `archivo:start-end\ncontenido` (elimina `score` de 17 dígitos, ahorra ~20% del bloque), respeta `maxChars` (4000 por defecto).
- Caché LRU: 50 entradas, 200 KB total, TTL 10 min.
- Si hay resultado: sobreescribe pending con `tokensPruned` y añade `PRUNED_HEADER + pruned` a `extraParts`.

## 12. Inyección final (klia-router-inject.ts:889-900)
`appendToPrompt(parts, directive + tail, ...)` (klia-router-inject.ts:766-782): añade el texto al final de la última parte de texto del mensaje (o crea una parte nueva). El agente recibe el prompt ya modificado. Loguea inyección con taskType/optimizer/chars podados/reprompt.

## 13. Captura de errores (klia-router-inject.ts:901-903)
Cualquier excepción se loguea a `~/.klia/logs/router-inject-debug.log` (vía `dbg`) y no rompe la sesión del usuario.

## Resumen de la política (Saver-Direct)
| Caso | Qué se inyecta |
|---|---|
| Sin router / refused trivial | Nada (nativa pura) |
| refused + pinta de código | Bloque podado de Semble (búsqueda pre-hecha) |
| refused sin pinta de código | Nada (nativa pura) |
| BASELINE/SMALL_CODE/UNKNOWN | Nada (nativa pura, 0 overhead) |
| Saver (RTK/SEMBLE/REPOMIX/CONTEXT_MODE/DCP) | `[KLIA] TASKTYPE: ... Sin route_task.` (+ bloque podado si aplica) |

La idea central (cabecera del archivo, klia-router-inject.ts:1-23): **evita pasar por el MCP `route_task`** (overhead fijo ~2.5-3.5k tokens por sesión) y en su lugar inyecta una directiva compacta de ~8-12 tokens que ordena usar directamente el aplicativo. Por eso la directiva que recibí en esta sesión (`[KLIA] MULTISTEP: usa EXCLUSIVAMENTE DCP poda el contexto entre pasos. Sin route_task.`) salió de este hook: el router clasificó la query como `MULTISTEP` y recomendó `DCP`.

## Metricas

- tokens_input: 132836
- tokens_output: 2760
- tokens_reasoning: 2078
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 137674
- cost_usd: 0
- tool_calls: 10
- tools_usadas: grep, glob, grep, read, glob, read, read, grep, bash, read
- assistant_messages: 7
