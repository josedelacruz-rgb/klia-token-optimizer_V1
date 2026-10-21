#Requires -Version 5.1
<#
.SYNOPSIS
    Genera el informe final del benchmark MCP vs Baseline en Markdown y HTML.
#>
[CmdletBinding()]
param(
    [string]$ResultsDir,
    [string]$ReportsDir
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
$comparison = if (Test-Path (Join-Path $ResultsDir 'comparison.csv')) { Import-Csv (Join-Path $ResultsDir 'comparison.csv') } else { @() }
$byCategory = if (Test-Path (Join-Path $ResultsDir 'by-category.csv')) { Import-Csv (Join-Path $ResultsDir 'by-category.csv') } else { @() }
$byServer = if (Test-Path (Join-Path $ResultsDir 'by-server.csv')) { Import-Csv (Join-Path $ResultsDir 'by-server.csv') } else { @() }
$dataset = if (Test-Path (Join-Path $ResultsDir 'dataset.csv')) { Import-Csv (Join-Path $ResultsDir 'dataset.csv') } else { @() }

$queriesFile = Join-Path $root 'benchmark-mcp\queries\queries.json'
$queriesData = if (Test-Path $queriesFile) { Get-Content $queriesFile -Raw | ConvertFrom-Json } else { $null }

$lines = New-Object System.Collections.Generic.List[string]

function Add-Ln([string]$text) { $script:lines.Add($text) }
function Add-H([int]$level, [string]$text) { $script:lines.Add(('#' * $level) + ' ' + $text) }

# --- Contenido ---
Add-H 1 'Benchmark MCP vs Baseline - Ahorro de tokens de OpenAI'
Add-Ln ('_Generado: ' + $summary.generated_at + '_')
Add-Ln ''

Add-H 2 '1. Resumen ejecutivo'
Add-Ln 'Este informe compara el consumo de tokens de OpenAI entre dos entornos:'
Add-Ln '- **Baseline**: todos los servidores MCP deshabilitados (solo OpenAI directo).'
Add-Ln '- **MCP**: todos los servidores MCP habilitados (OpenAI + klia-token-optimizer, semble, repomix, serena).'
Add-Ln ''
Add-Ln ('Veredicto global: **' + $summary.global.verdict + '**')
Add-Ln ''
$bt = [math]::Round($summary.global.baseline_tokens_avg, 0)
$mt = [math]::Round($summary.global.mcp_tokens_avg, 0)
$bc = [math]::Round($summary.global.baseline_cost_total_usd, 4)
$mc = [math]::Round($summary.global.mcp_cost_total_usd, 4)
Add-Ln ('- Tokens baseline (media): **' + $bt + '**')
Add-Ln ('- Tokens MCP (media): **' + $mt + '**')
Add-Ln ('- Ahorro de tokens: **' + $summary.global.tokens_savings_pct + '%**')
Add-Ln ('- Coste baseline: **$' + $bc + '**')
Add-Ln ('- Coste MCP: **$' + $mc + '**')
Add-Ln ('- Ahorro de coste: **' + $summary.global.cost_savings_pct + '%**')
Add-Ln ('- Latencia baseline: **' + $summary.global.baseline_latency_avg + 's** | MCP: **' + $summary.global.mcp_latency_avg + 's**')
Add-Ln ('- Consultas con ahorro: ' + $summary.queries_with_savings + ' | con perdida: ' + $summary.queries_with_loss + ' | neutras: ' + $summary.queries_neutral)
Add-Ln ''

Add-H 2 '2. Metodologia y entornos'
Add-Ln ('**Total de ejecuciones**: ' + $summary.total_executions + ' (baseline: ' + $summary.baseline_executions + ', MCP: ' + $summary.mcp_executions + ').')
Add-Ln ''
Add-Ln '**Mecanica de aislamiento**:'
Add-Ln '- Antes de cada ejecucion se aplica la config del modo a opencode.json.'
Add-Ln '- Se ejecuta: opencode run --format json --model <model> --dir <project> <prompt>.'
Add-Ln '- Se captura el stream JSON completo y el sessionId.'
Add-Ln '- Se consulta la BD SQLite de opencode para tokens y coste.'
Add-Ln '- Al final, se restaura la config original de opencode.'
Add-Ln ''

Add-H 2 '3. Inventario de servidores MCP'
Add-Ln '| Servidor | Estado | Comando |'
Add-Ln '|---|---|---|'
Add-Ln '| klia-token-optimizer | enabled | node dist/mcp-server.js |'
Add-Ln '| semble | enabled | uvx semble[mcp]==0.5.5 |'
Add-Ln '| repomix | enabled | npx repomix --mcp |'
Add-Ln '| serena | enabled | serena start-mcp-server --context ide |'
Add-Ln ''

Add-H 2 '4. Modelo y configuracion'
if ($queriesData) {
    Add-Ln ('- **Modelo**: ' + $queriesData.model)
}
Add-Ln '- **Provider**: klia (proxy OpenAI-compatible)'
Add-Ln '- **Version de OpenCode**: 1.19.0'
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
        $bt2 = [math]::Round([double]$r.baseline_tokens_mean, 0)
        $mt2 = [math]::Round([double]$r.mcp_tokens_mean, 0)
        $bc2 = [math]::Round([double]$r.baseline_cost, 4)
        $mc2 = [math]::Round([double]$r.mcp_cost, 4)
        Add-Ln ('| ' + $r.query_id + ' | ' + $r.category + ' | ' + $bt2 + ' | ' + $mt2 + ' | ' + $r.tokens_savings_pct + '% | $' + $bc2 + ' | $' + $mc2 + ' | ' + $r.cost_savings_pct + '% | ' + $r.baseline_latency + 's | ' + $r.mcp_latency + 's | ' + $r.mcp_tool_calls + ' | ' + $r.verdict + ' |')
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
    Add-Ln ('| Input | ' + [math]::Round($bIn,0) + ' | ' + [math]::Round($mIn,0) + ' | ' + [math]::Round($bIn-$mIn,0) + ' | ' + $pctIn + '% |')
    Add-Ln ('| Output | ' + [math]::Round($bOut,0) + ' | ' + [math]::Round($mOut,0) + ' | ' + [math]::Round($bOut-$mOut,0) + ' | ' + $pctOut + '% |')
    Add-Ln ('| Total | ' + $bt + ' | ' + $mt + ' | ' + ($bt - $mt) + ' | ' + $summary.global.tokens_savings_pct + '% |')
    Add-Ln ''
}

