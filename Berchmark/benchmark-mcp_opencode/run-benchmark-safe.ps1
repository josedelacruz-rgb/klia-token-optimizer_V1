#Requires -Version 5.1
<#
.SYNOPSIS
    Benchmark MCP vs Baseline SEGURO: arranca servidor OpenCode dedicado por modo,
    no reutiliza el servidor en marcha (evita contaminacion de config cacheada).
.DESCRIPTION
    Estrategia de aislamiento:
    1. Para cada modo (baseline/mcp): aplica la config del modo a opencode.json.
    2. Arranca un servidor opencode dedicado en puerto 14099 (no toca el de esta sesion).
    3. Para cada consulta: opencode run --attach http://localhost:14099 --fork (sesion nueva).
    4. Entre modos: para el servidor, swap config, arranca uno nuevo.
    5. Al final: restaura config y para el servidor dedicado.
    6. Verifica que el baseline no usa tools MCP (post-run check).
.PARAMETER Mode
    baseline | mcp | both (default: both)
.PARAMETER Repetitions
    Numero de repeticiones por consulta (default: 3)
.PARAMETER Queries
    Lista de IDs de consultas a ejecutar (default: todas)
.PARAMETER Pilot
    Switch para modo pilot (2 consultas de prueba, 1 repeticion)
.PARAMETER QueryTimeout
    Timeout por consulta en segundos (default: 180)
.PARAMETER ServerPort
    Puerto del servidor OpenCode dedicado (default: 14099)
.EXAMPLE
    .\run-benchmark-safe.ps1 -Pilot
    Pilot: Q01 y Q05 en ambos modos, 1 repeticion
.EXAMPLE
    .\run-benchmark-safe.ps1 -Mode both -Repetitions 3
    Benchmark completo: 12 consultas x 2 modos x 3 repeticiones = 72 ejecuciones
#>
[CmdletBinding()]
param(
    [ValidateSet('baseline','mcp','both')]
    [string]$Mode = 'both',

    [ValidateRange(1,10)]
    [int]$Repetitions = 3,

    [string[]]$Queries = @(),

    [switch]$Pilot,

    [int]$QueryTimeout = 180,

    [int]$ServerPort = 14099
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..").Path
$benchDir = Join-Path $root 'benchmark-mcp'
$queriesFile = Join-Path $benchDir 'queries\queries.json'

# Config paths
$opencodeConfigPath = Join-Path $env:USERPROFILE '.config\opencode\opencode.json'
$baselineConfig = Join-Path $benchDir 'configs\opencode.baseline.json'
$mcpConfig = Join-Path $benchDir 'configs\opencode.mcp.json'
$model = 'klia/GLM-5.2'
$resultsDir = Join-Path $benchDir 'results'
$logsDir = Join-Path $benchDir 'logs'

# --- Cargar bateria de consultas ---
if (-not (Test-Path $queriesFile)) { throw "No se encuentra el fichero de consultas: $queriesFile" }
$queriesData = Get-Content $queriesFile -Raw | ConvertFrom-Json
$allQueries = $queriesData.queries

# Filtrar consultas
if ($Pilot) {
    $pilotIds = @('Q01','Q05')
    $selected = $allQueries | Where-Object { $pilotIds -contains $_.id }
    $Repetitions = 1
    Write-Host "[PILOT] Consultas: $($pilotIds -join ', ') | 1 repeticion" -ForegroundColor Cyan
} elseif ($Queries.Count -gt 0) {
    $selected = $allQueries | Where-Object { $Queries -contains $_.id }
} else {
    $selected = $allQueries
}
$selectedArr = @($selected)
if (-not $selectedArr) { throw 'No se selecciono ninguna consulta' }

# --- Helpers ---
function Backup-Config([string]$Path) {
    $bak = "$Path.bak-benchmark-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item -LiteralPath $Path -Destination $bak -Force
    return $bak
}

function Restore-Config([string]$BakPath, [string]$ConfigPath) {
    if (Test-Path $BakPath) {
        Copy-Item -LiteralPath $BakPath -Destination $ConfigPath -Force
        Write-Host "  [RESTORE] Config restaurada desde $BakPath" -ForegroundColor Yellow
    }
}

function Set-ModeConfig([string]$Mode, [string]$ConfigPath, [string]$BaselineSrc, [string]$McpSrc) {
    $src = if ($Mode -eq 'baseline') { $BaselineSrc } else { $McpSrc }
    $srcContent = Get-Content $src -Raw | ConvertFrom-Json
    $current = Get-Content $ConfigPath -Raw | ConvertFrom-Json
    if ($current.PSObject.Properties.Name -contains 'mcp') {
        $current.mcp = $srcContent.mcp
    } else {
        $current | Add-Member -NotePropertyName mcp -NotePropertyValue $srcContent.mcp -Force
    }
    if ($current.PSObject.Properties.Name -contains 'plugin') {
        $current.plugin = $srcContent.plugin
    } else {
        $current | Add-Member -NotePropertyName plugin -NotePropertyValue $srcContent.plugin -Force
    }
    $current | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
    Write-Host "  [CONFIG] Modo '$Mode' aplicado" -ForegroundColor Green
}

function Start-DedicatedServer([int]$Port, [string]$LogPath) {
    # Arranca opencode serve en background
    $ocCmd = (Get-Command opencode.cmd -ErrorAction SilentlyContinue).Source
    if (-not $ocCmd) { $ocCmd = 'opencode.cmd' }
    $proc = Start-Process -FilePath $ocCmd -ArgumentList @('serve','--port',$Port.ToString(),'--hostname','127.0.0.1') -RedirectStandardOutput $LogPath -RedirectStandardError "$LogPath.err" -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 5
    # Verificar que el puerto responde
    $retries = 0
    $maxRetries = 12
    while ($retries -lt $maxRetries) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect('127.0.0.1', $Port)
            $tcp.Close()
            Write-Host "  [SERVER] Servidor dedicado arrancado en puerto $Port (PID $($proc.Id))" -ForegroundColor Green
            return $proc
        } catch {
            Start-Sleep -Seconds 2
            $retries++
        }
    }
    throw "No se pudo arrancar el servidor dedicado en puerto $Port tras $($maxRetries * 2)s"
}

