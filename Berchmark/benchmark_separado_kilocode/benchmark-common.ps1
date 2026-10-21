# benchmark-common.ps1
# Logica compartida para run-baseline.ps1 y run-optimizer.ps1.
# No se ejecuta solo; debe ser dot-sourced desde los scripts principales.

# ---------------------------------------------------------------------------
# Configuracion y localizacion de ejecutables
# ---------------------------------------------------------------------------

function Get-BenchConfig {
    param([string]$BenchDir)

    $queriesFile = Join-Path $BenchDir "queries\queries.json"
    if (-not (Test-Path -LiteralPath $queriesFile)) {
        throw "No se encontro queries\queries.json en $BenchDir"
    }

    $raw = Get-Content -LiteralPath $queriesFile -Raw -Encoding UTF8
    $raw = $raw.TrimStart([char]65279)
    $config = $raw | ConvertFrom-Json

    return $config
}

function Find-KilocodeExecutable {
    # Preferir .cmd (ejecutable nativo para Start-Process en Windows).
    # Evitar .ps1 porque Start-Process no maneja bien los scripts de PowerShell.
    $candidates = @(
        (Join-Path $env:APPDATA "npm\kilocode.cmd"),
        (Join-Path $env:LOCALAPPDATA "npm\kilocode.cmd"),
        (Join-Path $env:USERPROFILE ".bun\bin\kilocode.cmd"),
        (Join-Path $env:USERPROFILE ".bun\bin\kilocode.exe"),
        (Join-Path $env:USERPROFILE "AppData\Roaming\npm\kilocode.cmd"),
        (Join-Path $env:APPDATA "npm\kilo.cmd"),
        (Join-Path $env:LOCALAPPDATA "npm\kilo.cmd"),
        (Join-Path $env:USERPROFILE ".bun\bin\kilo.cmd"),
        (Join-Path $env:USERPROFILE ".bun\bin\kilo.exe"),
        (Join-Path $env:USERPROFILE "AppData\Roaming\npm\kilo.cmd")
    )
    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c) { return $c }
    }

    # Fallback: buscar en PATH pero saltando .ps1
    $cmd = Get-Command kilocode -ErrorAction SilentlyContinue |
        Where-Object { $_.Source -notmatch '\.ps1$' } |
        Select-Object -First 1 -ExpandProperty Source
    if ($cmd) { return $cmd }

    $cmd = Get-Command kilo -ErrorAction SilentlyContinue |
        Where-Object { $_.Source -notmatch '\.ps1$' } |
        Select-Object -First 1 -ExpandProperty Source
    if ($cmd) { return $cmd }

    # Ultimo recurso: el .ps1 (se ejecutara via powershell.exe)
    $cmd = Get-Command kilocode -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty Source
    if ($cmd) { return $cmd }

    $cmd = Get-Command kilo -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty Source
    if ($cmd) { return $cmd }

    return $null
}

# ---------------------------------------------------------------------------
# Parseo del stream JSONL de kilocode run --format json
# ---------------------------------------------------------------------------

