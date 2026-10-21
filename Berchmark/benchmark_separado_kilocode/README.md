# Benchmark Separado - Baseline vs Optimizer

## Objetivo

Determinar, mediante datos reproducibles, si los optimizadores de contexto
(context-mode, semble, repomix, rtk, serena) reducen el consumo de tokens
y mejoran la calidad de las respuestas frente al baseline, manteniendo el
mismo proveedor y modelo.

## Como funciona

1. Tu activas o desactivas los optimizadores en `~/.config/kilo/kilo.jsonc`.
2. Ejecutas el script correspondiente:
   - `run-baseline.ps1` cuando los optimizadores estan DESACTIVADOS.
   - `run-optimizer.ps1` cuando los optimizadores estan ACTIVADOS.
3. Cada script lanza `kilocode run` para cada query y genera un .md con
   la respuesta y las metricas.
4. Los archivos se numeran igual en ambos scripts: `baseline07.md` y
   `optimizer07.md` corresponden a la misma query (Q07).

Los scripts no modifican la configuracion de kilocode. Tu decides cuando
los optimizadores estan on/off.

## Bateria de queries

18 queries en 10 categorias:

| # | Categoria | TaskType | Descripcion |
|---|---|---|---|
| Q01-Q02 | BUSQUEDA_FUNCION | REPOSITORY_SEARCH | Localizar funciones |
| Q03-Q04 | BUSQUEDA_REFERENCIAS | REPOSITORY_SEARCH | Encontrar usos |
| Q05-Q06 | EMPAQUETADO_REPO | LARGE_CONTEXT | Vision global del repo |
| Q07-Q08 | DOCUMENTACION | LARGE_CONTEXT / SMALL_CODE | Explicar codigo |
| Q09-Q10 | COMANDO_TERMINAL | TERMINAL | git log, git status |
| Q11-Q12 | ANALISIS_ESTRUCTURA | LARGE_CONTEXT / SMALL_CODE | Estructura del proyecto |
| Q13-Q14 | REFACTOR | REFACTOR | Refactorizar y renombrar |
| Q15-Q16 | FIX_BUG | SMALL_CODE / MULTISTEP | Corregir bugs |
| Q17 | TEST | SMALL_CODE | Escribir tests |
| Q18 | MULTISTEP | MULTISTEP | Cambio multi-archivo |

Las queries Q01-Q12 son tareas de lectura (read-only).
Las queries Q13-Q18 son tareas de MODIFICACION (refactor, fix, test, multistep),
representativas del trabajo real de un programador.

Las queries no mencionan herramientas MCP ni palabras clave del router.
Solo se pasa el prompt a kilocode. El modelo decide como resolver cada tarea.

## Uso

### Benchmark baseline (optimizadores OFF)

```powershell
# 1. Desactiva los optimizadores en kilo.jsonc
# 2. Ejecuta:
.\run-baseline.ps1
```

### Benchmark optimizer (optimizadores ON)

```powershell
# 1. Activa los optimizadores en kilo.jsonc
# 2. Ejecuta:
.\run-optimizer.ps1
```

### Parametros

| Parametro | Default | Descripcion |
|---|---|---|
| `-TimeoutMinutes` | 5 | Minutos maximos por query |
| `-Queries` | todas | Lista de numeros (ej: "1,5,13") |
| `-ProjectDir` | repo padre | Proyecto objetivo |
| `-Model` | de queries.json | Modelo (ej: klia/GLM-5.2) |

### Ejemplos

```powershell
# 25 minutos por query
.\run-baseline.ps1 -TimeoutMinutes 25

# Solo queries 1, 5 y 13
.\run-optimizer.ps1 -Queries 1,5,13

# Otro proyecto
.\run-baseline.ps1 -ProjectDir "C:\otros\proyecto"

# Combinacion
.\run-optimizer.ps1 -Queries 1,5,13 -TimeoutMinutes 10 -Model klia/GLM-5.2
```

## Salida

Cada query genera un archivo .md:

