# Benchmark MCP vs Baseline - KiloCode

## Objetivo

Determinar, mediante datos reproducibles y trazables, si el uso de los servidores MCP, herramientas y plugins disponibles en **KiloCode** reduce realmente el consumo total de tokens y el coste del modelo frente al baseline, manteniendo una calidad de respuesta equivalente o superior.

## Infraestructura requerida

- KiloCode CLI instalado (`kilo`, `@kilocode/cli`, v7.x) con el provider configurado (`kilo auth list`).
- Modelo por defecto: `kilo/kilo-auto/free` (Kilo Gateway). Se puede cambiar con `-Model <provider/model>` o en `benchmark-mcp.config.json`.
- Servidores MCP disponibles: klia-token-optimizer, semble, repomix, serena, context-mode.
- PowerShell 5.1+.
- Acceso de lectura a `~/.config/kilo/kilo.jsonc` (el benchmark **no la modifica**).
- Acceso a `kilo db` (SQLite) para leer metricas reales de tokens.
- Permisos de ejecucion sobre el proyecto donde se ejecutan las consultas.

## Como funciona

1. **Bateria de consultas** (`queries/queries.json`): 12 consultas en 8 categorias (info simple, busqueda, seleccion de herramientas MCP, multi-herramienta, analisis complejo, eleccion entre servidores, respuesta directa, ambiguo/error).
2. **Dos fases de ejecucion**, ejecutadas por separado y con resultados separados:
   - `baseline`: entorno **sin ningun optimizador de contexto instalado** (ver "Aislamiento de la fase baseline").
   - `optimizer`: entorno real del usuario (plugins globales activos, servidores MCP habilitados).
   Cada fase escribe sus resultados en `results/<label>/` y su informe en `reports/<label>.md`, de modo que las fases nunca se mezclan.
3. **Aislamiento sin tocar la config global**:
   - `kilo debug config` devuelve la configuracion efectiva (global `kilo.jsonc` + config del proyecto).
   - El script genera un override por modo en `logs/overrides/kilo.<modo>.json` con todos los servidores MCP habilitados o deshabilitados.
   - El override se inyecta con la variable de entorno `KILO_CONFIG` (Kilo la fusiona con el resto de fuentes). La config global del usuario queda intacta: no hay backup/restore.
   - En `baseline` se anade `--pure` para que no carguen los plugins externos de `~/.config/kilo/plugin` (klia-router-inject, klia-auto-record, DCP, tokenade, context-mode).
4. **Workspace neutral**: las ejecuciones se hacen en una copia limpia del codigo (`src/`, `tests/`) generada en `%TEMP%\klia-benchmark-workspace`, con README y `package.json` neutros y 8 commits de historia. El workspace **no** incluye el `AGENTS.md` del repo (que empuja al modelo a usar los optimizadores) ni las reglas globales, de modo que el baseline mide el entorno limpio.
5. **Ejecucion**: `kilo run --format json --auto --model <model> --title <titulo> "<prompt>"`. El stream JSON se captura en `results/<label>/<mode>/<query>/run-<n>/raw.jsonl`.
6. **Metricas**: se obtienen de la BD SQLite de KiloCode (`kilo db "SELECT ... FROM session WHERE id = '<sessionId>'"`): `tokens_input`, `tokens_output`, `tokens_reasoning`, `tokens_cache_read`, `tokens_cache_write`, `cost`. Las tool calls se extraen del stream JSON.
7. **Analisis** (`analyze.ps1`): consolida los resultados en CSV/JSON y calcula ahorro porcentual por consulta, categoria, servidor y global.
8. **Informe** (`generate-report.ps1`): genera reporte en Markdown y HTML.

## Aislamiento de la fase baseline

El objetivo de la fase baseline es reproducir una maquina donde **todo el software de optimizacion de contexto esta desinstalado**, sin desinstalar nada del equipo y sin modificar la configuracion global del usuario. Para ello el benchmark levanta un *sandbox* por fase:

| Capa | Baseline | Optimizer |
|---|---|---|
| `HOME` / `USERPROFILE` | sandbox (`benchmark-mcp/sandbox/home`) | real |
| `XDG_CONFIG_HOME` | sandbox (`benchmark-mcp/sandbox/config`) | real |
| Config de Kilo | minima (sin MCP, `bash: allow`) | real (`kilo.jsonc` + `config.json`) |
| Plugins externos | no cargados (`--pure`) | cargados |
| Reglas globales (`~/.kilo/rules`, `~/.config/kilo/AGENTS.md`) | no cargadas | cargadas |
| Servidores MCP | todos deshabilitados | habilitados (klia, semble, repomix, serena) |
| PATH | sin directorios de optimizadores + shims "no instalado" | real |
| Data dir (auth + BD) | real (necesario para leer metricas) | real |

