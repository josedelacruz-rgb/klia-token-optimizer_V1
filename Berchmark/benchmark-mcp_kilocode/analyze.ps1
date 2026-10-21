#Requires -Version 5.1
<#
.SYNOPSIS
    Analiza los resultados del benchmark MCP vs Baseline y genera dataset consolidado.
.DESCRIPTION
    Lee todos los ficheros metrics.json de results/<label>/{baseline,mcp}/<query>/run-*/metrics.json,
    consolida en un dataset unico, calcula:
      - Ahorro porcentual de tokens por consulta, categoria y global (si hay ambos modos)
      - Ahorro economico (USD)
      - Diferencias de latencia
      - Comparacion por servidor MCP y herramienta
      - Tasa de exito
      - Variabilidad entre repeticiones
    En fases de un solo modo (p.ej. baseline) genera igualmente el detalle por consulta
    (by-query.csv) y un resumen por modo (summary.json con single_mode=true), sin calcular
    savings comparativos.
    Genera:
      - results\dataset.csv (una fila por ejecucion)
      - results\summary.json (resumen agregado)
      - results\comparison.csv (comparacion por consulta baseline vs mcp)
      - results\by-query.csv (detalle por consulta y modo)
      - results\by-category.csv
      - results\by-server.csv (cuando aplica)
.PARAMETER ResultsDir
    Directorio de resultados (default: benchmark-mcp\results)
#>
[CmdletBinding()]
param(
    [string]$ResultsDir = $null
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path "$PSScriptRoot\..").Path
if (-not $ResultsDir) { $ResultsDir = Join-Path $root "benchmark-mcp\results" }
if (-not (Test-Path $ResultsDir)) { throw "No existe el directorio de resultados: $ResultsDir" }

Write-Host "`n=== ANALISIS DE RESULTADOS ===" -ForegroundColor White
Write-Host "Directorio: $ResultsDir`n" -ForegroundColor White

# --- Recoger todos los metrics.json ---
$allMetrics = @()
Get-ChildItem -Path $ResultsDir -Recurse -Filter "metrics.json" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        $m = Get-Content $_.FullName -Raw | ConvertFrom-Json
        $m | Add-Member -NotePropertyName metrics_file -NotePropertyValue $_.FullName -Force
        $allMetrics += $m
    } catch {
        Write-Warning "No se pudo leer $($_.FullName): $_"
    }
}

if ($allMetrics.Count -eq 0) {
    Write-Warning "No se encontraron metricas. Ejecuta run-benchmark.ps1 primero."
    exit 1
}

Write-Host "Total metricas cargadas: $($allMetrics.Count)" -ForegroundColor Green

# --- Funciones helper ---
function Get-Median {
    param([double[]]$values)
    if ($values.Count -eq 0) { return 0 }
    $sorted = $values | Sort-Object
    $mid = [math]::Floor($sorted.Count / 2)
    if ($sorted.Count % 2 -eq 0) {
        return [math]::Round((($sorted[$mid-1] + $sorted[$mid]) / 2), 2)
    } else {
        return [math]::Round($sorted[$mid], 2)
    }
}

function Get-Stdev {
    param([double[]]$values)
    if ($values.Count -lt 2) { return 0 }
    $avg = ($values | Measure-Object -Average).Average
    $sumSq = ($values | ForEach-Object { [math]::Pow($_ - $avg, 2) } | Measure-Object -Sum).Sum
    return [math]::Round([math]::Sqrt($sumSq / ($values.Count - 1)), 2)
}

function Select-Numbers {
    # Selecciona solo valores numericos. Import-Csv/ConvertFrom-Json devuelven
    # [int], [long], [double] o [decimal] segun el literal, asi que no se puede
    # filtrar por un unico tipo.
    param($values)
    return @($values | Where-Object {
        $_ -is [int] -or $_ -is [long] -or $_ -is [double] -or $_ -is [decimal]
    })
}

function SavingsPct {
    param([double]$baseline, [double]$mcp)
    if ($baseline -eq 0) { return $null }
    return [math]::Round((($baseline - $mcp) / $baseline) * 100, 2)
}

# Modos presentes en los resultados (una fase puede ejecutar solo uno).
$modesPresent = @($allMetrics | Select-Object -ExpandProperty mode -Unique)
$singleMode = ($modesPresent.Count -eq 1)
if ($singleMode) { Write-Host "Fase de un solo modo: $($modesPresent[0]) (sin comparacion savings)" -ForegroundColor Cyan }

