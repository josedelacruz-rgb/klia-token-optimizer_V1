#Requires -Version 5.1
<#
.SYNOPSIS
    Benchmark REAL: optimizado (kilo configurado) -> desinstalar optimizadores -> baseline.
.DESCRIPTION
    1. Ejecuta la bateria en modo MCP/optimizado con la config actual de kilo.
    2. Ejecuta el script de desinstalacion remove_klia_tokens.ps1.
    3. Ejecuta la bateria en modo baseline (sin optimizadores).
    4. Genera analisis y reporte con ahorro real de tokens.
#>
[CmdletBinding()]
param(
    [int]$Repetitions = 3,
    [string[]]$Queries = @(),
    [switch]$Pilot,
    [int]$QueryTimeout = 180
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..").Path
$benchDir = Join-Path $root 'benchmark-mcp'
$removeScript = Join-Path $root '..\instaladores\remove_klia_tokens.ps1'

Write-Host "=== FASE 1: OPTIMIZADO (kilo configurado) ===" -ForegroundColor Magenta
& (Join-Path $benchDir 'run-benchmark.ps1') -Mode mcp -Repetitions $Repetitions -Queries $Queries -Pilot:$Pilot -QueryTimeout $QueryTimeout

Write-Host "=== FASE 2: DESINSTALAR OPTIMIZADORES ===" -ForegroundColor Magenta
& $removeScript -Uninstall

Write-Host "=== FASE 3: BASELINE ===" -ForegroundColor Magenta
& (Join-Path $benchDir 'run-benchmark.ps1') -Mode baseline -Repetitions $Repetitions -Queries $Queries -Pilot:$Pilot -QueryTimeout $QueryTimeout

Write-Host "=== FASE 4: ANALISIS ===" -ForegroundColor Magenta
& (Join-Path $benchDir 'analyze.ps1')
& (Join-Path $benchDir 'generate-report.ps1')

Write-Host "=== BENCHMARK COMPLETADO ===" -ForegroundColor Green