function Stop-DedicatedServer($Proc) {
    if ($Proc -and -not $Proc.HasExited) {
        try {
            $Proc | Stop-Process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            Write-Host "  [SERVER] Servidor dedicado parado" -ForegroundColor Yellow
        } catch {
            Write-Warning "No se pudo parar el servidor: $_"
        }
    }
}

function Get-SessionMetrics([string]$SessionId) {
    try {
        $json = opencode db "SELECT tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, cost, model, title, time_created, time_updated FROM session WHERE id = '$SessionId'" --format json 2>&1 | Out-String
        $rows = $json | ConvertFrom-Json
        if ($rows -and $rows.Count -gt 0) { return $rows[0] }
    } catch {
        Write-Warning "No se pudieron leer metricas de la BD para sesion $SessionId : $_"
    }
    return $null
}

function Parse-ToolCallsFromJsonl([string]$JsonlPath) {
    $toolCalls = @()
    $assistantMsgs = 0
    $errors = @()
    if (-not (Test-Path $JsonlPath)) { return @{ toolCalls = $toolCalls; assistantMessages = 0; errors = $errors } }
    Get-Content $JsonlPath | ForEach-Object {
        if ([string]::IsNullOrWhiteSpace($_)) { return }
        try { $ev = $_ | ConvertFrom-Json } catch { return }
        if ($ev.type -eq 'tool_use' -and $ev.part -and $ev.part.tool) {
            $toolName = $ev.part.tool
            $server = 'native'
            if ($toolName -match '^(semble)_') { $server = 'semble' }
            elseif ($toolName -match '^(repomix)_') { $server = 'repomix' }
            elseif ($toolName -match '^(serena)_') { $server = 'serena' }
            elseif ($toolName -match '^klia') { $server = 'klia-token-optimizer' }
            elseif ($toolName -match '^(ctx_)') { $server = 'context-mode' }
            $toolCalls += [PSCustomObject]@{ tool = $toolName; server = $server; args = $ev.part.args; time = $ev.timestamp }
        }
        if ($ev.type -eq 'step_start') { $assistantMsgs++ }
        if ($ev.type -eq 'error' -or $ev.type -eq 'tool.error') {
            $errMsg = if ($ev.message) { $ev.message } elseif ($ev.part -and $ev.part.error) { $ev.part.error } else { 'error desconocido' }
            $errors += $errMsg
        }
    }
    return @{ toolCalls = $toolCalls; assistantMessages = $assistantMsgs; errors = $errors }
}

function Extract-SessionId([string]$JsonlPath) {
    if (-not (Test-Path $JsonlPath)) { return $null }
    $firstLines = Get-Content $JsonlPath -TotalCount 20
    foreach ($line in $firstLines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        try {
            $ev = $line | ConvertFrom-Json
            if ($ev.sessionID) { return $ev.sessionID }
            if ($ev.session) { return $ev.session }
            if ($ev.sessionId) { return $ev.sessionId }
        } catch {}
    }
    return $null
}