# --- Dataset plano (CSV) ---
$flatRows = @($allMetrics | ForEach-Object {
    $serversUsed = ""
    if ($_.tool_calls_by_server -and $_.tool_calls_by_server.PSObject.Properties.Count -gt 0) {
        $serversUsed = ($_.tool_calls_by_server.PSObject.Properties.Name) -join "|"
    }
    [PSCustomObject]@{
        query_id = $_.query_id
        mode = $_.mode
        run = $_.run
        category = $_.category
        subcategory = $_.subcategory
        status = $_.status
        tokens_input = $_.tokens_input
        tokens_output = $_.tokens_output
        tokens_reasoning = $_.tokens_reasoning
        tokens_cache_read = $_.tokens_cache_read
        tokens_cache_write = $_.tokens_cache_write
        tokens_total = $_.tokens_total
        cost_usd = $_.cost_usd
        latency_seconds = $_.latency_seconds
        tool_calls_count = $_.tool_calls_count
        servers_used = $serversUsed
        assistant_messages = $_.assistant_messages
        errors_count = if ($_.errors) { @($_.errors).Count } else { 0 }
        response_chars = $_.response_chars
        started_at = $_.started_at
        ended_at = $_.ended_at
    }
})
$datasetCsv = Join-Path $ResultsDir "dataset.csv"
$flatRows | Export-Csv -LiteralPath $datasetCsv -NoTypeInformation -Encoding UTF8
Write-Host "Dataset: $datasetCsv ($($flatRows.Count) filas)" -ForegroundColor Green

# --- Agregados por (query_id, mode) ---
# Las ejecuciones con timeout no son mediciones validas (tokens parciales): se
# excluyen de la comparacion y de las medias, pero siguen en el dataset.
$validMetrics = @($allMetrics | Where-Object { $_.status -ne "timeout" })
$agg = @($validMetrics | Group-Object -Property query_id, mode | ForEach-Object {
    $tokensTotal = Select-Numbers $_.Group.tokens_total
    $tokensInput = Select-Numbers $_.Group.tokens_input
    $tokensOutput = Select-Numbers $_.Group.tokens_output
    $cost = Select-Numbers $_.Group.cost_usd
    $latency = Select-Numbers $_.Group.latency_seconds
    $tools = Select-Numbers $_.Group.tool_calls_count
    $parts = $_.Name -split ", "
    [PSCustomObject]@{
        query_id = $parts[0]
        mode = $parts[1]
        n = $_.Count
        category = ($_.Group[0].category)
        tokens_input_mean = [math]::Round(($tokensInput | Measure-Object -Average).Average, 1)
        tokens_input_median = Get-Median -values $tokensInput
        tokens_output_mean = [math]::Round(($tokensOutput | Measure-Object -Average).Average, 1)
        tokens_output_median = Get-Median -values $tokensOutput
        tokens_total_mean = [math]::Round(($tokensTotal | Measure-Object -Average).Average, 1)
        tokens_total_median = Get-Median -values $tokensTotal
        tokens_total_stdev = Get-Stdev -values $tokensTotal
        cost_usd_mean = [math]::Round(($cost | Measure-Object -Average).Average, 6)
        cost_usd_median = Get-Median -values $cost
        latency_mean = [math]::Round(($latency | Measure-Object -Average).Average, 2)
        latency_median = Get-Median -values $latency
        latency_stdev = Get-Stdev -values $latency
        tool_calls_mean = [math]::Round(($tools | Measure-Object -Average).Average, 1)
        success_rate = [math]::Round((@($_.Group | Where-Object { $_.status -eq "success" -or $_.status -eq "success_with_errors" }).Count) / $_.Count, 2)
    }
})

# --- Detalle por consulta y modo (util tambien en fases de un solo modo) ---
$byQueryCsv = Join-Path $ResultsDir "by-query.csv"
if ($agg.Count -gt 0) {
    $agg | Sort-Object -Property query_id, mode | Export-Csv -LiteralPath $byQueryCsv -NoTypeInformation -Encoding UTF8
    Write-Host "Por consulta: $byQueryCsv ($($agg.Count) filas)" -ForegroundColor Green
}

