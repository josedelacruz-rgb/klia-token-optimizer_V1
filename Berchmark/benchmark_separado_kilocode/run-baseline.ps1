<#
.SYNOPSIS
    Benchmark baseline: ejecuta las queries con kilocode sin optimizadores.

.DESCRIPTION
    Lanza `kilocode run` para cada query en queries/queries.json y genera
    results/baseline/baselineNN.md con la respuesta y las metricas.

    Tu activas/desactivas los optimizadores en kilo.jsonc antes de ejecutar.
    Este script no toca la configuracion de kilocode.

.PARAMETER TimeoutMinutes
    Minutos maximos por query (default: 5).

.PARAMETER Queries
    Lista de numeros de query separados por coma (ej: "1,5,13").
    Default: todas (18).

.PARAMETER ProjectDir
    Ruta al proyecto sobre el que se ejecutan las queries.
    Default: el repo padre (klia-token-optimizer).

.PARAMETER Model
    Modelo a usar (ej: klia/GLM-5.2).
    Default: el definido en queries.json.

.EXAMPLE
    .\run-baseline.ps1
    Ejecuta las 18 queries con timeout de 5 minutos cada una.

.EXAMPLE
    .\run-baseline.ps1 -TimeoutMinutes 25
    Ejecuta las 18 queries con timeout de 25 minutos cada una.

.EXAMPLE
    .\run-baseline.ps1 -Queries 1,5,13 -TimeoutMinutes 10
    Ejecuta solo Q01, Q05 y Q13 con timeout de 10 minutos.
#>
param(
    [int]$TimeoutMinutes = 5,
    [string]$Queries,
    [string]$ProjectDir,
    [string]$Model,
    [int]$Repetitions = 1
)

$ErrorActionPreference = "Stop"
$benchDir = Split-Path -Parent $MyInvocation.MyCommand.Path

. (Join-Path $benchDir "benchmark-common.ps1")

Invoke-Benchmark -Mode "baseline" `
    -TimeoutMinutes $TimeoutMinutes `
    -Queries $Queries `
    -ProjectDir $ProjectDir `
    -Model $Model `
    -Repetitions $Repetitions `
    -BenchDir $benchDir