function Extract-Response([string]$JsonlPath) {
    $lastAssistantText = ''
    if (-not (Test-Path $JsonlPath)) { return $lastAssistantText }
    Get-Content $JsonlPath | ForEach-Object {
        if ([string]::IsNullOrWhiteSpace($_)) { return }
        try { $ev = $_ | ConvertFrom-Json } catch { return }
        if ($ev.type -eq 'text' -and $ev.part -and $ev.part.text) {
            $lastAssistantText = $ev.part.text
        } elseif ($ev.type -eq 'assistant.message' -and $ev.text) {
            $lastAssistantText = $ev.text
        }
    }
    return $lastAssistantText
}

# --- Ejecucion ---
$modesToRun = if ($Mode -eq 'both') { @('baseline','mcp') } else { @($Mode) }
$totalRuns = $selectedArr.Count * $modesToRun.Count * $Repetitions
$currentRun = 0
$failures = @()

Write-Host "`n=== BENCHMARK MCP vs BASELINE (SAFE MODE) ===" -ForegroundColor White
Write-Host "Consultas: $($selectedArr.Count) | Modos: $($modesToRun -join ', ') | Repeticiones: $Repetitions | Total: $totalRuns" -ForegroundColor White
Write-Host "Modelo: $model" -ForegroundColor White
Write-Host "Proyecto: $root" -ForegroundColor White
Write-Host "Servidor dedicado: puerto $ServerPort" -ForegroundColor White
Write-Host ""

# Backup inicial de la config de opencode
$configBackup = Backup-Config -Path $opencodeConfigPath
Write-Host "[BACKUP] Config original respaldada: $configBackup`n" -ForegroundColor Cyan