Los shims (`benchmark-mcp/sandbox/blocked-bin`) emulan el error de "comando no instalado" para `rtk`, `semble`, `serena`, `tokenade` y `repomix`, de modo que el modelo no puede descubrirlos ni aunque los conozca por las reglas globales.

## Uso

### Fases (flujo recomendado)

```powershell
# 1. Fase baseline: 10 min con TODOS los optimizadores desinstalados.
#    Escribe benchmark-mcp\reports\baseline01.md
.\benchmark-mcp\run-phase.ps1 -Phase baseline -Label baseline01 -MaxMinutes 10

# 2. Fase optimizer: misma bateria, 10 min, con los optimizadores activos.
#    Escribe benchmark-mcp\reports\optimizer01.md
.\benchmark-mcp\run-phase.ps1 -Phase optimizer -Label optimizer01 -MaxMinutes 10
```

Cada fase deja:
- `results/<label>/<modo>/<consulta>/run-<n>/` con `metrics.json`, `raw.jsonl`, `response.txt`, `session.json`.
- `results/<label>/dataset.csv`, `by-query.csv`, `summary.json`, `budget-summary.json`.
- `reports/<label>.md` y `reports/<label>.html` con el detalle de **cada prueba** (consulta x ejecucion).

### Presupuesto de tiempo (limite duro)

Toda la bateria esta sujeta a un **limite duro de duracion** (`-MaxMinutes`, default **10 minutos**). El script:

1. Prioriza las consultas que mas rinden por segundo (`Q03, Q04, Q12, Q07, Q05, Q06, Q08` y despues las conceptuales).
2. Planifica por **iteracion** (una consulta en todos los modos de la fase): una consulta solo se inicia si el tiempo restante cubre la iteracion completa, porque la comparacion exige ejecutarla en todos los modos.
3. Recalcula la estimacion con la latencia real observada en cada modo.
4. Ajusta el timeout de cada ejecucion al presupuesto restante, de modo que ninguna ejecucion puedePASARSE del deadline global.

Al terminar se escribe `results/<label>/budget-summary.json` con la cobertura real (consultas ejecutadas, omitidas y duracion) y el analisis lo refleja en el informe.

```powershell
# 10 minutos (default)
.\benchmark-mcp\run-benchmark.ps1

# 5 minutos,Priorizando solo busqueda y terminal
.\benchmark-mcp\run-benchmark.ps1 -MaxMinutes 5 -Queries Q03,Q04,Q12
```

### Pilot test (recomendado antes del benchmark completo)

```powershell
.\benchmark-mcp\run-benchmark.ps1 -Pilot
```

Ejecuta 2 consultas (Q01 y Q05) en ambos modos, 1 repeticion. Verifica que la medicion funciona.

### Benchmark completo

```powershell
# 12 consultas x 2 modos x 3 repeticiones = 72 ejecuciones
.\benchmark-mcp\run-benchmark.ps1 -Mode both -Repetitions 3
```

### Solo un modo

```powershell
.\benchmark-mcp\run-benchmark.ps1 -Mode baseline -Repetitions 3
.\benchmark-mcp\run-benchmark.ps1 -Mode mcp -Repetitions 3
```

### Consultas especificas

```powershell
.\benchmark-mcp\run-benchmark.ps1 -Queries Q01,Q05,Q12 -Repetitions 1
```

### Otras opciones

```powershell
# Ver el plan (consultas, modos, modelo) sin ejecutar nada
.\benchmark-mcp\run-benchmark.ps1 -DryRun

# Reejecutar aunque ya exista metrics.json
.\benchmark-mcp\run-benchmark.ps1 -Queries Q01 -Force
```

### Analizar resultados

```powershell
# results/<label> concreto
.\benchmark-mcp\analyze.ps1 -ResultsDir benchmark-mcp\results\baseline01
```

Genera:
- `dataset.csv` (una fila por ejecucion).
- `by-query.csv` (agregado por consulta y modo; tambien en fases de un solo modo).
- `comparison.csv` (baseline vs MCP por consulta; solo si hay ambos modos).
- `by-category.csv`.
- `by-server.csv`.
- `summary.json` (resumen global; con `single_mode=true` y `per_mode` en fases de un solo modo).