Add-H 2 '8. Resultados por categoria'
if ($byCategory.Count -gt 0) {
    Add-Ln '| Categoria | N | Tokens BL | Tokens MCP | Ahorro % | Tools MCP | Veredicto |'
    Add-Ln '|---|---|---|---|---|---|---|'
    foreach ($r in $byCategory) {
        $btc = [math]::Round([double]$r.baseline_tokens_avg, 0)
        $mtc = [math]::Round([double]$r.mcp_tokens_avg, 0)
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

Add-H 2 '10. Consultas donde MCP ahorra tokens'
$savings = $comparison | Where-Object { [double]$_.tokens_savings_pct -gt 0 } | Sort-Object { [double]$_.tokens_savings_pct } -Descending
if ($savings -and $savings.Count -gt 0) {
    Add-Ln '| Query | Categoria | Ahorro % | Ahorro tokens |'
    Add-Ln '|---|---|---|---|'
    foreach ($r in $savings) {
        $sav = [math]::Round([double]$r.tokens_savings, 0)
        Add-Ln ('| ' + $r.query_id + ' | ' + $r.category + ' | ' + $r.tokens_savings_pct + '% | ' + $sav + ' |')
    }
    Add-Ln ''
} else {
    Add-Ln '_Ninguna consulta mostro ahorro significativo._'
    Add-Ln ''
}

Add-H 2 '11. Consultas donde MCP incrementa el consumo'
$losses = $comparison | Where-Object { [double]$_.tokens_savings_pct -lt 0 } | Sort-Object { [double]$_.tokens_savings_pct }
if ($losses -and $losses.Count -gt 0) {
    Add-Ln '| Query | Categoria | Incremento % | Tokens extra |'
    Add-Ln '|---|---|---|---|'
    foreach ($r in $losses) {
        $extra = [math]::Round(-[double]$r.tokens_savings, 0)
        Add-Ln ('| ' + $r.query_id + ' | ' + $r.category + ' | ' + $r.tokens_savings_pct + '% | ' + $extra + ' |')
    }
    Add-Ln ''
} else {
    Add-Ln '_Ninguna consulta mostro incremento significativo._'
    Add-Ln ''
}

Add-H 2 '12. Conclusiones'
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

Add-H 2 '13. Limitaciones'
Add-Ln '- Los tokens se obtienen de la BD de opencode (proxy klia), no directamente de la API de OpenAI.'
Add-Ln '- La calidad de las respuestas no se ha evaluado automaticamente en esta version.'
Add-Ln '- La variabilidad entre repeticiones puede afectar la comparacion en muestras pequenas.'
Add-Ln '- Las tarifas usadas son las del proxy klia; pueden diferir de las tarifas oficiales de OpenAI.'
Add-Ln '- El benchmark se ejecuta en un unico proyecto; los resultados pueden no generalizar a otros contextos.'
Add-Ln ''

Add-H 2 '14. Reproduccion'
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

$mdContent = $lines -join "`r`n"
$mdPath = Join-Path $ReportsDir 'reporte-benchmark-mcp.md'
$mdContent | Set-Content -LiteralPath $mdPath -Encoding UTF8
Write-Host ('Informe Markdown: ' + $mdPath) -ForegroundColor Green

# --- HTML simple: envolver el Markdown en un <pre> para mostrar tal cual ---
$escaped = $mdContent -replace '&','&amp;' -replace '<','&lt;' -replace '>','&gt;'
$css = @'
body{font-family:system-ui,Arial,sans-serif;max-width:1100px;margin:2em auto;padding:0 1em;line-height:1.5;color:#222}
pre{white-space:pre-wrap;word-wrap:break-word;background:#f8f8f8;padding:1.5em;border-radius:6px;font-family:Consolas,monospace}
'@
$html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Benchmark MCP vs Baseline</title><style>' + $css + '</style></head><body><pre>' + $escaped + '</pre></body></html>'

$htmlPath = Join-Path $ReportsDir 'reporte-benchmark-mcp.html'
$html | Set-Content -LiteralPath $htmlPath -Encoding UTF8
Write-Host ('Informe HTML: ' + $htmlPath) -ForegroundColor Green
Write-Host 'Informe generado correctamente.' -ForegroundColor Green
