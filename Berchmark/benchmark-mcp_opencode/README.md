# Benchmark MCP vs Baseline - OpenCode + OpenAI

## Objetivo

Determinar, mediante datos reproducibles y trazables, si el uso de los servidores MCP, herramientas y plugins disponibles en OpenCode reduce realmente el consumo total de tokens y el coste de OpenAI frente al baseline, manteniendo una calidad de respuesta equivalente o superior.

## Infraestructura requerida

- OpenCode v1.19.0+ instalado y configurado (con provider klia o cualquier provider OpenAI-compatible).
- Servidores MCP disponibles: klia-token-optimizer, semble, repomix, serena.
- PowerShell 5.1+.
- Acceso de escritura a `~/.config/opencode/opencode.json` (se backup antes de cada ejecucion).
- Acceso a `opencode db` (SQLite) para leer metricas reales de tokens.

## Como funciona

1. **Bateria de consultas** (`queries/queries.json`): 12 consultas en 8 categorias (info simple, busqueda, seleccion de herramientas MCP, multi-herramienta, analisis complejo, eleccion entre servidores, OpenAI directo, ambiguo/error).
2. **Dos modos de ejecucion**:
   - `baseline`: todos los MCP deshabilitados (solo OpenAI directo).
   - `mcp`: todos los MCP habilitados (OpenAI + servidores).
3. **Aislamiento**: antes de cada ejecucion se aplica la config del modo a `~/.config/opencode/opencode.json`. Al final, se restaura la config original (backup automático).
4. **Ejecucion**: `opencode run --format json --model <model> --dir <project> "<prompt>"`. El stream JSON se captura en `results/<mode>/<query>/run-<n>/raw.jsonl`.
5. **Metricas**: se obtienen de la BD SQLite de OpenCode (tabla `session`): `tokens_input`, `tokens_output`, `tokens_reasoning`, `tokens_cache_read`, `tokens_cache_write`, `cost`. Las tool calls se extraen del stream JSON.
6. **Analisis** (`analyze.ps1`): consolida los resultados en CSV/JSON y calcula ahorro porcentual por consulta, categoria, servidor y global.
7. **Informe** (`generate-report.ps1`): genera reporte en Markdown y HTML.

## Uso

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

### Analizar resultados

```powershell
.\benchmark-mcp\analyze.ps1
```

Genera:
- `results/dataset.csv` (una fila por ejecucion).
- `results/comparison.csv` (baseline vs MCP por consulta).
- `results/by-category.csv`.
- `results/by-server.csv`.
- `results/summary.json` (resumen global).

### Generar informe

```powershell
.\benchmark-mcp\generate-report.ps1
```

Genera:
- `reports/reporte-benchmark-mcp.md`
- `reports/reporte-benchmark-mcp.html`

## Configuracion

Copia `benchmark-mcp.config.example.yml` a `benchmark-mcp.config.json` y ajusta los valores (rutas, modelo, repeticiones, etc.). Si no existe, se usan defaults.

## Estructura

```
benchmark-mcp/
  configs/
    opencode.baseline.json   # todos los MCP deshabilitados
    opencode.mcp.json        # todos los MCP habilitados
  queries/
    queries.json             # bateria de 12 consultas
  results/
    baseline/<query>/run-<n>/
      metrics.json           # metricas consolidadas
      raw.jsonl              # stream JSON de opencode run
      response.txt           # respuesta final del modelo
      session.json           # metricas de la BD
    mcp/<query>/run-<n>/...
    dataset.csv              # todas las ejecuciones en una tabla
    comparison.csv            # baseline vs MCP por consulta
    by-category.csv
    by-server.csv
    summary.json             # resumen global
  logs/                      # logs por ejecucion
  reports/
    reporte-benchmark-mcp.md
    reporte-benchmark-mcp.html
  run-benchmark.ps1         # orquestador
  analyze.ps1                # modulo de analisis
  generate-report.ps1       # generador de informe
  benchmark-mcp.config.example.yml
  README.md
```

## Metricas capturadas por ejecucion

| Metrica | Fuente | Descripcion |
|---|---|---|
| `tokens_input` | BD opencode | Tokens de entrada (prompt) |
| `tokens_output` | BD opencode | Tokens de salida (completion) |
| `tokens_reasoning` | BD opencode | Tokens de razonamiento (si disponible) |
| `tokens_cache_read` | BD opencode | Tokens leidos de cache |
| `tokens_cache_write` | BD opencode | Tokens escritos a cache |
| `cost_usd` | BD opencode | Coste en USD |
| `latency_seconds` | script | Latencia total (start a end) |
| `tool_calls_count` | stream JSON | Numero de llamadas a herramientas |
| `tool_calls_by_server` | stream JSON | Llamadas agrupadas por servidor MCP |
| `assistant_messages` | stream JSON | Numero de mensajes del asistente |
| `errors` | stream JSON | Lista de errores detectados |
| `response_chars` | stream JSON | Longitud de la respuesta final |
| `status` | script | success / success_with_errors / failed / timeout |

## Calculo de ahorro

```
Ahorro (%) = ((tokens baseline - tokens MCP) / tokens baseline) x 100
```

- Valor positivo: ahorro.
- Valor negativo: incremento de consumo.
- Si baseline = 0: no aplicable.

## Limitaciones

- Los tokens se obtienen del proxy klia (provider OpenAI-compatible), no directamente de la API de OpenAI. Si klia reporta tokens distintos a los de OpenAI, habra una discrepancia sistematica.
- La calidad de las respuestas no se evalua automaticamente en esta version. El informe incluye la longitud de la respuesta como proxy burdo, pero se recomienda evaluacion manual de una muestra.
- La variabilidad entre repeticiones puede ser alta en muestras pequenas. Se recomiendan al menos 3 repeticiones por consulta.
- El benchmark se ejecuta en un unico proyecto (Klia_Optimizer_Last_Version). Los resultados pueden no generalizar a otros contextos.
- Las tarifas usadas son las del proxy klia; pueden diferir de las tarifas oficiales de OpenAI.
- Las tool calls se extraen del stream JSON de `opencode run`; si el formato del stream cambia en futuras versiones de OpenCode, el parser puede necesitar actualizacion.

## Reproducibilidad

El script es idempotente: si ya existe `metrics.json` para una combinacion (query, mode, run), se salta. Si una ejecucion falla, los resultados previos se conservan y se puede reanudar.

El backup de la config original de opencode se hace al inicio, y se restaura en un bloque `finally` (incluso ante errores o Ctrl+C con timeout razonable).

## Restricciones aplicadas (del spec original)

- Las consultas no se modifican entre escenarios.
- No se anade logica externa para dirigir las herramientas MCP.
- No se sustituye la logica nativa de OpenCode/Mira.
- No se exponen credenciales en codigo ni registros.
- No se eliminan resultados desfavorables.
- No se declara ahorro sin datos verificables.
