#Requires -Version 5.1
<#
.SYNOPSIS
    Orquestador del benchmark MCP vs Baseline para OpenCode + OpenAI.
.DESCRIPTION
    Ejecuta la bateria de consultas definida en queries.json en dos modos:
      - baseline: todos los MCP deshabilitados (solo OpenAI directo)
      - mcp:      todos los MCP habilitados (OpenAI + servidores MCP)
    Para cada consulta captura:
      - Tokens de entrada, salida, razonamiento, cache (de la BD de opencode)
      - Coste en USD (de la BD de opencode)
      - Latencia total (medida por el script)
      - Llamadas a herramientas y servidores MCP (del stream JSON de opencode run)
      - Respuesta final y errores
    Los resultados se guardan en results/<mode>/<query_id>/run-<n>/{session.json,metrics.json,response.txt,raw.jsonl}
    El script es idempotente: si ya existe un resultado para (query, mode, run), lo salta.
    Ante error, restaura la config original de opencode.
.PARAMETER Mode
    baseline | mcp | both (default: both)
.PARAMETER Repetitions
    Numero de repeticiones por consulta (default: 1)
.PARAMETER Queries
    Lista de IDs de consultas a ejecutar (default: todas)
.PARAMETER Pilot
    Switch para modo pilot (2 consultas de prueba, 1 repeticion)
.PARAMETER Config
    Ruta al fichero de configuracion (default: benchmark-mcp.config.json)
.EXAMPLE
    .\run-benchmark.ps1 -Pilot
    Ejecuta el pilot test (Q01 y Q05 en ambos modos, 1 repeticion)
.EXAMPLE
    .\run-benchmark.ps1 -Mode both -Repetitions 3
    Ejecuta todas las consultas en ambos modos con 3 repeticiones
#>
[CmdletBinding()]
param(
    [ValidateSet("baseline","mcp","both")]
    [string]$Mode = "both",

    [ValidateRange(1,10)]
    [int]$Repetitions = 1,

    [string[]]$Queries = @(),

    [switch]$Pilot,

    [int]$QueryTimeout = 180,

    [string]$Config = $null
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path "$PSScriptRoot\..").Path
$benchDir = Join-Path $root "benchmark-mcp"
$queriesFile = Join-Path $benchDir "queries\queries.json"