function Parse-JsonStream {
    param([string]$RawFile)

    $result = [ordered]@{
        tokens_input       = 0
        tokens_output      = 0
        tokens_reasoning   = 0
        tokens_cache_read  = 0
        tokens_cache_write = 0
        tokens_total       = 0
        cost_usd           = 0.0
        tool_calls_count   = 0
        tools_used         = @()
        assistant_messages = 0
        response           = ""
        status             = "unknown"
        errors             = @()
    }

    if (-not (Test-Path -LiteralPath $RawFile)) {
        $result.status = "no_output"
        return $result
    }

    $lines = Get-Content -LiteralPath $RawFile -Encoding UTF8 -ErrorAction SilentlyContinue
    if (-not $lines -or $lines.Count -eq 0) {
        $result.status = "empty_output"
        return $result
    }

    $hasStop  = $false
    $hasError = $false

    foreach ($line in $lines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        try {
            $evt = $line | ConvertFrom-Json
        } catch { continue }

        if (-not $evt.type) { continue }

        switch ($evt.type) {
            "text" {
                if ($evt.part -and $evt.part.text) {
                    $result.response += $evt.part.text
                }
            }
            "tool_use" {
                $result.tool_calls_count++
                if ($evt.part -and $evt.part.tool) {
                    $result.tools_used += $evt.part.tool
                }
            }
            "step_finish" {
                $result.assistant_messages++
                if ($evt.part) {
                    if ($evt.part.reason -eq "stop") { $hasStop = $true }

                    if ($evt.part.tokens) {
                        $result.tokens_input  += ($evt.part.tokens.input -as [int])
                        $result.tokens_output += ($evt.part.tokens.output -as [int])
                        if ($evt.part.tokens.reasoning) {
                            $result.tokens_reasoning += ($evt.part.tokens.reasoning -as [int])
                        }
                        if ($evt.part.tokens.cache) {
                            if ($evt.part.tokens.cache.read) {
                                $result.tokens_cache_read += ($evt.part.tokens.cache.read -as [int])
                            }
                            if ($evt.part.tokens.cache.write) {
                                $result.tokens_cache_write += ($evt.part.tokens.cache.write -as [int])
                            }
                        }
                        if ($evt.part.tokens.total) {
                            $result.tokens_total += ($evt.part.tokens.total -as [int])
                        }
                    }

                    if ($evt.part.cost) {
                        $result.cost_usd += ($evt.part.cost -as [double])
                    }
                }
            }
            "error" {
                $hasError = $true
                if ($evt.part -and $evt.part.error) {
                    $result.errors += $evt.part.error
                }
            }
        }
    }

    if ($hasStop -and $hasError) {
        $result.status = "success_with_errors"
    } elseif ($hasStop) {
        $result.status = "success"
    } elseif ($hasError) {
        $result.status = "failed"
    } else {
        $result.status = "incomplete"
    }

    return $result
}

# ---------------------------------------------------------------------------
# Generacion del .md de resultados
# ---------------------------------------------------------------------------

function New-ResultMarkdown {
    param(
        [string]$OutputFile,
        [object]$Query,
        [object]$Metrics,
        [string]$Mode,
        [string]$Model,
        [int]$DurationSeconds,
        [string]$StartedAt
    )

    $num     = $Query.id -replace '^Q',''
    $cat     = $Query.category
    $task    = $Query.task_type
    $prompt  = $Query.prompt

    $toolsList = "(ninguna)"
    if ($Metrics.tools_used -and $Metrics.tools_used.Count -gt 0) {
        $toolsList = ($Metrics.tools_used -join ', ')
    }

    $errorsSection = ""
    if ($Metrics.errors -and $Metrics.errors.Count -gt 0) {
        $errorsSection = "`n`n## Errores`n`n"
        $errorsSection += ($Metrics.errors -join "`n`n")
    }

    $response = $Metrics.response
    if ([string]::IsNullOrWhiteSpace($response)) {
        $response = "(sin respuesta)"
    }

    $md = @"
# Prueba $num - $cat

**Prompt:** $prompt
**Categoria:** $cat
**TaskType:** $task
**Modelo:** $Model
**Modo:** $Mode
**Fecha:** $StartedAt
**Duracion:** ${DurationSeconds}s
**Estado:** $($Metrics.status)

## Respuesta

$response

## Metricas

- tokens_input: $($Metrics.tokens_input)
- tokens_output: $($Metrics.tokens_output)
- tokens_reasoning: $($Metrics.tokens_reasoning)
- tokens_cache_read: $($Metrics.tokens_cache_read)
- tokens_cache_write: $($Metrics.tokens_cache_write)
- tokens_total: $($Metrics.tokens_total)
- cost_usd: $($Metrics.cost_usd)
- tool_calls: $($Metrics.tool_calls_count)
- tools_usadas: $toolsList
- assistant_messages: $($Metrics.assistant_messages)
$errorsSection
"@

    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($OutputFile, $md, $utf8NoBom)
}

# ---------------------------------------------------------------------------
# Ejecucion de una query individual
# ---------------------------------------------------------------------------