# --- Comparacion baseline vs mcp por consulta ---
$queryIds = ($validMetrics | Select-Object -ExpandProperty query_id -Unique)
$comparison = @()
foreach ($qid in $queryIds) {
    $b = $agg | Where-Object { $_.query_id -eq $qid -and $_.mode -eq "baseline" } | Select-Object -First 1
    $m = $agg | Where-Object { $_.query_id -eq $qid -and $_.mode -eq "mcp" } | Select-Object -First 1
    if (-not $b -or -not $m) { continue }
    $comparison += [PSCustomObject]@{
        query_id = $qid
        category = $b.category
        baseline_tokens_mean = $b.tokens_total_mean
        mcp_tokens_mean = $m.tokens_total_mean
        tokens_savings = ($b.tokens_total_mean - $m.tokens_total_mean)
        tokens_savings_pct = SavingsPct -baseline $b.tokens_total_mean -mcp $m.tokens_total_mean
        baseline_cost = $b.cost_usd_mean
        mcp_cost = $m.cost_usd_mean
        cost_savings_usd = [math]::Round($b.cost_usd_mean - $m.cost_usd_mean, 6)
        cost_savings_pct = SavingsPct -baseline $b.cost_usd_mean -mcp $m.cost_usd_mean
        baseline_latency = $b.latency_mean
        mcp_latency = $m.latency_mean
        latency_diff = [math]::Round($m.latency_mean - $b.latency_mean, 2)
        mcp_tool_calls = $m.tool_calls_mean
        verdict = if ((SavingsPct -baseline $b.tokens_total_mean -mcp $m.tokens_total_mean) -gt 5) { "AHORRO" }
                  elseif ((SavingsPct -baseline $b.tokens_total_mean -mcp $m.tokens_total_mean) -lt -5) { "PERDIDA" }
                  else { "NEUTRO" }
    }
}
$comparisonCsv = Join-Path $ResultsDir "comparison.csv"
if ($comparison.Count -gt 0) {
    $comparison | Export-Csv -LiteralPath $comparisonCsv -NoTypeInformation -Encoding UTF8
    Write-Host "Comparacion: $comparisonCsv ($($comparison.Count) filas)" -ForegroundColor Green
}

# --- Agregado por categoria ---
$byCategory = @()
foreach ($cat in ($comparison | Select-Object -ExpandProperty category -Unique)) {
    $rows = $comparison | Where-Object { $_.category -eq $cat }
    if ($rows.Count -eq 0) { continue }
    $bTokens = ($rows | Measure-Object -Property baseline_tokens_mean -Average).Average
    $mTokens = ($rows | Measure-Object -Property mcp_tokens_mean -Average).Average
    $byCategory += [PSCustomObject]@{
        category = $cat
        n_queries = $rows.Count
        baseline_tokens_avg = [math]::Round($bTokens, 1)
        mcp_tokens_avg = [math]::Round($mTokens, 1)
        tokens_savings_pct = SavingsPct -baseline $bTokens -mcp $mTokens
        mcp_tool_calls_avg = [math]::Round(($rows | Measure-Object -Property mcp_tool_calls -Average).Average, 1)
        verdict = if ((SavingsPct -baseline $bTokens -mcp $mTokens) -gt 5) { "AHORRO" }
                  elseif ((SavingsPct -baseline $bTokens -mcp $mTokens) -lt -5) { "PERDIDA" }
                  else { "NEUTRO" }
    }
}
$byCategoryCsv = Join-Path $ResultsDir "by-category.csv"
if ($byCategory.Count -gt 0) {
    $byCategory | Export-Csv -LiteralPath $byCategoryCsv -NoTypeInformation -Encoding UTF8
    Write-Host "Por categoria: $byCategoryCsv" -ForegroundColor Green
}

# --- Agregado por servidor MCP ---
$serverStats = @{}
$mcpRuns = $allMetrics | Where-Object { $_.mode -eq "mcp" -and $_.tool_calls_by_server }
foreach ($run in $mcpRuns) {
    if (-not $run.tool_calls_by_server) { continue }
    foreach ($prop in $run.tool_calls_by_server.PSObject.Properties) {
        $server = $prop.Name
        if (-not $serverStats.ContainsKey($server)) {
            $serverStats[$server] = @{ queries = @(); total_tool_calls = 0 }
        }
        $serverStats[$server].queries += $run.query_id
        $serverStats[$server].total_tool_calls += @($prop.Value).Count
    }
}
$byServer = $serverStats.GetEnumerator() | ForEach-Object {
    $uniq = $_.Value.queries | Select-Object -Unique
    [PSCustomObject]@{
        server = $_.Key
        distinct_queries_used = $uniq.Count
        total_tool_calls = $_.Value.total_tool_calls
        queries = ($uniq -join "|")
    }
}
$byServerCsv = Join-Path $ResultsDir "by-server.csv"
if ($byServer) {
    $byServer | Export-Csv -LiteralPath $byServerCsv -NoTypeInformation -Encoding UTF8
    Write-Host "Por servidor: $byServerCsv" -ForegroundColor Green
}