$dedicatedServer = $null
try {
    foreach ($mode in $modesToRun) {
        Write-Host "`n=== MODO: $mode ===" -ForegroundColor Magenta

        # 1. Parar servidor dedicado si estaba activo
        if ($dedicatedServer) {
            Stop-DedicatedServer -Proc $dedicatedServer
            $dedicatedServer = $null
            Start-Sleep -Seconds 2
        }

        # 2. Aplicar config del modo
        Set-ModeConfig -Mode $mode -ConfigPath $opencodeConfigPath -BaselineSrc $baselineConfig -McpSrc $mcpConfig

        # 3. Arrancar servidor dedicado (lee la config nueva)
        $serverLog = Join-Path $logsDir "server-$mode.log"
        $dedicatedServer = Start-DedicatedServer -Port $ServerPort -LogPath $serverLog

        # 4. Verificar config del modo (listar MCP servers)
        Write-Host "  [VERIFY] MCP servers:" -ForegroundColor Cyan
        $mcpList = opencode mcp list 2>&1 | Out-String
        $mcpList -split "`n" | Where-Object { $_ -match 'enabled|disabled' } | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }

        # 5. Ejecutar consultas
        foreach ($query in $selectedArr) {
            Write-Host "`n  --- Consulta $($query.id): $($query.category) ---" -ForegroundColor Cyan
            Write-Host "      Prompt: $($query.prompt.Substring(0,[Math]::Min(80,$query.prompt.Length)))..."

            for ($r = 1; $r -le $Repetitions; $r++) {
                $currentRun++
                $runId = "run-$r"
                $outDir = Join-Path $resultsDir "$mode\$($query.id)\$runId"
                $metricsFile = Join-Path $outDir 'metrics.json'
                $rawFile = Join-Path $outDir 'raw.jsonl'
                $responseFile = Join-Path $outDir 'response.txt'
                $sessionFile = Join-Path $outDir 'session.json'

                # Idempotencia
                if (Test-Path $metricsFile) {
                    Write-Host "    [$currentRun/$totalRuns] $mode\$($query.id)\$runId  SKIP (ya existe)" -ForegroundColor DarkGray
                    continue
                }

                Write-Host "    [$currentRun/$totalRuns] $mode\$($query.id)\$runId  EJECUTANDO..." -ForegroundColor Yellow
                New-Item -ItemType Directory -Path $outDir -Force | Out-Null

                # Ejecutar opencode run --attach al servidor dedicado, --fork para sesion nueva
                $startTs = Get-Date
                $logFile = Join-Path $logsDir "$mode-$($query.id)-$runId.log"
                $ocCmd = (Get-Command opencode.cmd -ErrorAction SilentlyContinue).Source
                if (-not $ocCmd) { $ocCmd = 'opencode.cmd' }
                $argsList = @('run','--format','json','--model',$model,'--title',"[BENCH] $($query.id) $mode $runId",'--dir',$root,"--attach","http://127.0.0.1:$ServerPort",$query.prompt)
                $proc = Start-Process -FilePath $ocCmd -ArgumentList $argsList -RedirectStandardOutput $rawFile -RedirectStandardError $logFile -PassThru -WindowStyle Hidden
                $exited = $proc.WaitForExit(($QueryTimeout * 1000))
                $endTs = Get-Date
                $latencySec = [math]::Round(($endTs - $startTs).TotalSeconds, 2)

                if (-not $exited) {
                    try { $proc | Stop-Process -Force -ErrorAction SilentlyContinue } catch {}
                    Write-Warning "    TIMEOUT tras ${QueryTimeout}s en $mode\$($query.id)\$runId"
                    $failures += [PSCustomObject]@{ query_id = $query.id; mode = $mode; run = $runId; error = 'timeout' }
                    $failMetrics = [PSCustomObject]@{
                        query_id = $query.id; mode = $mode; run = $runId; category = $query.category
                        status = 'timeout'; error = "Timeout tras $QueryTimeout s"; latency_seconds = $QueryTimeout
                        started_at = $startTs.ToString('o'); ended_at = $endTs.ToString('o')
                    }
                    $failMetrics | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $metricsFile -Encoding UTF8
                    continue
                }

                $exitCode = $proc.ExitCode
                Write-Host "    Exit: $exitCode | Latencia: ${latencySec}s" -ForegroundColor DarkGray

                # Si hay error de conexion al servidor, reintentar una vez
                if ($exitCode -ne 0) {
                    $errContent = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
                    if ($errContent -match 'attach|connection|ECONNREFUSED|server') {
                        Write-Warning "    Error de conexion, reintentando sin --attach..."
                        $argsList2 = @('run','--format','json','--model',$model,'--title',"[BENCH] $($query.id) $mode $runId",'--dir',$root,$query.prompt)
                        $proc = Start-Process -FilePath $ocCmd -ArgumentList $argsList2 -RedirectStandardOutput $rawFile -RedirectStandardError $logFile -PassThru -WindowStyle Hidden
                        $exited = $proc.WaitForExit(($QueryTimeout * 1000))
                        $endTs = Get-Date
                        $latencySec = [math]::Round(($endTs - $startTs).TotalSeconds, 2)
                        $exitCode = $proc.ExitCode
                    }
                }

                # Extraer sessionId y metricas
                $sessionId = Extract-SessionId -JsonlPath $rawFile
                $sessMetrics = $null
                if ($sessionId) {
                    Start-Sleep -Milliseconds 800
                    $sessMetrics = Get-SessionMetrics -SessionId $sessionId
                }

                $parsed = Parse-ToolCallsFromJsonl -JsonlPath $rawFile
                $responseText = Extract-Response -JsonlPath $rawFile
                $responseText | Out-File -LiteralPath $responseFile -Encoding UTF8
                if ($sessMetrics) {
                    $sessMetrics | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $sessionFile -Encoding UTF8
                }

                # Construir metrics.json
                $tokensInput = if ($sessMetrics) { [int]$sessMetrics.tokens_input } else { 0 }
                $tokensOutput = if ($sessMetrics) { [int]$sessMetrics.tokens_output } else { 0 }
                $tokensReasoning = if ($sessMetrics) { [int]$sessMetrics.tokens_reasoning } else { 0 }
                $tokensCacheRead = if ($sessMetrics) { [int]$sessMetrics.tokens_cache_read } else { 0 }
                $tokensCacheWrite = if ($sessMetrics) { [int]$sessMetrics.tokens_cache_write } else { 0 }
                $costUsd = if ($sessMetrics) { [math]::Round([double]$sessMetrics.cost, 6) } else { 0 }
                $totalTokens = [int]$tokensInput + [int]$tokensOutput + [int]$tokensReasoning

                $toolsByServer = @{}
                $parsed.toolCalls | ForEach-Object {
                    $s = if ($_.server) { $_.server } else { 'unknown' }
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
                    status = if ($exitCode -eq 0 -and $parsed.errors.Count -eq 0) { 'success' } elseif ($exitCode -eq 0) { 'success_with_errors' } else { 'failed' }
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
                    started_at = $startTs.ToString('o')
                    ended_at = $endTs.ToString('o')
                }

                $metrics | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $metricsFile -Encoding UTF8
                Write-Host "    Tokens: in=$tokensInput out=$tokensOutput reason=$tokensReasoning total=$totalTokens | Cost: `$$costUsd | Tools: $($parsed.toolCalls.Count)" -ForegroundColor Green

                # Verificacion post-run: si estamos en baseline y hay tools MCP, alertar
                if ($mode -eq 'baseline' -and $parsed.toolCalls.Count -gt 0) {
                    $mcpTools = $parsed.toolCalls | Where-Object { $_.server -ne 'native' }
                    if ($mcpTools) {
                        Write-Warning "    CONTAMINACION: baseline uso tools MCP: $(($mcpTools | ForEach-Object { $_.tool }) -join ', ')"
                    }
                }
            }
        }
    }
} finally {
    # Parar servidor dedicado
    if ($dedicatedServer) { Stop-DedicatedServer -Proc $dedicatedServer }
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