function Invoke-SingleQuery {
    param(
        [object]$Query,
        [string]$Mode,
        [string]$Model,
        [string]$ProjectDir,
        [int]$TimeoutSeconds,
        [string]$ResultsDir,
        [string]$LogsDir
    )

    $num    = $Query.id -replace '^Q',''
    $prefix = if ($Mode -eq "baseline") { "baseline" } else { "optimizer" }

    $outputFile = Join-Path $ResultsDir "$prefix$num.md"
    $rawFile    = Join-Path $LogsDir "$prefix-$num.raw.jsonl"
    $logFile    = Join-Path $LogsDir "$prefix-$num.log"

    $startedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $start     = Get-Date

    Write-Host "  [$($Query.id)] $($Query.category)/$($Query.subcategory)" -ForegroundColor White
    $promptPreview = $Query.prompt
    if ($promptPreview.Length -gt 80) { $promptPreview = $promptPreview.Substring(0, 80) + "..." }
    Write-Host "    Prompt: $promptPreview" -ForegroundColor DarkGray

    $kiloCmd = Find-KilocodeExecutable
    if (-not $kiloCmd) {
        Write-Host "    ERROR: kilocode no encontrado en PATH" -ForegroundColor Red
        return @{ status = "failed" }
    }

    # Si el ejecutable es un .ps1, hay que lanzarlo via powershell.exe
    $isPs1 = $kiloCmd -match '\.ps1$'

    if ($isPs1) {
        $argString = "-NoProfile -ExecutionPolicy Bypass -File `"$kiloCmd`" run --format json --model `"$Model`" --dir `"$ProjectDir`" `"$($Query.prompt)`""
        $exePath = "powershell.exe"
    } else {
        $argString = "run --format json --model `"$Model`" --dir `"$ProjectDir`" `"$($Query.prompt)`""
        $exePath = $kiloCmd
    }

    Write-Host "    EJECUTANDO (timeout ${TimeoutSeconds}s)..." -ForegroundColor Yellow

    if (Test-Path -LiteralPath $rawFile) { Remove-Item -LiteralPath $rawFile -Force }
    if (Test-Path -LiteralPath $logFile) { Remove-Item -LiteralPath $logFile -Force }

    $process  = $null
    $timedOut = $false

    try {
        $process = Start-Process -FilePath $exePath -ArgumentList $argString `
            -RedirectStandardOutput $rawFile `
            -RedirectStandardError $logFile `
            -PassThru -NoNewWindow

        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            $timedOut = $true
            try { $process.Kill() } catch {}
            try { $process.WaitForExit(5000) } catch {}
            Write-Host "    TIMEOUT tras ${TimeoutSeconds}s" -ForegroundColor Red
        }
    } catch {
        Write-Host "    ERROR al lanzar kilocode: $_" -ForegroundColor Red
        return @{ status = "failed" }
    }

    $end      = Get-Date
    $duration = [int]($end - $start).TotalSeconds

    if ($timedOut) {
        $metrics = [ordered]@{
            tokens_input       = 0
            tokens_output      = 0
            tokens_reasoning   = 0
            tokens_cache_read  = 0
            tokens_cache_write = 0
            tokens_total       = 0
            cost_usd           = 0.0
            tool_calls_count   = 0
            tools_used         = @()
            assistant_messages = 0
            response           = "(timeout - sin respuesta)"
            status             = "timeout"
            errors             = @("Timeout tras ${TimeoutSeconds}s")
        }
        New-ResultMarkdown -OutputFile $outputFile -Query $Query -Metrics $metrics `
            -Mode $Mode -Model $Model -DurationSeconds $duration -StartedAt $startedAt
        Write-Host "    -> $outputFile (timeout)" -ForegroundColor DarkYellow
        return @{ status = "timeout" }
    }

    $metrics = Parse-JsonStream -RawFile $rawFile

    New-ResultMarkdown -OutputFile $outputFile -Query $Query -Metrics $metrics `
        -Mode $Mode -Model $Model -DurationSeconds $duration -StartedAt $startedAt

    $color = if ($metrics.status -eq "success") { "Green" } else { "DarkYellow" }
    Write-Host "    -> $outputFile ($($metrics.status), ${duration}s, $($metrics.tokens_total) tokens, $($metrics.tool_calls_count) tools)" -ForegroundColor $color

    return @{ status = $metrics.status }
}