# --- Resumen global ---
# Solo se promedian las consultas que tienen AMBOS modos: comparar la media global
# con conjuntos de consultas distintas (por un presupuesto de tiempo) falsea el dato.
$pairedIds = @($comparison | Select-Object -ExpandProperty query_id -Unique)
$globalB = @($validMetrics | Where-Object { $_.mode -eq "baseline" -and $pairedIds -contains $_.query_id })
$globalM = @($validMetrics | Where-Object { $_.mode -eq "mcp" -and $pairedIds -contains $_.query_id })
$bTokensAvg = if ($globalB) { ($globalB.tokens_total | Measure-Object -Average).Average } else { 0 }
$mTokensAvg = if ($globalM) { ($globalM.tokens_total | Measure-Object -Average).Average } else { 0 }
$bCost = if ($globalB) { ($globalB.cost_usd | Measure-Object -Sum).Sum } else { 0 }
$mCost = if ($globalM) { ($globalM.cost_usd | Measure-Object -Sum).Sum } else { 0 }
$bLatency = if ($globalB) { ($globalB.latency_seconds | Measure-Object -Average).Average } else { 0 }
$mLatency = if ($globalM) { ($globalM.latency_seconds | Measure-Object -Average).Average } else { 0 }

# Resumen por modo (util en fases de un solo modo).
$perMode = @{}
foreach ($m in $modesPresent) {
    $rows = @($validMetrics | Where-Object { $_.mode -eq $m })
    $perMode[$m] = [PSCustomObject]@{
        executions = $rows.Count
        distinct_queries = @($rows | Select-Object -ExpandProperty query_id -Unique).Count
        tokens_avg = [math]::Round((($rows.tokens_total | Measure-Object -Average).Average), 1)
        tokens_total = [int](($rows.tokens_total | Measure-Object -Sum).Sum)
        tokens_input_avg = [math]::Round((($rows.tokens_input | Measure-Object -Average).Average), 1)
        tokens_output_avg = [math]::Round((($rows.tokens_output | Measure-Object -Average).Average), 1)
        cost_total_usd = [math]::Round((($rows.cost_usd | Measure-Object -Sum).Sum), 6)
        latency_avg = [math]::Round((($rows.latency_seconds | Measure-Object -Average).Average), 2)
        tool_calls_total = ($rows.tool_calls_count | Measure-Object -Sum).Sum
        success_rate = [math]::Round((@($rows | Where-Object { $_.status -eq "success" -or $_.status -eq "success_with_errors" }).Count) / [math]::Max(1, $rows.Count), 2)
    }
}

# Cobertura de la bateria (presupuesto de tiempo), si el orquestador la guardo.
$budgetFile = Join-Path $ResultsDir "budget-summary.json"
$coverage = $null
if (Test-Path $budgetFile) {
    try {
        $bs = Get-Content $budgetFile -Raw | ConvertFrom-Json
        $coverage = [PSCustomObject]@{
            max_minutes = $bs.max_minutes
            label = $bs.label
            modes = @($bs.modes)
            elapsed_seconds = $bs.elapsed_seconds
            within_budget = $bs.within_budget
            battery_queries = @($bs.planned_queries)
            battery_queries_count = @($bs.planned_queries).Count
            executed_queries = @($bs.executed_queries)
            executed_queries_count = @($bs.executed_queries).Count
            skipped_queries = @($bs.skipped_queries).Count
            skipped_query_ids = @($bs.skipped_queries)
            avg_latency_seconds = $bs.avg_latency_seconds
            workspace = $bs.workspace
            isolation = $bs.isolation
        }
    } catch { }
}