### Generar informe

```powershell
.\benchmark-mcp\generate-report.ps1 -ResultsDir benchmark-mcp\results\baseline01 -ReportName baseline01
```

Genera:
- `reports/baseline01.md`
- `reports/baseline01.html`

## Configuracion

Copia `benchmark-mcp.config.example.json` a `benchmark-mcp/benchmark-mcp.config.json` y ajusta los valores. Si no existe, se usan defaults.

| Clave | Default | Descripcion |
|---|---|---|
| `project_dir` | raiz del repo | Origen del codigo copiado al workspace neutral |
| `use_workspace` | true | Ejecutar en el workspace neutral en vez del repo (recomendado: el repo tiene AGENTS.md) |
| `workspace_dir` | `%TEMP%\klia-benchmark-workspace` | Ruta del workspace neutral |
| `model` | `kilo/kilo-auto/free` | Modelo en formato `provider/model` (Kilo Gateway, modelo auto gratuito) |
| `repetitions` | 1 (parametro) | Repeticiones por consulta y modo |
| `max_minutes` | 10 | Presupuesto maximo de duracion de la bateria (limite duro) |
| `estimate_seconds` | `{baseline: 60, mcp: 90}` | Estimacion inicial de duracion por modo (se recalibra con lo observado) |
| `query_timeout` | 180 | Timeout maximo por consulta (se acota al presupuesto restante) |
| `auto_approve` | true | Pasa `--auto` a `kilo run` (evita bloqueos por permisos) |
| `kilo_config_path` | `~/.config/kilo/kilo.jsonc` | Solo informativa: el benchmark no la modifica |
| `baseline_template` | `benchmark-mcp/configs/kilo.baseline.json` | Template de servidores del modo baseline |
| `mcp_template` | `benchmark-mcp/configs/kilo.mcp.json` | Template de servidores del modo mcp |
| `results_dir` | `benchmark-mcp/results` | Salida de resultados (una subcarpeta por etiqueta) |
| `logs_dir` | `benchmark-mcp/logs` | Logs por ejecucion y overrides de config |
| `reports_dir` | `benchmark-mcp/reports` | Salida de informes |
| `sandbox_dir` | `benchmark-mcp/sandbox` | Raiz del sandbox de aislamiento |
| `isolation.blocked_path_dirs` | ver ejemplo | Directorios retirados del PATH en la fase baseline |
| `isolation.blocked_binaries` | `rtk, semble, serena, tokenade, repomix` | Binarios bloqueados con shims en la fase baseline |

## Estructura

```
benchmark-mcp/
  configs/
    kilo.baseline.json     # template: servidores MCP deshabilitados
    kilo.mcp.json          # template: servidores MCP habilitados
  lib/
    isolation.ps1          # sandbox de HOME/config, shims y filtrado de PATH
    workspace.ps1          # workspace neutral (copia de codigo + historia git)
  queries/
    queries.json           # bateria de 12 consultas
  results/                 # (se genera) una carpeta por etiqueta/modo/consulta/run
    <label>/baseline/<query>/run-<n>/
      metrics.json         # metricas consolidadas
      raw.jsonl            # stream JSON de `kilo run`
      response.txt         # respuesta final del modelo
      session.json         # metricas de la BD de Kilo
    <label>/mcp/<query>/run-<n>/...
    <label>/dataset.csv    # todas las ejecuciones en una tabla
    <label>/by-query.csv   # agregado por consulta y modo
    <label>/comparison.csv  # baseline vs MCP por consulta
    <label>/by-category.csv
    <label>/by-server.csv
    summary.json           # resumen global
    budget-summary.json    # cobertura y duracion de la ultima bateria
  logs/                    # (se genera) logs por ejecucion + overrides (kilo.<modo>.json)
  reports/                 # (se genera) <label>.md / <label>.html
  sandbox/                 # (se genera) sandbox de aislamiento de la fase baseline
  run-phase.ps1            # orquestador de fases (baseline / optimizer) + informe
  run-benchmark.ps1        # orquestador
  analyze.ps1              # modulo de analisis
  generate-report.ps1      # generador de informe
  benchmark-mcp.config.example.json
  README.md
```

`results/<label>/`, `logs/` y `reports/` se regeneran por fase: los resultados de una etiqueta anterior se archivan en `benchmark-mcp/results-archive/<timestamp>/` para no mezclar runs de modelos o versiones distintas.

## Metricas capturadas por ejecucion