# ---------------------------------------------------------------------------
# Orquestador principal
# ---------------------------------------------------------------------------

function Invoke-Benchmark {
    param(
        [Parameter(Mandatory=$true)]
        [ValidateSet("baseline","optimizer")]
        [string]$Mode,

        [int]$TimeoutMinutes = 5,

        [string]$Queries,

        [string]$ProjectDir,

        [string]$Model,

        [string]$BenchDir
    )

    $config = Get-BenchConfig -BenchDir $BenchDir

    if (-not $ProjectDir) {
        $ProjectDir = (Get-Item $BenchDir).Parent.Parent.FullName
    }
    if (-not $Model) {
        $Model = $config.model
    }

    $kiloCmd = Find-KilocodeExecutable
    if (-not $kiloCmd) {
        Write-Host "ERROR: kilocode no encontrado en PATH. Instalalo o agrega el directorio al PATH." -ForegroundColor Red
        return
    }
    Write-Host "kilocode: $kiloCmd" -ForegroundColor DarkGray

    if (-not (Test-Path -LiteralPath $ProjectDir)) {
        Write-Host "ERROR: ProjectDir no existe: $ProjectDir" -ForegroundColor Red
        return
    }
    Write-Host "Proyecto: $ProjectDir" -ForegroundColor DarkGray

    $selectedIds = $null
    if ($Queries) {
        $selectedIds = @()
        $Queries -split ',' | ForEach-Object {
            $n = $_.Trim() -replace '^Q',''
            if ($n -match '^\d+$') {
                $selectedIds += "Q{0:D2}" -f [int]$n
            }
        }
    }

    $toRun = @()
    foreach ($q in $config.queries) {
        if ($selectedIds) {
            if ($q.id -notin $selectedIds) { continue }
        }
        $toRun += $q
    }

    if ($toRun.Count -eq 0) {
        Write-Host "No hay queries para ejecutar." -ForegroundColor Red
        return
    }

    $resultsDir = Join-Path $BenchDir "results\$Mode"
    $logsDir    = Join-Path $BenchDir "logs"
    if (-not (Test-Path -LiteralPath $resultsDir)) {
        New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null
    }
    if (-not (Test-Path -LiteralPath $logsDir)) {
        New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    }

    $timeoutSeconds = $TimeoutMinutes * 60
    $total = $toRun.Count

    Write-Host ""
    Write-Host "=== Benchmark $Mode ===" -ForegroundColor Cyan
    Write-Host "Queries: $total | Modelo: $Model | Timeout: ${TimeoutMinutes}min (${timeoutSeconds}s)" -ForegroundColor White
    Write-Host "Proyecto: $ProjectDir" -ForegroundColor DarkGray
    Write-Host ""

    $current  = 0
    $success  = 0
    $failed   = 0
    $timeout  = 0

    foreach ($query in $toRun) {
        $current++
        Write-Host "[$current/$total]" -ForegroundColor Cyan

        $result = Invoke-SingleQuery -Query $query -Mode $Mode -Model $Model `
            -ProjectDir $ProjectDir -TimeoutSeconds $timeoutSeconds `
            -ResultsDir $resultsDir -LogsDir $logsDir

        switch ($result.status) {
            "success"              { $success++ }
            "success_with_errors"  { $success++ }
            "timeout"              { $timeout++ }
            default                { $failed++ }
        }

        Write-Host ""
    }

    Write-Host "=== Resumen $Mode ===" -ForegroundColor Cyan
    Write-Host "Total: $total | OK: $success | Timeout: $timeout | Fallidos: $failed" -ForegroundColor White
    Write-Host "Resultados: $resultsDir" -ForegroundColor DarkGray
}
