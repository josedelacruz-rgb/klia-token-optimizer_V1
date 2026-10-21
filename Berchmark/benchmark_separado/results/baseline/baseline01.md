# Prueba 01 - BUSQUEDA_FUNCION

**Prompt:** Busca la funcion classifyTask en este codigo y muestrame donde esta y que hace.
**Categoria:** BUSQUEDA_FUNCION
**TaskType:** REPOSITORY_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-21T13:44:52Z
**Duracion:** 39s
**Estado:** success

## Respuesta

## `classifyTask`

**Ubicación:** `src/classifier/task-classifier.ts:45`

**Qué hace:** Clasifica una tarea en una de las categorías del router (`TaskType`) a partir de un objeto `TaskSignals`. Aplica un orden de prioridad estricto:

1. **Señales explícitas** (líneas 51-65) — si la tarea se marca como refactor, multistep, comandos de terminal o búsqueda en repo, retorna esa categoría inmediatamente.
2. **Heurística de tamaño** (líneas 67-70) — si el contexto supera 1 MB, retorna `LARGE_CONTEXT` (delegando en `classifyContextSize`, que distingue también un nivel "extremo" a partir de 5 MB).
3. **Heurística de archivos** (líneas 72-83) — muchos archivos → `REPOSITORY_SEARCH`; pocos archivos y contexto pequeño → `SMALL_CODE`.
4. **Fallback** → `UNKNOWN`.

**Firma:**
```ts
classifyTask(signals: TaskSignals, opts?: TaskClassifierOptions): TaskType
```

**Uso principal:** Se invoca desde `src/index.ts:40,44,97` dentro del router para determinar el `TaskType` que luego alimenta `BASE_RULES` y el selector de optimizadores.

Complementariamente, `extractSignalsFromQuery` (mismo archivo, línea 92) deriva las `TaskSignals` desde texto plano usando regex en inglés y español.

## Metricas

- tokens_input: 20563
- tokens_output: 453
- tokens_reasoning: 33
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 21049
- cost_usd: 0
- tool_calls: 2
- tools_usadas: grep, read
- assistant_messages: 3