| Metrica | Fuente | Descripcion |
|---|---|---|
| `tokens_input` | BD Kilo (`kilo db`) | Tokens de entrada (prompt) |
| `tokens_output` | BD Kilo | Tokens de salida (completion) |
| `tokens_reasoning` | BD Kilo | Tokens de razonamiento |
| `tokens_cache_read` | BD Kilo | Tokens leidos de cache |
| `tokens_cache_write` | BD Kilo | Tokens escritos a cache |
| `cost_usd` | BD Kilo | Coste en USD |
| `latency_seconds` | script | Latencia total (start a end) |
| `tool_calls_count` | stream JSON | Numero de llamadas a herramientas |
| `tool_calls_by_server` | stream JSON | Llamadas agrupadas por servidor MCP |
| `assistant_messages` | stream JSON | Numero de mensajes del asistente |
| `errors` | stream JSON | Lista de errores detectados (incluye eventos `type=error`) |
| `response_chars` | stream JSON | Longitud de la respuesta final |
| `status` | script | success / success_with_errors / failed / timeout |

Las ejecuciones con `status=timeout` se excluyen de la comparacion y de las medias (no son mediciones validas): siguen en `dataset.csv` y se listan como fallos.

## Calculo de ahorro

```
Ahorro (%) = ((tokens baseline - tokens MCP) / tokens baseline) x 100
```

- Valor positivo: ahorro.
- Valor negativo: incremento de consumo.
- Si baseline = 0: no aplicable.

## Limitaciones

- Los tokens se obtienen de la BD de KiloCode, que los agrega a partir de la respuesta del provider (proxy klia u OpenAI). Pueden diferir de los tokens facturados por el provider.
- La calidad de las respuestas no se evalua automaticamente en esta version. El informe incluye la longitud de la respuesta como proxy burdo, pero se recomienda evaluacion manual de una muestra.
- La variabilidad entre repeticiones puede ser alta en muestras pequenas. Se recomiendan al menos 3 repeticiones por consulta.
- El benchmark se ejecuta en un unico proyecto. Los resultados pueden no generalizar a otros contextos.
- El modo `baseline` usa `--pure` y un HOME/config aislados, por lo que tambien se excluyen los plugins externos, las reglas globales y los binarios de optimizadores; esa diferencia forma parte del escenario medido.
- Las tool calls se extraen del stream JSON de `kilo run`; si el formato del stream cambia en futuras versiones, el parser puede necesitar actualizacion.
- El workspace neutral es una copia del codigo: sirve para comparar fases de forma justa, pero no representa el repositorio real completo.

## Reproducibilidad

- El script es idempotente: si ya existe `metrics.json` para una combinacion (query, mode, run), se salta (usa `-Force` para repetir).
- La configuracion global del usuario no se modifica en ningun momento: el aislamiento se hace con `KILO_CONFIG` + `--pure` + sandbox de entorno, y el entorno se restaura en un bloque `finally`.
- Si una ejecucion falla, los resultados previos se conservan y se puede reanudar.
- Las fases se identifican por `-Label`: cada una tiene su carpeta de resultados y su informe, de modo que baseline y optimizer se comparan sin mezclarse.

## Troubleshooting

| Sintoma | Causa probable | Solucion |
|---|---|---|
| Todos los tokens a 0 | La sesion no se encontro en la BD | Comprueba `kilo db "SELECT id,title,cost FROM session ORDER BY time_created DESC LIMIT 5"` |
| `Unauthorized: API key expired` | Credencial del provider caducada | `kilo auth list` y renueva la clave del provider (p.ej. klia en `~/.config/kilo/kilo.jsonc`), o usa el gateway `kilo/kilo-auto/free` |
| `No se encuentra el ejecutable de KiloCode` | CLI no esta en el PATH | Instala `@kilocode/cli` o ajusta el PATH |
| `Configuration is invalid at ...` | La config inyectada tiene claves no recognised por el schema de Kilo | No anadas claves de comentario (`_comment`) a los ficheros que se inyectan con `KILO_CONFIG` |
| Errores `run.error` en `errors` | Fallo del provider o del MCP | Revisa `logs/<modo>-<query>-<run>.log` |
| El baseline usa herramientas MCP | Algún servidor se queda habilitado | Comprueba `logs/overrides/kilo.baseline.json` (todos deben tener `enabled: false`) |
| El baseline usa `semble`/`rtk` | El PATH del proceso hijo no se filtro | Revisa `isolation.blocked_path_dirs` en `benchmark-mcp.config.json` y `benchmark-mcp/sandbox/blocked-bin/` |