$globalSummary = $null
if (-not $singleMode) {
    $globalSummary = [PSCustomObject]@{
        baseline_tokens_avg = [math]::Round($bTokensAvg, 1)
        mcp_tokens_avg = [math]::Round($mTokensAvg, 1)
        tokens_savings_pct = SavingsPct -baseline $bTokensAvg -mcp $mTokensAvg
        baseline_cost_total_usd = [math]::Round($bCost, 6)
        mcp_cost_total_usd = [math]::Round($mCost, 6)
        cost_savings_pct = SavingsPct -baseline $bCost -mcp $mCost
        baseline_latency_avg = [math]::Round($bLatency, 2)
        mcp_latency_avg = [math]::Round($mLatency, 2)
        verdict = if ((SavingsPct -baseline $bTokensAvg -mcp $mTokensAvg) -gt 5) { "AHORRO" }
                  elseif ((SavingsPct -baseline $bTokensAvg -mcp $mTokensAvg) -lt -5) { "PERDIDA" }
                  else { "NEUTRO" }
    }
}

$summary = [PSCustomObject]@{
    generated_at = (Get-Date).ToString("o")
    total_executions = $allMetrics.Count
    baseline_executions = $globalB.Count
    mcp_executions = $globalM.Count
    modes_present = @($modesPresent)
    single_mode = $singleMode
    per_mode = $perMode
    distinct_queries = ($allMetrics | Select-Object -ExpandProperty query_id -Unique).Count
    paired_queries = $pairedIds.Count
    excluded_timeout_runs = @($allMetrics | Where-Object { $_.status -eq "timeout" }).Count
    coverage = $coverage
    global = $globalSummary
    queries_with_savings = @($comparison | Where-Object { $_.tokens_savings_pct -gt 0 }).Count
    queries_with_loss = @($comparison | Where-Object { $_.tokens_savings_pct -lt 0 }).Count
    queries_neutral = @($comparison | Where-Object { $_.tokens_savings_pct -eq 0 -or $_.tokens_savings_pct -eq $null }).Count
    servers_detected = $serverStats.Keys
}
$summaryJson = Join-Path $ResultsDir "summary.json"
$summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $summaryJson -Encoding UTF8
Write-Host "Summary: $summaryJson" -ForegroundColor Green

Write-Host "`n--- RESUMEN GLOBAL ---" -ForegroundColor Cyan
if ($singleMode) {
    $m = $modesPresent[0]
    $pm = $perMode[$m]
    $inv = [System.Globalization.CultureInfo]::InvariantCulture
    Write-Host ("Fase de un solo modo: {0}" -f $m)
    Write-Host ("Ejecuciones: {0} | Consultas distintas: {1}" -f $pm.executions, $pm.distinct_queries)
    Write-Host ("Tokens medios: {0} (total {1}) | Coste total: {2}" -f $pm.tokens_avg.ToString("N0", $inv), $pm.tokens_total.ToString("N0", $inv), $pm.cost_total_usd.ToString("N4", $inv))
    Write-Host ("Latencia media: {0}s | Tool calls: {1} | Tasa de exito: {2}%" -f $pm.latency_avg.ToString("N1", $inv), $pm.tool_calls_total, ($pm.success_rate * 100))
    Write-Host "Pendiente: ejecutar la fase con optimizadores para comparar.`n" -ForegroundColor Yellow
} else {
    Write-Host ("Consultas comparadas (ambos modos): {0} de {1}" -f $pairedIds.Count, ($allMetrics | Select-Object -ExpandProperty query_id -Unique).Count)
    Write-Host ("Tokens baseline: {0:N0} | MCP: {1:N0} | Ahorro: {2}%" -f $bTokensAvg, $mTokensAvg, (SavingsPct -baseline $bTokensAvg -mcp $mTokensAvg))
    Write-Host ("Coste baseline:   `${0:F4} | MCP: `${1:F4} | Ahorro: {2}%" -f $bCost, $mCost, (SavingsPct -baseline $bCost -mcp $mCost))
    Write-Host ("Latencia baseline: {0:N1}s | MCP: {1:N1}s" -f $bLatency, $mLatency)
    Write-Host ("Consultas con ahorro: {0} | con perdida: {1} | neutras: {2}" -f $summary.queries_with_savings, $summary.queries_with_loss, $summary.queries_neutral)
    Write-Host ("Veredicto global: {0}`n" -f $summary.global.verdict) -ForegroundColor Yellow
}