```
results/
  baseline/
    baseline01.md
    baseline02.md
    ...
    baseline18.md
  optimizer/
    optimizer01.md
    optimizer02.md
    ...
    optimizer18.md
logs/
  baseline-01.raw.jsonl    # stream JSON de kilocode run
  baseline-01.log          # stderr
  optimizer-01.raw.jsonl
  optimizer-01.log
  ...
```

### Estructura del .md

```markdown
# Prueba 07 - DOCUMENTACION

**Prompt:** Explica que hace el modulo src/classifier/...
**Categoria:** DOCUMENTACION
**TaskType:** LARGE_CONTEXT
**Modelo:** klia/GLM-5.2
**Modo:** baseline
**Fecha:** 2026-10-21T14:30:00Z
**Duracion:** 47s
**Estado:** success

## Respuesta

<respuesta del modelo>

## Metricas

- tokens_input: 12345
- tokens_output: 678
- tokens_reasoning: 0
- tokens_cache_read: 0
- tokens_cache_write: 0
- tokens_total: 13023
- cost_usd: 0.0123
- tool_calls: 3
- tools_usadas: read, glob, read
- assistant_messages: 2
```

## Metricas

Las metricas se extraen del stream JSON de `kilocode run --format json`.
No se consulta la BD SQLite de kilocode.

| Metrica | Fuente | Descripcion |
|---|---|---|
| tokens_input | stream JSONL | Tokens de entrada (sumados por step) |
| tokens_output | stream JSONL | Tokens de salida (sumados por step) |
| tokens_reasoning | stream JSONL | Tokens de razonamiento |
| tokens_cache_read | stream JSONL | Tokens leidos de cache |
| tokens_cache_write | stream JSONL | Tokens escritos a cache |
| tokens_total | stream JSONL | Suma total de tokens |
| cost_usd | stream JSONL | Coste en USD (sumado por step) |
| tool_calls | stream JSONL | Numero de llamadas a herramientas |
| tools_usadas | stream JSONL | Lista de herramientas usadas |
| assistant_messages | stream JSONL | Numero de mensajes del asistente |

## Comparacion

Para comparar baseline vs optimizer, abre los archivos con el mismo numero:

- `baseline01.md` vs `optimizer01.md` = Q01 (BUSQUEDA_FUNCION)
- `baseline13.md` vs `optimizer13.md` = Q13 (REFACTOR)
- `baseline18.md` vs `optimizer18.md` = Q18 (MULTISTEP)

Calculo de ahorro:

```
ahorro_tokens (%) = ((tokens_baseline - tokens_optimizer) / tokens_baseline) * 100
```

Valor positivo: ahorro. Valor negativo: incremento de consumo.

## Estados posibles

| Estado | Descripcion |
|---|---|
| success | El modelo termino con reason="stop" |
| success_with_errors | Termino pero hubo errores en el stream |
| failed | Termino con errores, sin completar |
| incomplete | El stream no tiene step_finish con stop |
| timeout | Excedio el timeout, proceso matado |
| no_output | No se genero el archivo de stream |
| empty_output | El stream esta vacio |

## Notas

- Los scripts no modifican la config de kilocode. Tu decides cuando los
  optimizadores estan on/off.
- Solo se pasa el prompt a kilocode. No se anade system prompt ni informacion
  adicional.
- Las queries no mencionan herramientas MCP ni palabras clave del router.
- El modelo decide como resolver cada tarea.
- Si una query excede el timeout, se marca como `timeout` y se pasa a la
  siguiente. No se aborta el benchmark entero.
- Re-ejecutar un script sobrescribe los .md anteriores.
- Las metricas vienen del stream JSONL, no de la BD SQLite de kilocode.
  Esto es mas portable entre versiones de kilocode.

## Estructura

```
benchmark_separado/
  queries/
    queries.json             # 18 queries en 10 categorias
  results/
    baseline/                # baselineNN.md (generados por run-baseline.ps1)
    optimizer/               # optimizerNN.md (generados por run-optimizer.ps1)
  logs/                      # streams JSONL y logs de cada ejecucion
  run-baseline.ps1           # script principal baseline
  run-optimizer.ps1          # script principal optimizer
  benchmark-common.ps1       # logica compartida (dot-sourced por ambos)
  README.md
```
