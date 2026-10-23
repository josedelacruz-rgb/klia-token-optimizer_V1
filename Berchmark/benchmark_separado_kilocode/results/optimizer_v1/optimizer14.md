# Prueba 14 - BUSQUEDA_FUNCION

**Prompt:** Quiero saber donde aparece el texto 'version: V0' en src/. Lista las lineas.
**Categoria:** BUSQUEDA_FUNCION
**TaskType:** LITERAL_SEARCH
**Modelo:** klia/GLM-5.2
**Modo:** optimizer
**Fecha:** 2026-10-22T07:38:12Z
**Duracion:** 51s
**Estado:** success
**Router KLIA:** BASELINE/LITERAL_SEARCH

## Respuesta

No hay coincidencias exactas de `version: V0` en `src/`. Pruebo variantes (mayúsculas/minúsculas, espacios):El texto exacto `version: V0` no existe en `src/` (el código usa comillas: `version: 'V0'`). Coincidencias de `version: 'V0'`:

| Archivo | Línea | Contenido |
|---|---|---|
| `src/index.ts` | 62 | `version: 'V0',` |
| `src/types.ts` | 87 | `version: 'V0' \| 'V1' \| 'V2' \| 'V3';` (tipo) |
| `src/types.ts` | 168 | `version: 'V0' \| 'V1' \| 'V2' \| 'V3';` (tipo) |
| `src/selector/optimizer-selector.ts` | 50 | `version: 'V0',` |
| `src/selector/optimizer-selector.ts` | 107 | `version: 'V0',` |
| `src/selector/optimizer-selector.ts` | 164 | `version: 'V0',` |

Asignaciones reales de valor `'V0'` (excluyendo declaraciones de tipo): `src/index.ts:62`, `src/selector/optimizer-selector.ts:50,107,164`. Además `src/history/migrate.ts:134-135` asigna `'V0'` por defecto en la migración.

## Metricas

- tokens_input: 22435
- tokens_output: 547
- tokens_reasoning: 346
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 23328
- cost_usd: 0
- tool_calls: 4
- tools_usadas: grep, grep, grep, grep
- assistant_messages: 3
