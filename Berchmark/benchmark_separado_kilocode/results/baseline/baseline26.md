# Prueba 26 - EMPAQUETADO_REPO

**Prompt:** Empaqueta solo la carpeta src/selector/ y muestrame cuantas lineas tiene cada fichero.
**Categoria:** EMPAQUETADO_REPO
**TaskType:** REPO_PACKAGING
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-22T09:14:14Z
**Duracion:** 155s
**Estado:** success

## Respuesta

Empaquetado creado en `src-selector-packaged.txt` (1580 tokens, 2 ficheros). Líneas por fichero:Empaquetado de `src/selector/` completado en `src-selector-packaged.txt` (1580 tokens, 2 ficheros, ~64% de ahorro con `--compress`).

| Fichero | Líneas |
|---|---|
| src/selector/optimizer-selector.ts | 181 |
| src/selector/exploration.ts | 118 |
| **Total** | **299** |

## Metricas

- tokens_input: 38135
- tokens_output: 477
- tokens_reasoning: 140
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 38752
- cost_usd: 0
- tool_calls: 4
- tools_usadas: glob, bash, bash, bash
- assistant_messages: 5