# --- Cargar configuracion ---
$configPath = if ($Config) { $Config } else { Join-Path $benchDir "benchmark-mcp.config.json" }
if (Test-Path $configPath) {
    $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
    $projectDir = $cfg.project_dir
    $opencodeConfigPath = $cfg.opencode_config_path
    $baselineConfig = Join-Path $projectDir ($cfg.baseline_config -replace '/','\')
    $mcpConfig = Join-Path $projectDir ($cfg.mcp_config -replace '/','\')
    $model = $cfg.model
    $resultsDir = Join-Path $projectDir ($cfg.results_dir -replace '/','\')
    $logsDir = Join-Path $projectDir ($cfg.logs_dir -replace '/','\')
} else {
    # Defaults
    $projectDir = $root
    $opencodeConfigPath = Join-Path $env:USERPROFILE ".config\opencode\opencode.json"
    $baselineConfig = Join-Path $benchDir "configs\opencode.baseline.json"
    $mcpConfig = Join-Path $benchDir "configs\opencode.mcp.json"
    $model = "klia/GLM-5.2"
    $resultsDir = Join-Path $benchDir "results"
    $logsDir = Join-Path $benchDir "logs"
}

# --- Cargar bateria de consultas ---
if (-not (Test-Path $queriesFile)) { throw "No se encuentra el fichero de consultas: $queriesFile" }
$queriesData = Get-Content $queriesFile -Raw | ConvertFrom-Json
$allQueries = $queriesData.queries

# Filtrar consultas
if ($Pilot) {
    $pilotIds = $queriesData.metadata.pilot_queries
    if (-not $pilotIds) { $pilotIds = @($allQueries[0].id, $allQueries[4].id) }
    $selected = $allQueries | Where-Object { $pilotIds -contains $_.id }
    $Repetitions = 1
    Write-Host "[PILOT] Consultas: $($pilotIds -join ', ') | 1 repeticion" -ForegroundColor Cyan
} elseif ($Queries.Count -gt 0) {
    $selected = $allQueries | Where-Object { $Queries -contains $_.id }
} else {
    $selected = $allQueries
}

if (-not $selected) { throw "No se selecciono ninguna consulta" }

# --- Helpers ---
function Backup-Config {
    param([string]$Path)
    $bak = "$Path.bak-benchmark-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item -LiteralPath $Path -Destination $bak -Force
    return $bak
}

function Restore-Config {
    param([string]$BakPath, [string]$ConfigPath)
    if (Test-Path $BakPath) {
        Copy-Item -LiteralPath $BakPath -Destination $ConfigPath -Force
        Write-Host "  [RESTORE] Config restaurada desde $BakPath" -ForegroundColor Yellow
    }
}

function Set-ModeConfig {
    param([string]$Mode, [string]$ConfigPath, [string]$BaselineSrc, [string]$McpSrc)
    $src = if ($Mode -eq "baseline") { $BaselineSrc } else { $McpSrc }
    $srcContent = Get-Content $src -Raw | ConvertFrom-Json
    # Reconstruir la config preservando schema y otros campos, reemplazando mcp y plugin
    $current = Get-Content $ConfigPath -Raw | ConvertFrom-Json
    # Reemplazar mcp
    if ($current.PSObject.Properties.Name -contains "mcp") {
        $current.mcp = $srcContent.mcp
    } else {
        $current | Add-Member -NotePropertyName mcp -NotePropertyValue $srcContent.mcp -Force
    }
    # Reemplazar plugin
    if ($current.PSObject.Properties.Name -contains "plugin") {
        $current.plugin = $srcContent.plugin
    } else {
        $current | Add-Member -NotePropertyName plugin -NotePropertyValue $srcContent.plugin -Force
    }
    $current | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
    Write-Host "  [CONFIG] Modo '$Mode' aplicado" -ForegroundColor Green
}

function Get-SessionMetrics {
    param([string]$SessionId)
    # Consulta la BD de opencode para obtener tokens y coste reales de la sesion
    try {
        $json = opencode db "SELECT tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, cost, model, title, time_created, time_updated FROM session WHERE id = '$SessionId'" --format json 2>&1 | Out-String
        $rows = $json | ConvertFrom-Json
        if ($rows -and $rows.Count -gt 0) { return $rows[0] }
    } catch {
        Write-Warning "No se pudieron leer metricas de la BD para sesion $SessionId : $_"
    }
    return $null
}

function Parse-ToolCallsFromJsonl {
    param([string]$JsonlPath)
    # Extrae llamadas a herramientas del stream JSON de opencode run --format json
    # Formato real detectado: { type: "tool_use", part: { type: "tool", tool: "semble_search", callID: ... } }
    $toolCalls = @()
    $assistantMessages = 0
    $errors = @()
    if (-not (Test-Path $JsonlPath)) { return @{ toolCalls = $toolCalls; assistantMessages = 0; errors = $errors } }
    Get-Content $JsonlPath | ForEach-Object {
        if ([string]::IsNullOrWhiteSpace($_)) { return }
        try {
            $ev = $_ | ConvertFrom-Json
        } catch { return }

        # Evento tool_use (formato real de opencode 1.19)
        if ($ev.type -eq "tool_use" -and $ev.part -and $ev.part.tool) {
            $toolName = $ev.part.tool
            # Detectar servidor MCP por prefijo del nombre de tool
            # Semble: semble_search, semble_find_related -> server "semble"
            # Repomix: repomix_pack_codebase, repomix_grep_repomix_output -> server "repomix"
            # Serena: serena_* -> server "serena"
            # Klia router: klia_token_optimizer_* -> server "klia-token-optimizer"
            # Nativas: read, grep, glob, bash, edit, write, task -> server "native"
            $server = "native"
            if ($toolName -match "^(semble)_") { $server = "semble" }
            elseif ($toolName -match "^(repomix)_") { $server = "repomix" }
            elseif ($toolName -match "^(serena)_") { $server = "serena" }
            elseif ($toolName -match "^klia[-_]token[-_]optimizer") { $server = "klia-token-optimizer" }
            elseif ($toolName -match "^(ctx_)") { $server = "context-mode" }
            elseif ($toolName -match "^(mcp__)") { $server = "mcp" }

            $toolCalls += [PSCustomObject]@{
                tool = $toolName
                server = $server
                args = $ev.part.args
                time = $ev.timestamp
            }
        }

        # Contar mensajes del asistente (step_start indica nueva ronda)
        if ($ev.type -eq "step_start") { $assistantMessages++ }

        # Detectar errores
        if ($ev.type -eq "error" -or $ev.type -eq "tool.error") {
            $errMsg = if ($ev.message) { $ev.message } elseif ($ev.part -and $ev.part.error) { $ev.part.error } else { "error desconocido" }
            $errors += $errMsg
        }

        # Formato alternativo: eventos con role assistant + tool_calls
        if ($ev.role -eq "assistant" -and $ev.tool_calls) {
            $assistantMessages++
            foreach ($tc in $ev.tool_calls) {
                $toolName = $tc.function.name
                $server = "native"
                if ($toolName -match "^(semble)_") { $server = "semble" }
                elseif ($toolName -match "^(repomix)_") { $server = "repomix" }
                elseif ($toolName -match "^(serena)_") { $server = "serena" }
                elseif ($toolName -match "^klia[-_]token[-_]optimizer") { $server = "klia-token-optimizer" }
                $toolCalls += [PSCustomObject]@{
                    tool = $toolName
                    server = $server
                    args = $tc.function.arguments
                    time = $null
                }
            }
        }
    }
    return @{ toolCalls = $toolCalls; assistantMessages = $assistantMessages; errors = $errors }
}

function Extract-SessionId {
    param([string]$JsonlPath)
    if (-not (Test-Path $JsonlPath)) { return $null }
    $firstLines = Get-Content $JsonlPath -TotalCount 20
    foreach ($line in $firstLines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        try {
            $ev = $line | ConvertFrom-Json
            if ($ev.sessionID) { return $ev.sessionID }
            if ($ev.session) { return $ev.session }
            if ($ev.sessionId) { return $ev.sessionId }
            if ($ev.data -and $ev.data.sessionID) { return $ev.data.sessionID }
        } catch {}
    }
    return $null
}

function Extract-Response {
    param([string]$JsonlPath)
    $lastAssistantText = ""
    if (-not (Test-Path $JsonlPath)) { return $lastAssistantText }
    Get-Content $JsonlPath | ForEach-Object {
        if ([string]::IsNullOrWhiteSpace($_)) { return }
        try {
            $ev = $_ | ConvertFrom-Json
        } catch { return }
        # Formato real opencode 1.19: { type: "text", part: { type: "text", text: "..." } }
        if ($ev.type -eq "text" -and $ev.part -and $ev.part.text) {
            $lastAssistantText = $ev.part.text
        }
        # Formato alternativo
        elseif ($ev.type -eq "assistant.message" -and $ev.text) {
            $lastAssistantText = $ev.text
        }
        elseif ($ev.type -eq "message" -and $ev.role -eq "assistant" -and $ev.content) {
            $lastAssistantText = if ($ev.content -is [string]) { $ev.content } else { ($ev.content | ConvertTo-Json -Depth 5) }
        }
        elseif ($ev.role -eq "assistant" -and $ev.content) {
            $lastAssistantText = if ($ev.content -is [string]) { $ev.content } else { ($ev.content | ConvertTo-Json -Depth 5) }
        }
    }
    return $lastAssistantText
}

# --- Ejecucion ---
$modesToRun = if ($Mode -eq "both") { @("baseline","mcp") } else { @($Mode) }
$selectedArr = @($selected)
$totalRuns = $selectedArr.Count * $modesToRun.Count * $Repetitions
$currentRun = 0
$failures = @()

Write-Host "`n=== BENCHMARK MCP vs BASELINE ===" -ForegroundColor White
Write-Host "Consultas: $($selectedArr.Count) | Modos: $($modesToRun -join ', ') | Repeticiones: $Repetitions | Total: $totalRuns" -ForegroundColor White
Write-Host "Modelo: $model" -ForegroundColor White
Write-Host "Proyecto: $projectDir`n" -ForegroundColor White

# Backup inicial de la config de opencode
$configBackup = Backup-Config -Path $opencodeConfigPath
Write-Host "[BACKUP] Config original respaldada: $configBackup`n" -ForegroundColor Cyan

try {
    foreach ($query in $selectedArr) {
        Write-Host "`n--- Consulta $($query.id): $($query.category) ---" -ForegroundColor Cyan
        Write-Host "    Prompt: $($query.prompt.Substring(0,[Math]::Min(80,$query.prompt.Length)))..."
        foreach ($mode in $modesToRun) {
            for ($r = 1; $r -le $Repetitions; $r++) {
                $currentRun++
                $runId = "run-$r"
                $outDir = Join-Path $resultsDir "$mode\$($query.id)\$runId"
                $metricsFile = Join-Path $outDir "metrics.json"
                $rawFile = Join-Path $outDir "raw.jsonl"
                $responseFile = Join-Path $outDir "response.txt"
                $sessionFile = Join-Path $outDir "session.json"

                # Idempotencia: si ya existe metrics.json, saltar
                if (Test-Path $metricsFile) {
                    Write-Host "  [$currentRun/$totalRuns] $mode\$($query.id)\$runId  SKIP (ya existe)" -ForegroundColor DarkGray
                    continue
                }

                Write-Host "  [$currentRun/$totalRuns] $mode\$($query.id)\$runId  EJECUTANDO..." -ForegroundColor Yellow
                $outDir | ForEach-Object { New-Item -ItemType Directory -Path $_ -Force | Out-Null }

                # Aplicar config del modo
                Set-ModeConfig -Mode $mode -ConfigPath $opencodeConfigPath -BaselineSrc $baselineConfig -McpSrc $mcpConfig

                # Limpiar procesos opencode residuales (huerfanos de runs anteriores)
                # NO tocar el servidor principal (el de esta sesion) - solo procesos opencode run huerfanos
                Get-Process -Name "opencode" -ErrorAction SilentlyContinue | Where-Object {
                    $_.StartTime -lt (Get-Date).AddSeconds(-30) -and $_.Id -ne $PID
                } | ForEach-Object {
                    try { $_ | Stop-Process -Force -ErrorAction SilentlyContinue } catch {}
                }

                # Ejecutar opencode run --format json
                $startTs = Get-Date
                $logFile = Join-Path $logsDir "$mode-$($query.id)-$runId.log"
                $argsList = @("run","--format","json","--model",$model,"--title","[BENCH] $($query.id) $mode $runId","--dir",$projectDir,$query.prompt)
                # Buscar opencode.cmd (executable Win32 valido para Start-Process)
                $openCmd = Get-Command opencode.cmd -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
                if (-not $openCmd) {
                    $openCmd = Join-Path $env:APPDATA "npm\opencode.cmd"
                }
                if (-not (Test-Path $openCmd)) {
                    # Fallback: powershell wrapper
                    $proc = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile","-Command","opencode $($argsList -join ' ')") -RedirectStandardOutput $rawFile -RedirectStandardError $logFile -PassThru -NoNewWindow
                } else {
                    $proc = Start-Process -FilePath $openCmd -ArgumentList $argsList -RedirectStandardOutput $rawFile -RedirectStandardError $logFile -PassThru -NoNewWindow
                }
                $exited = $proc.WaitForExit(($QueryTimeout * 1000))
                $endTs = Get-Date
                $latencySec = [math]::Round(($endTs - $startTs).TotalSeconds, 2)

                if (-not $exited) {
                    try { $proc | Stop-Process -Force -ErrorAction SilentlyContinue } catch {}
                    Write-Warning "  TIMEOUT tras ${QueryTimeout}s en $mode\$($query.id)\$runId"
                    $failures += [PSCustomObject]@{
                        query_id = $query.id; mode = $mode; run = $runId; error = "timeout"
                    }
                    # Registrar fallo
                    $failMetrics = [PSCustomObject]@{
                        query_id = $query.id
                        mode = $mode
                        run = $runId
                        category = $query.category
                        status = "timeout"
                        error = "Timeout tras $QueryTimeout s"
                        latency_seconds = $QueryTimeout
                        started_at = $startTs.ToString("o")
                        ended_at = $endTs.ToString("o")
                    }
                    $failMetrics | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $metricsFile -Encoding UTF8
                    continue
                }

                $exitCode = $proc.ExitCode
                Write-Host "  Exit: $exitCode | Latencia: ${latencySec}s" -ForegroundColor DarkGray

                # Extraer sessionId del stream
                $sessionId = Extract-SessionId -JsonlPath $rawFile

                # Obtener metricas reales de la BD
                $sessMetrics = $null
                if ($sessionId) {
                    Start-Sleep -Milliseconds 800  # dar tiempo a que se escriba en BD
                    $sessMetrics = Get-SessionMetrics -SessionId $sessionId
                }

                # Parsear tool calls del stream
                $parsed = Parse-ToolCallsFromJsonl -JsonlPath $rawFile
                $responseText = Extract-Response -JsonlPath $rawFile

                # Guardar respuesta
                $responseText | Out-File -LiteralPath $responseFile -Encoding UTF8

                # Guardar session.json
                if ($sessMetrics) {
                    $sessMetrics | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $sessionFile -Encoding UTF8
                }

                # Construir metrics.json consolidado
                $tokensInput = if ($sessMetrics) { $sessMetrics.tokens_input } else { 0 }
                $tokensOutput = if ($sessMetrics) { $sessMetrics.tokens_output } else { 0 }
                $tokensReasoning = if ($sessMetrics) { $sessMetrics.tokens_reasoning } else { 0 }
                $tokensCacheRead = if ($sessMetrics) { $sessMetrics.tokens_cache_read } else { 0 }
                $tokensCacheWrite = if ($sessMetrics) { $sessMetrics.tokens_cache_write } else { 0 }
                $costUsd = if ($sessMetrics) { [math]::Round([double]$sessMetrics.cost, 6) } else { 0 }
                $totalTokens = [int]$tokensInput + [int]$tokensOutput + [int]$tokensReasoning

                # Agrupar tool calls por servidor
                $toolsByServer = @{}
                $parsed.toolCalls | ForEach-Object {
                    $s = if ($_.server) { $_.server } else { "unknown" }
                    if (-not $toolsByServer.ContainsKey($s)) { $toolsByServer[$s] = @() }
                    $toolsByServer[$s] += $_.tool
                }

                $metrics = [PSCustomObject]@{
                    query_id = $query.id
                    mode = $mode
                    run = $runId
                    category = $query.category
                    subcategory = $query.subcategory
                    prompt = $query.prompt
                    expected_mcp_usage = $query.expected_mcp_usage
                    model = $model
                    session_id = $sessionId
                    status = if ($exitCode -eq 0 -and $parsed.errors.Count -eq 0) { "success" } elseif ($exitCode -eq 0) { "success_with_errors" } else { "failed" }
                    exit_code = $exitCode
                    tokens_input = [int]$tokensInput
                    tokens_output = [int]$tokensOutput
                    tokens_reasoning = [int]$tokensReasoning
                    tokens_cache_read = [int]$tokensCacheRead
                    tokens_cache_write = [int]$tokensCacheWrite
                    tokens_total = $totalTokens
                    cost_usd = $costUsd
                    latency_seconds = $latencySec
                    assistant_messages = $parsed.assistantMessages
                    tool_calls_count = $parsed.toolCalls.Count
                    tool_calls_by_server = $toolsByServer
                    tool_calls_list = $parsed.toolCalls
                    errors = $parsed.errors
                    response_chars = $responseText.Length
                    started_at = $startTs.ToString("o")
                    ended_at = $endTs.ToString("o")
                    raw_file = (Resolve-Path $rawFile -Relative -ErrorAction SilentlyContinue)
                }

                $metrics | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $metricsFile -Encoding UTF8
                Write-Host "  Tokens: in=$tokensInput out=$tokensOutput reason=$tokensReasoning total=$totalTokens | Cost: `$$costUsd | Tools: $($parsed.toolCalls.Count)" -ForegroundColor Green
            }
        }
    }
} finally {
    # Restaurar config original SIEMPRE
    Restore-Config -BakPath $configBackup -ConfigPath $opencodeConfigPath
}

Write-Host "`n=== BENCHMARK COMPLETADO ===" -ForegroundColor Green
Write-Host "Total ejecuciones: $currentRun / $totalRuns" -ForegroundColor White
if ($failures.Count -gt 0) {
    Write-Host "Fallos: $($failures.Count)" -ForegroundColor Red
    $failures | Format-Table -AutoSize
}
Write-Host "Resultados en: $resultsDir" -ForegroundColor White
Write-Host "Logs en: $logsDir`n" -ForegroundColor White
