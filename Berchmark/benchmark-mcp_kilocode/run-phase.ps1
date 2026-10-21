#Requires -Version 5.1
<#
.SYNOPSIS
    Ejecuta una fase del benchmark (baseline u optimizer) y genera su informe Markdown.
.DESCRIPTION
    Punto de entrada de alto nivel para medir por separado el consumo de tokens con y
    sin optimizadores de contexto:
      - Fase "baseline"  : entorno aislado (HOME/config sandbox, PATH sin binarios de
        optimizadores, plugins externos no cargados, servidores MCP deshabilitados).
        Equivale a una maquina con todo el software de optimizacion desinstalado.
      - Fase "optimizer" : entorno real del usuario (plugins globales activos, servidores
        MCP habilitados segun el template).
    Cada fase escribe sus resultados en <results_dir>/<label>/ y su informe en
    <reports_dir>/<label>.md, de modo que las fases no se mezclan.

.EXAMPLE
    .\benchmark-mcp\run-phase.ps1 -Phase baseline -Label baseline01 -MaxMinutes 10
    Ejecuta la fase baseline (10 min) y escribe benchmark-mcp\reports\baseline01.md
.EXAMPLE
    .\benchmark-mcp\run-phase.ps1 -Phase optimizer -Label optimizer01 -MaxMinutes 10
    Ejecuta la fase con optimizadores y escribe benchmark-mcp\reports\optimizer01.md
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("baseline", "optimizer")]
    [string]$Phase,

    [string]$Label = "default",

    [double]$MaxMinutes = 0,

    [string[]]$Queries = @(),

    [int]$Repetitions = 1,

    [int]$QueryTimeout = 0,

    [string]$Model = $null,

    [string]$Config = $null,

    [switch]$Pilot,

    [switch]$Force,

    [switch]$SkipReport,

    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$benchDir = $PSScriptRoot
$root = (Resolve-Path "$benchDir\..").Path

# Mapeo fase -> modo del orquestador.
$mode = if ($Phase -eq "baseline") { "baseline" } else { "mcp" }

# --- Config ---
$configPath = if ($Config) { $Config } else { Join-Path $benchDir "benchmark-mcp.config.json" }
$cfg = $null
if (Test-Path $configPath) { $cfg = Get-Content $configPath -Raw | ConvertFrom-Json }
$resultsBaseDir = if ($cfg -and $cfg.results_dir) { Join-Path $root ($cfg.results_dir -replace '/','\') } else { Join-Path $benchDir "results" }
$reportsDir = if ($cfg -and $cfg.reports_dir) { Join-Path $root ($cfg.reports_dir -replace '/','\') } else { Join-Path $benchDir "reports" }
$resultsDir = if ($Label -and $Label -ne "default") { Join-Path $resultsBaseDir $Label } else { $resultsBaseDir }

Write-Host "`n=== FASE $Phase (modo $mode) | etiqueta: $Label ===" -ForegroundColor Magenta
if ($Phase -eq "baseline") {
    Write-Host "Entorno: optimizadores desinstalados (sandbox HOME/config, PATH limpio, MCP deshabilitado, --pure)." -ForegroundColor DarkCyan
} else {
    Write-Host "Entorno: optimizadores activos (plugins globales, MCP habilitado)." -ForegroundColor DarkCyan
}

# --- Ejecutar la bateria ---
$runParams = @{ Mode = $mode; Label = $Label }
if ($MaxMinutes -gt 0) { $runParams['MaxMinutes'] = $MaxMinutes }
if ($Queries.Count -gt 0) { $runParams['Queries'] = $Queries }
if ($Repetitions -gt 0) { $runParams['Repetitions'] = $Repetitions }
if ($QueryTimeout -gt 0) { $runParams['QueryTimeout'] = $QueryTimeout }
if ($Model) { $runParams['Model'] = $Model }
if ($Config) { $runParams['Config'] = $Config }
if ($Pilot) { $runParams['Pilot'] = $true }
if ($Force) { $runParams['Force'] = $true }
if ($DryRun) { $runParams['DryRun'] = $true }

& (Join-Path $benchDir "run-benchmark.ps1") @runParams

if ($DryRun) { Write-Host "`n[DRY RUN] Fase $Phase planificada." -ForegroundColor Green; return }
if ($SkipReport) { Write-Host "`nFase ejecutada. Informe omitido (-SkipReport)." -ForegroundColor Yellow; return }

# --- Analisis ---
Write-Host "`n--- Analisis ---" -ForegroundColor Cyan
& (Join-Path $benchDir "analyze.ps1") -ResultsDir $resultsDir

# --- Informe ---
Write-Host "`n--- Informe ---" -ForegroundColor Cyan
& (Join-Path $benchDir "generate-report.ps1") -ResultsDir $resultsDir -ReportsDir $reportsDir -ReportName $Label

$mdPath = Join-Path $reportsDir ($Label + '.md')
Write-Host "`n=== FASE $Phase COMPLETADA ===" -ForegroundColor Green
Write-Host ("Informe: " + $mdPath) -ForegroundColor White
Write-Host ("Resultados: " + $resultsDir) -ForegroundColor White
