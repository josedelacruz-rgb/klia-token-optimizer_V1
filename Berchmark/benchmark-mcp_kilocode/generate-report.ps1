#Requires -Version 5.1
<#
.SYNOPSIS
    Genera el informe final del benchmark MCP vs Baseline en Markdown y HTML.
.DESCRIPTION
    Renderiza el informe segun los datos disponibles:
      - Fases de un solo modo (p.ej. baseline): detalle por prueba, agregados por consulta
        y descripcion del entorno medido, sin afirmaciones de ahorro.
      - Baterias de dos modos (baseline + mcp): comparativa completa con savings.
.PARAMETER ResultsDir
    Directorio de resultados (default: benchmark-mcp\results)
.PARAMETER ReportsDir
    Directorio de informes (default: benchmark-mcp\reports)
.PARAMETER ReportName
    Nombre base del informe (sin extension). Default: reporte-benchmark-mcp
.PARAMETER Title
    Titulo del informe. Default: se deduce del modo unico o de la comparativa.
#>
[CmdletBinding()]
param(
    [string]$ResultsDir,
    [string]$ReportsDir,
    [string]$ReportName = "reporte-benchmark-mcp",
    [string]$Title = $null
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..").Path
if (-not $ResultsDir) { $ResultsDir = Join-Path $root 'benchmark-mcp\results' }
if (-not $ReportsDir) { $ReportsDir = Join-Path $root 'benchmark-mcp\reports' }
if (-not (Test-Path $ReportsDir)) { New-Item -ItemType Directory -Path $ReportsDir -Force | Out-Null }

if (-not (Test-Path (Join-Path $ResultsDir 'summary.json'))) {
    throw 'No existe summary.json. Ejecuta analyze.ps1 primero.'
}

$summary = Get-Content (Join-Path $ResultsDir 'summary.json') -Raw | ConvertFrom-Json
$comparison = @()
if (Test-Path (Join-Path $ResultsDir 'comparison.csv')) { $comparison = @(Import-Csv (Join-Path $ResultsDir 'comparison.csv')) }
$byCategory = @()
if (Test-Path (Join-Path $ResultsDir 'by-category.csv')) { $byCategory = @(Import-Csv (Join-Path $ResultsDir 'by-category.csv')) }
$byServer = @()
if (Test-Path (Join-Path $ResultsDir 'by-server.csv')) { $byServer = @(Import-Csv (Join-Path $ResultsDir 'by-server.csv')) }
$byQuery = @()
if (Test-Path (Join-Path $ResultsDir 'by-query.csv')) { $byQuery = @(Import-Csv (Join-Path $ResultsDir 'by-query.csv')) }
$dataset = @()
if (Test-Path (Join-Path $ResultsDir 'dataset.csv')) { $dataset = @(Import-Csv (Join-Path $ResultsDir 'dataset.csv')) }

$queriesFile = Join-Path $root 'benchmark-mcp\queries\queries.json'
$queriesData = if (Test-Path $queriesFile) { Get-Content $queriesFile -Raw | ConvertFrom-Json } else { $null }

$lines = New-Object System.Collections.Generic.List[string]

function Add-Ln([string]$text) { $script:lines.Add($text) }
function Add-H([int]$level, [string]$text) { $script:lines.Add(('#' * $level) + ' ' + $text) }
function Fmt-Num($value, [int]$decimals = 0) {
    # Formato numerico invariante: evita que "153.3" se lea como 1533.
    # Los CSV generados por Export-Csv usan la cultura actual (coma decimal en es-ES),
    # asi que se detecta el separador: coma -> cultura actual, punto -> invariante.
    if ($null -eq $value) { return '-' }
    $s = ([string]$value).Trim()
    if ($s -eq '') { return '-' }
    $d = 0.0
    $inv = [System.Globalization.CultureInfo]::InvariantCulture
    $cur = [System.Globalization.CultureInfo]::CurrentCulture
    $culture = if ($s.Contains(',')) { $cur } else { $inv }
    if (-not [double]::TryParse($s, [System.Globalization.NumberStyles]::Float, $culture, [ref]$d)) {
        if (-not [double]::TryParse($s, [System.Globalization.NumberStyles]::Float, $inv, [ref]$d)) { return $s }
    }
    return $d.ToString("N$decimals", $inv)
}

$singleMode = [bool]$summary.single_mode
$modeName = if ($singleMode) { @($summary.modes_present)[0] } else { 'both' }
if (-not $Title) {
    if ($singleMode) {
        $Title = if ($modeName -eq "baseline") { "Fase baseline - KiloCode sin optimizadores instalados" } else { "Fase $modeName - KiloCode" }
    } else {
        $Title = "Benchmark MCP vs Baseline - Ahorro de tokens (KiloCode)"
    }
}

# --- Contenido ---
Add-H 1 $Title
Add-Ln ('_Generado: ' + $summary.generated_at + '_')
if ($summary.coverage -and $summary.coverage.label) {
    Add-Ln ('_Etiqueta de la fase: ' + $summary.coverage.label + '_')
}
Add-Ln ''

if ($singleMode) {
    # ================= FASE DE UN SOLO MODO =================
    $pm = $summary.per_mode.PSObject.Properties | Where-Object { $_.Name -eq $modeName } | Select-Object -First 1
    $pm = $pm.Value

    Add-H 2 '1. Que mide este informe'
    if ($modeName -eq "baseline") {
        Add-Ln 'Medicion del **baseline**: el entorno de KiloCode sin ningun optimizador de contexto instalado.'
        Add-Ln 'Es la referencia contra la que se medira la fase con optimizadores (`optimizer01`).'
    } else {
        Add-Ln ("Medicion de la fase **{0}**." -f $modeName)
    }
    Add-Ln 'Cada prueba (consulta x ejecucion) queda registrada con sus metricas en la seccion 6.'
    Add-Ln ''

    Add-H 2 '2. Entorno medido (aislamiento)'
    if ($summary.coverage -and $summary.coverage.isolation) {
        $iso = $summary.coverage.isolation
        Add-Ln ('- Sandbox de HOME/config: **' + $(if ($iso.sandbox) { 'activo' } else { 'inactivo' }) + '**')
        if ($iso.sandbox_root) { Add-Ln ('- Raiz del sandbox: `' + $iso.sandbox_root + '`') }
        Add-Ln '- Plugins externos (klia-router-inject, klia-auto-record, DCP, tokenade, context-mode): **no cargados** (`--pure` + config aislada).'
        Add-Ln '- Servidores MCP: **todos deshabilitados** (override `logs/overrides/kilo.<modo>.json`).'
        if (@($iso.blocked_binaries).Count -gt 0) {
            Add-Ln ('- Binarios de optimizadores bloqueados (shims "no instalado"): ' + (@($iso.blocked_binaries) -join ', '))
        }
        if (@($iso.blocked_path_dirs).Count -gt 0) {
            Add-Ln ('- Directorios retirados del PATH: ' + ((@($iso.blocked_path_dirs) | ForEach-Object { '`' + $_ + '`' }) -join ', '))
        }
        Add-Ln '- Reglas globales (`~/.kilo/rules`, `~/.config/kilo/AGENTS.md`): **no cargadas** (HOME aislado).'
    } else {
        Add-Ln '_Sin datos de aislamiento en budget-summary.json._'
    }
    if ($summary.coverage -and $summary.coverage.workspace) {
        Add-Ln ''
        Add-Ln ('- Proyecto de trabajo (workspace neutral, sin AGENTS.md del repo): `' + $summary.coverage.workspace + '`')
    }
    Add-Ln ''

    Add-H 2 '3. Cobertura de la bateria'
    if ($summary.coverage) {
        $planned = @($summary.coverage.battery_queries)
        $validIds = @($byQuery | ForEach-Object { $_.query_id } | Select-Object -Unique)
        $timeoutIds = @($dataset | Where-Object { $_.status -eq 'timeout' } | ForEach-Object { $_.query_id } | Select-Object -Unique)
        $notExecuted = @($planned | Where-Object { $validIds -notcontains $_ -and $timeoutIds -notcontains $_ })
        Add-Ln ('- Presupuesto de tiempo: ' + $summary.coverage.max_minutes + ' min | consumido: ' + $summary.coverage.elapsed_seconds + 's')
        Add-Ln ('- Consultas planificadas: ' + $planned.Count + ' | con medicion valida: ' + $validIds.Count + ' | con timeout: ' + $timeoutIds.Count + ' | no ejecutadas: ' + $notExecuted.Count)
        if ($timeoutIds.Count -gt 0) {
            Add-Ln ('- Con timeout (medicion no valida): ' + ($timeoutIds -join ', '))
        }
        if ($notExecuted.Count -gt 0) {
            Add-Ln ('- No ejecutadas (presupuesto agotado): ' + ($notExecuted -join ', '))
        }
        if ($summary.coverage.avg_latency_seconds) {
            $lat = $summary.coverage.avg_latency_seconds
            if ($modeName -eq "baseline") {
                Add-Ln ('- Latencia media de la fase: ' + $lat.baseline + 's')
            } else {
                Add-Ln ('- Latencia media: baseline ' + $lat.baseline + 's | mcp ' + $lat.mcp + 's')
            }
        }
    }
    Add-Ln ('- Ejecuciones registradas: **' + $summary.total_executions + '** | con timeout (excluidas de las medias): ' + $summary.excluded_timeout_runs)
    Add-Ln ''

    Add-H 2 '4. Resultados agregados de la fase'
    if ($pm) {
        Add-Ln '| Metrica | Valor |'
        Add-Ln '|---|---|'
        Add-Ln ('| Ejecuciones | ' + $pm.executions + ' |')
        Add-Ln ('| Consultas distintas | ' + $pm.distinct_queries + ' |')
        Add-Ln ('| Tokens medios por ejecucion | ' + (Fmt-Num $pm.tokens_avg) + ' |')
        Add-Ln ('| Tokens totales | ' + (Fmt-Num $pm.tokens_total) + ' |')
        Add-Ln ('| Tokens input medios | ' + (Fmt-Num $pm.tokens_input_avg) + ' |')
        Add-Ln ('| Tokens output medios | ' + (Fmt-Num $pm.tokens_output_avg) + ' |')
        Add-Ln ('| Coste total | $' + (Fmt-Num $pm.cost_total_usd 4) + ' |')
        Add-Ln ('| Latencia media | ' + (Fmt-Num $pm.latency_avg 1) + 's |')
        Add-Ln ('| Tool calls totales | ' + $pm.tool_calls_total + ' |')
        Add-Ln ('| Tasa de exito | ' + (Fmt-Num ([double]$pm.success_rate * 100)) + '% |')
        Add-Ln ''
    }

    if ($byQuery.Count -gt 0) {
        Add-H 2 '5. Resultados por consulta'
        Add-Ln '| Query | Categoria | N | Tokens (in/out/total) | Coste | Latencia | Tools | Exito |'
        Add-Ln '|---|---|---|---|---|---|---|---|'
        foreach ($r in $byQuery) {
            Add-Ln ('| ' + $r.query_id + ' | ' + $r.category + ' | ' + $r.n + ' | ' + (Fmt-Num $r.tokens_input_mean) + ' / ' + (Fmt-Num $r.tokens_output_mean) + ' / ' + (Fmt-Num $r.tokens_total_mean) + ' | $' + (Fmt-Num $r.cost_usd_mean 4) + ' | ' + (Fmt-Num $r.latency_mean 1) + 's | ' + (Fmt-Num $r.tool_calls_mean 1) + ' | ' + (Fmt-Num ([double]$r.success_rate * 100)) + '% |')
        }
        Add-Ln ''
    }

    if ($dataset.Count -gt 0) {
        Add-H 2 '6. Detalle por prueba (cada ejecucion)'
        Add-Ln '| Query | Modo | Run | Estado | Tokens in | Tokens out | Tokens total | Coste | Latencia | Tools | Servidores | Errores |'
        Add-Ln '|---|---|---|---|---|---|---|---|---|---|---|---|'
        foreach ($r in $dataset) {
            $servers = if ($r.servers_used) { $r.servers_used } else { '-' }
            Add-Ln ('| ' + $r.query_id + ' | ' + $r.mode + ' | ' + $r.run + ' | ' + $r.status + ' | ' + (Fmt-Num $r.tokens_input) + ' | ' + (Fmt-Num $r.tokens_output) + ' | ' + (Fmt-Num $r.tokens_total) + ' | $' + (Fmt-Num $r.cost_usd 4) + ' | ' + (Fmt-Num $r.latency_seconds 1) + 's | ' + $r.tool_calls_count + ' | ' + $servers + ' | ' + $r.errors_count + ' |')
        }
        Add-Ln ''
    }

    Add-H 2 '7. Conclusiones de la fase'
    Add-Ln '1. Esta fase establish el **punto de partida** (baseline) del que la fase con optimizadores debe mejorar.'
    Add-Ln '2. No se afirma ahorro todavia: la comparacion requiere ejecutar la misma bateria con los optimizadores activos.'
    Add-Ln '3. Las ejecuciones con `status=timeout` quedan excluidas de las medias (mediciones parciales).'
    Add-Ln '4. Las consultas que no caben en el presupuesto quedan listadas como omitidas: no forman parte de la medicion.'
    Add-Ln ''

    Add-H 2 '8. Reproduccion'
    Add-Ln '```powershell'
    Add-Ln ('# Fase ' + $modeName + ' (' + $summary.coverage.max_minutes + ' min, sandbox activo)')
    Add-Ln ('.\benchmark-mcp\run-phase.ps1 -Phase ' + $modeName + ' -Label ' + $summary.coverage.label + ' -MaxMinutes ' + $summary.coverage.max_minutes)
    Add-Ln '```'
    Add-Ln ''

    Add-H 2 '9. Limitaciones'
    Add-Ln '- Los tokens se obtienen de la BD de KiloCode (`kilo db`), no directamente de la API del provider.'
    Add-Ln '- La calidad de las respuestas no se evalua automaticamente en esta version.'
    Add-Ln '- La variabilidad entre repeticiones puede ser alta en muestras pequenas.'
    Add-Ln '- El workspace es una copia neutral del codigo: sirve para comparar fases, no para medir el repo real.'
    Add-Ln ''
    } else {
    # ================= BATERIA DE DOS MODOS =================
    $bt = Fmt-Num $summary.global.baseline_tokens_avg
    $mt = Fmt-Num $summary.global.mcp_tokens_avg
    $bc = Fmt-Num $summary.global.baseline_cost_total_usd 4
    $mc = Fmt-Num $summary.global.mcp_cost_total_usd 4

    Add-H 2 '1. Resumen ejecutivo'
    Add-Ln 'Este informe compara el consumo de tokens del modelo entre dos entornos de KiloCode:'
    Add-Ln '- **Baseline**: todos los servidores MCP deshabilitados y plugins externos desactivados (`--pure`).'
    Add-Ln '- **MCP**: todos los servidores MCP habilitados y plugins externos activos (klia-token-optimizer, semble, repomix, serena, context-mode).'
    Add-Ln ''
    Add-Ln ('Veredicto global: **' + $summary.global.verdict + '**')
    Add-Ln ''
    Add-Ln ('- Tokens baseline (media): **' + $bt + '**')
    Add-Ln ('- Tokens MCP (media): **' + $mt + '**')
    Add-Ln ('- Ahorro de tokens: **' + $summary.global.tokens_savings_pct + '%**')
    Add-Ln ('- Coste baseline: **$' + $bc + '**')
    Add-Ln ('- Coste MCP: **$' + $mc + '**')
    Add-Ln ('- Ahorro de coste: **' + $summary.global.cost_savings_pct + '%**')
    Add-Ln ('- Latencia baseline: **' + $summary.global.baseline_latency_avg + 's** | MCP: **' + $summary.global.mcp_latency_avg + 's**')
    Add-Ln ('- Consultas con ahorro: ' + $summary.queries_with_savings + ' | con perdida: ' + $summary.queries_with_loss + ' | neutras: ' + $summary.queries_neutral)
    Add-Ln ''

    if ($summary.coverage) {
        Add-H 2 '1.1 Cobertura de la bateria'
        Add-Ln ('- Presupuesto de tiempo: ' + $summary.coverage.max_minutes + ' min | consumido: ' + $summary.coverage.elapsed_seconds + 's')
        Add-Ln ('- Consultas de la bateria: ' + $summary.coverage.battery_queries + ' | comparadas (baseline+mcp): ' + $summary.coverage.executed_queries + ' | omitidas: ' + $summary.coverage.skipped_queries)
        if (@($summary.coverage.skipped_query_ids).Count -gt 0) {
            Add-Ln ('- Omitidas por presupuesto: ' + (@($summary.coverage.skipped_query_ids) -join ', '))
        }
        if ($summary.coverage.avg_latency_seconds) {
            Add-Ln ('- Latencia media: baseline ' + $summary.coverage.avg_latency_seconds.baseline + 's | mcp ' + $summary.coverage.avg_latency_seconds.mcp + 's')
        }
        Add-Ln '- Las medias globales se calculan solo sobre las consultas comparadas (ambos modos).'
        Add-Ln ''
    }

    Add-H 2 '2. Metodologia y entornos'
    Add-Ln ('**Total de ejecuciones**: ' + $summary.total_executions + ' (baseline: ' + $summary.baseline_executions + ', MCP: ' + $summary.mcp_executions + ').')
    Add-Ln ''
    Add-Ln '**Mecanica de aislamiento**:'
    Add-Ln '- Se resuelve la configuracion efectiva con `kilo debug config` (global + proyecto).'
    Add-Ln '- Se genera un override por modo (`logs/overrides/kilo.<modo>.json`) que habilita o deshabilita todos los servidores MCP.'
    Add-Ln '- El override se inyecta con la variable de entorno `KILO_CONFIG`; la config global del usuario NO se modifica.'
    Add-Ln '- En modo baseline se anade `--pure` para que Kilo no cargue los plugins externos de `~/.config/kilo/plugin`.'
    Add-Ln '- Se ejecuta: kilo run --format json --auto --model <model> --title <titulo> <prompt>.'
    Add-Ln '- Se captura el stream JSON completo y el sessionId.'
    Add-Ln '- Se consulta la BD SQLite de Kilo (`kilo db`) para tokens y coste.'
    Add-Ln ''

    Add-H 2 '3. Inventario de servidores MCP'
    Add-Ln '| Servidor | Estado | Comando |'
    Add-Ln '|---|---|---|'
    Add-Ln '| klia-token-optimizer | enabled | node <runtime>/dist/mcp-server.js |'
    Add-Ln '| semble | enabled | uvx semble[mcp]==0.6.1 |'
    Add-Ln '| repomix | enabled | npx repomix --mcp |'
    Add-Ln '| serena | enabled | serena start-mcp-server --context ide |'
    Add-Ln '| context-mode | enabled | node context-mode/cli.bundle.mjs |'
    Add-Ln ''

    Add-H 2 '4. Modelo y configuracion'
    $reportModel = $null
    if ($dataset -and $dataset.Count -gt 0 -and $dataset[0].PSObject.Properties.Name -contains 'model') {
        $reportModel = ($dataset | Select-Object -First 1).model
    }
    if (-not $reportModel -and $queriesData) { $reportModel = $queriesData.model }
    if ($reportModel) {
        Add-Ln ('- **Modelo**: ' + $reportModel)
        $reportProvider = ($reportModel -split '/')[0]
        if ($reportProvider -eq 'kilo') {
            Add-Ln '- **Provider**: Kilo Gateway (KiloCode, modelo auto/free)'
        } else {
            Add-Ln ('- **Provider**: ' + $reportProvider)
        }
    }
    $kiloVersion = 'desconocida'
    try {
        $kv = (& kilo --version 2>$null | Out-String).Trim()
        if ($kv) { $kiloVersion = $kv }
    } catch {}
    Add-Ln ('- **Version de KiloCode**: ' + $kiloVersion)
    Add-Ln ''

    Add-H 2 '5. Bateria de consultas'
    if ($queriesData) {
        Add-Ln ('Total: ' + $queriesData.total_queries + ' consultas en ' + $queriesData.categories_covered.Count + ' categorias.')
        Add-Ln ''
        Add-Ln '| ID | Categoria | Subcategoria | Prompt |'
        Add-Ln '|---|---|---|---|'
        foreach ($q in $queriesData.queries) {
            $p = $q.prompt -replace '\|','/'
            if ($p.Length -gt 80) { $p = $p.Substring(0,80) + '...' }
            Add-Ln ('| ' + $q.id + ' | ' + $q.category + ' | ' + $q.subcategory + ' | ' + $p + ' |')
        }
        Add-Ln ''
    }

    Add-H 2 '6. Resultados detallados por consulta'
    if ($comparison.Count -gt 0) {
        Add-Ln '| Query | Categoria | Tokens BL | Tokens MCP | Ahorro % | Coste BL | Coste MCP | Ahorro cost % | Lat BL | Lat MCP | Tools | Veredicto |'
        Add-Ln '|---|---|---|---|---|---|---|---|---|---|---|---|'
        foreach ($r in $comparison) {
            $bt2 = Fmt-Num $r.baseline_tokens_mean
            $mt2 = Fmt-Num $r.mcp_tokens_mean
            $bc2 = Fmt-Num $r.baseline_cost 4
            $mc2 = Fmt-Num $r.mcp_cost 4
            Add-Ln ('| ' + $r.query_id + ' | ' + $r.category + ' | ' + $bt2 + ' | ' + $mt2 + ' | ' + $r.tokens_savings_pct + '% | $' + $bc2 + ' | $' + $mc2 + ' | ' + $r.cost_savings_pct + '% | ' + (Fmt-Num $r.baseline_latency 1) + 's | ' + (Fmt-Num $r.mcp_latency 1) + 's | ' + $r.mcp_tool_calls + ' | ' + $r.verdict + ' |')
        }
        Add-Ln ''
    }

    Add-H 2 '7. Comparacion de tokens (entrada, salida, total)'
    if ($dataset.Count -gt 0) {
        $bIn = ($dataset | Where-Object { $_.mode -eq 'baseline' } | Measure-Object -Property tokens_input -Average).Average
        $mIn = ($dataset | Where-Object { $_.mode -eq 'mcp' } | Measure-Object -Property tokens_input -Average).Average
        $bOut = ($dataset | Where-Object { $_.mode -eq 'baseline' } | Measure-Object -Property tokens_output -Average).Average
        $mOut = ($dataset | Where-Object { $_.mode -eq 'mcp' } | Measure-Object -Property tokens_output -Average).Average
        if (-not $bIn) { $bIn = 0 }
        if (-not $mIn) { $mIn = 0 }
        if (-not $bOut) { $bOut = 0 }
        if (-not $mOut) { $mOut = 0 }
        $pctIn = if ($bIn -gt 0) { [math]::Round((($bIn-$mIn)/$bIn)*100,2) } else { 0 }
        $pctOut = if ($bOut -gt 0) { [math]::Round((($bOut-$mOut)/$bOut)*100,2) } else { 0 }
        Add-Ln '| Tipo | Baseline | MCP | Diferencia | Ahorro % |'
        Add-Ln '|---|---|---|---|---|'
        Add-Ln ('| Input | ' + (Fmt-Num $bIn) + ' | ' + (Fmt-Num $mIn) + ' | ' + (Fmt-Num ($bIn-$mIn)) + ' | ' + $pctIn + '% |')
        Add-Ln ('| Output | ' + (Fmt-Num $bOut) + ' | ' + (Fmt-Num $mOut) + ' | ' + (Fmt-Num ($bOut-$mOut)) + ' | ' + $pctOut + '% |')
        Add-Ln ('| Total | ' + $bt + ' | ' + $mt + ' | ' + ($bt - $mt) + ' | ' + $summary.global.tokens_savings_pct + '% |')
        Add-Ln ''
    }

    Add-H 2 '8. Resultados por categoria'
    if ($byCategory.Count -gt 0) {
        Add-Ln '| Categoria | N | Tokens BL | Tokens MCP | Ahorro % | Tools MCP | Veredicto |'
        Add-Ln '|---|---|---|---|---|---|---|'
        foreach ($r in $byCategory) {
            $btc = Fmt-Num $r.baseline_tokens_avg
            $mtc = Fmt-Num $r.mcp_tokens_avg
            Add-Ln ('| ' + $r.category + ' | ' + $r.n_queries + ' | ' + $btc + ' | ' + $mtc + ' | ' + $r.tokens_savings_pct + '% | ' + $r.mcp_tool_calls_avg + ' | ' + $r.verdict + ' |')
        }
        Add-Ln ''
    }

    Add-H 2 '9. Resultados por servidor MCP'
    if ($byServer.Count -gt 0) {
        Add-Ln '| Servidor | Consultas distintas | Total tool calls | Queries |'
        Add-Ln '|---|---|---|---|'
        foreach ($r in $byServer) {
            Add-Ln ('| ' + $r.server + ' | ' + $r.distinct_queries_used + ' | ' + $r.total_tool_calls + ' | ' + $r.queries + ' |')
        }
        Add-Ln ''
    } else {
        Add-Ln '_No se detectaron llamadas a herramientas MCP en las ejecuciones._'
        Add-Ln ''
    }

    Add-H 2 '10. Detalle por prueba (cada ejecucion)'
    if ($dataset.Count -gt 0) {
        Add-Ln '| Query | Modo | Run | Estado | Tokens in | Tokens out | Tokens total | Coste | Latencia | Tools | Errores |'
        Add-Ln '|---|---|---|---|---|---|---|---|---|---|---|'
        foreach ($r in $dataset) {
            Add-Ln ('| ' + $r.query_id + ' | ' + $r.mode + ' | ' + $r.run + ' | ' + $r.status + ' | ' + (Fmt-Num $r.tokens_input) + ' | ' + (Fmt-Num $r.tokens_output) + ' | ' + (Fmt-Num $r.tokens_total) + ' | $' + (Fmt-Num $r.cost_usd 4) + ' | ' + (Fmt-Num $r.latency_seconds 1) + 's | ' + $r.tool_calls_count + ' | ' + $r.errors_count + ' |')
        }
        Add-Ln ''
    }

    Add-H 2 '11. Consultas donde MCP ahorra tokens'
    $savings = $comparison | Where-Object { [double]$_.tokens_savings_pct -gt 0 } | Sort-Object { [double]$_.tokens_savings_pct } -Descending
    if ($savings -and $savings.Count -gt 0) {
        Add-Ln '| Query | Categoria | Ahorro % | Ahorro tokens |'
        Add-Ln '|---|---|---|---|'
        foreach ($r in $savings) {
            $sav = Fmt-Num $r.tokens_savings
            Add-Ln ('| ' + $r.query_id + ' | ' + $r.category + ' | ' + $r.tokens_savings_pct + '% | ' + $sav + ' |')
        }
        Add-Ln ''
    } else {
        Add-Ln '_Ninguna consulta mostro ahorro significativo._'
        Add-Ln ''
    }

    Add-H 2 '12. Consultas donde MCP incrementa el consumo'
    $losses = $comparison | Where-Object { [double]$_.tokens_savings_pct -lt 0 } | Sort-Object { [double]$_.tokens_savings_pct }
    if ($losses -and $losses.Count -gt 0) {
        Add-Ln '| Query | Categoria | Incremento % | Tokens extra |'
        Add-Ln '|---|---|---|---|'
        foreach ($r in $losses) {
            $extra = Fmt-Num (-1 * [double]$r.tokens_savings)
            Add-Ln ('| ' + $r.query_id + ' | ' + $r.category + ' | ' + $r.tokens_savings_pct + '% | ' + $extra + ' |')
        }
        Add-Ln ''
    } else {
        Add-Ln '_Ninguna consulta mostro incremento significativo._'
        Add-Ln ''
    }

    Add-H 2 '13. Conclusiones'
    Add-Ln ('1. **Veredicto global**: ' + $summary.global.verdict + '.')
    Add-Ln ('2. **Ahorro de tokens**: ' + $summary.global.tokens_savings_pct + '% en media (' + $bt + ' -> ' + $mt + ' tokens).')
    Add-Ln ('3. **Ahorro de coste**: ' + $summary.global.cost_savings_pct + '% ($' + $bc + ' -> $' + $mc + ').')
    Add-Ln ('4. **Latencia**: baseline ' + $summary.global.baseline_latency_avg + 's vs MCP ' + $summary.global.mcp_latency_avg + 's.')
    Add-Ln ('5. **Consultas con ahorro**: ' + $summary.queries_with_savings + '. **Con perdida**: ' + $summary.queries_with_loss + '. **Neutras**: ' + $summary.queries_neutral + '.')
    Add-Ln ''
    Add-Ln 'Recomendaciones:'
    Add-Ln '- Si el ahorro es positivo y consistente, mantener MCP habilitado.'
    Add-Ln '- Si hay perdida, revisar las consultas afectadas y considerar deshabilitar servidores MCP especificos.'
    Add-Ln '- El coste real puede incluir infraestructura MCP (servidores, dependencias); no se ha contabilizado aqui.'
    Add-Ln '- Considerar la calidad de las respuestas, no solo el ahorro de tokens.'
    Add-Ln ''

    Add-H 2 '14. Limitaciones'
    Add-Ln '- Los tokens se obtienen de la BD de KiloCode (`kilo db`), no directamente de la API del provider.'
    Add-Ln '- La calidad de las respuestas no se ha evaluado automaticamente en esta version.'
    Add-Ln '- La variabilidad entre repeticiones puede afectar la comparacion en muestras pequenas.'
    Add-Ln '- Las tarifas usadas son las del proxy klia; pueden diferir de las tarifas oficiales de OpenAI.'
    Add-Ln '- El benchmark se ejecuta en un unico proyecto; los resultados pueden no generalizar a otros contextos.'
    Add-Ln ''

    Add-H 2 '15. Reproduccion'
    Add-Ln '```powershell'
    Add-Ln '# 1. Pilot test'
    Add-Ln '.\benchmark-mcp\run-benchmark.ps1 -Pilot'
    Add-Ln ''
    Add-Ln '# 2. Benchmark completo (3 repeticiones)'
    Add-Ln '.\benchmark-mcp\run-benchmark.ps1 -Mode both -Repetitions 3'
    Add-Ln ''
    Add-Ln '# 3. Analisis'
    Add-Ln '.\benchmark-mcp\analyze.ps1'
    Add-Ln ''
    Add-Ln '# 4. Informe'
    Add-Ln '.\benchmark-mcp\generate-report.ps1'
    Add-Ln '```'
    Add-Ln ''
}

$mdContent = $lines -join "`r`n"
$mdPath = Join-Path $ReportsDir ($ReportName + '.md')
$mdContent | Set-Content -LiteralPath $mdPath -Encoding UTF8
Write-Host ('Informe Markdown: ' + $mdPath) -ForegroundColor Green

# --- HTML simple: envolver el Markdown en un <pre> para mostrar tal cual ---
$escaped = $mdContent -replace '&','&amp;' -replace '<','&lt;' -replace '>','&gt;'
$css = @'
body{font-family:system-ui,Arial,sans-serif;max-width:1100px;margin:2em auto;padding:0 1em;line-height:1.5;color:#222}
pre{white-space:pre-wrap;word-wrap:break-word;background:#f8f8f8;padding:1.5em;border-radius:6px;font-family:Consolas,monospace}
'@
$html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>' + $ReportName + '</title><style>' + $css + '</style></head><body><pre>' + $escaped + '</pre></body></html>'

$htmlPath = Join-Path $ReportsDir ($ReportName + '.html')
$html | Set-Content -LiteralPath $htmlPath -Encoding UTF8
Write-Host ('Informe HTML: ' + $htmlPath) -ForegroundColor Green
Write-Host 'Informe generado correctamente.' -ForegroundColor Green
