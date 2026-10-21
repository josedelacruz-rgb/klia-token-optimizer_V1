#Requires -Version 5.1
<#
.SYNOPSIS
    Orquestador del benchmark MCP vs Baseline para KiloCode (CLI `kilo`).
.DESCRIPTION
    Ejecuta la bateria de consultas definida en queries.json en dos modos:
      - baseline: todos los MCP deshabilitados y plugins externos desactivados (--pure)
      - mcp:      todos los MCP habilitados y plugins externos activos
    Para cada consulta captura:
      - Tokens de entrada, salida, razonamiento, cache (BD SQLite de Kilo: `kilo db`)
      - Coste en USD (BD de Kilo)
      - Latencia total (medida por el script)
      - Llamadas a herramientas y servidores MCP (stream JSON de `kilo run --format json`)
      - Respuesta final y errores
    Los resultados se guardan en results/<mode>/<query_id>/run-<n>/{session.json,metrics.json,response.txt,raw.jsonl}

    AISLAMIENTO (sin tocar la config global del usuario):
      - Se resuelve la configuracion efectiva con `kilo debug config` (global + proyecto).
      - Para cada modo se genera un override JSON en logs/overrides/ y se inyecta con
        la variable de entorno KILO_CONFIG, que Kilo fusiona con el resto de fuentes.
      - En modo baseline ademas se pasa `--pure` para que no carguen los plugins
        externos de ~/.config/kilo/plugin (klia-router-inject, klia-auto-record).
      - La config global (kilo.jsonc) NO se modifica: no hay backup/restore que ejecutar.
    El script es idempotente: si ya existe un resultado para (query, mode, run), lo salta.
.PARAMETER Mode
    baseline | mcp | both (default: both)
.PARAMETER Repetitions
    Numero de repeticiones por consulta (default: 1)
.PARAMETER Queries
    Lista de IDs de consultas a ejecutar (default: todas)
.PARAMETER Pilot
    Switch para modo pilot (2 consultas de prueba, 1 repeticion)
.PARAMETER QueryTimeout
    Timeout por consulta en segundos (default: 300)
.PARAMETER Model
    Modelo en formato provider/model; sobreescribe el del fichero de configuracion
.PARAMETER Config
    Ruta al fichero de configuracion (default: benchmark-mcp.config.json)
.PARAMETER Force
    Reejecuta aunque ya exista metrics.json (sobrescribe resultados)
.PARAMETER DryRun
    Muestra el plan (consultas, modos, modelo, comandos) sin ejecutar nada
.PARAMETER MaxMinutes
    Presupuesto maximo de duracion de toda la bateria en minutos (default: 10).
    Es un limite duro: el script planifica consultas por pares (baseline+mcp),
    las prioriza por sensibilidad al MCP y se detiene al agotar el tiempo.
.PARAMETER Label
    Etiqueta de la bateria. Los resultados se guardan en <results_dir>/<label> y las
    metricas quedan separadas de otras fases (p.ej. baseline01, optimizer01).
.PARAMETER NoWorkspace
    No genera el workspace neutral: las ejecuciones se hacen en project_dir tal cual
    (el proyecto puede incluir AGENTS.md con instrucciones de optimizadores).
.PARAMETER WorkspaceDir
    Ruta del workspace neutral (default: %TEMP%\klia-benchmark-workspace).
.PARAMETER NoSandbox
    Desactiva el aislamiento de entorno de la fase baseline (HOME/config aislados y
    PATH sin binarios de optimizadores). Solo para depuracion.
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

    [int]$QueryTimeout = 300,

    [double]$MaxMinutes = 10,

    [string]$Model = $null,

    [string]$Config = $null,

    [switch]$Force,

    [switch]$DryRun,

    [string]$Label = "default",

    [switch]$NoWorkspace,

    [string]$WorkspaceDir = $null,

    [switch]$NoSandbox
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path "$PSScriptRoot\..").Path
$benchDir = Join-Path $root "benchmark-mcp"
$queriesFile = Join-Path $benchDir "queries\queries.json"

# Librerias de apoyo: aislamiento de entorno y workspace neutral.
. (Join-Path $benchDir "lib\isolation.ps1")
. (Join-Path $benchDir "lib\workspace.ps1")

# --- Cargar configuracion ---
$configPath = if ($Config) { $Config } else { Join-Path $benchDir "benchmark-mcp.config.json" }
$cfg = $null
if (Test-Path $configPath) {
    $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
}

# --- Defaults de aislamiento y workspace ---
$useWorkspace = $true
$workspaceDir = Join-Path $env:TEMP "klia-benchmark-workspace"
$sandboxDir = Join-Path $benchDir "sandbox"
$blockedDirs = @($script:DefaultBlockedDirs)
$blockedBinaries = @($script:DefaultBlockedBinaries)

if ($cfg) {
    $projectDir = if ($cfg.project_dir) { $cfg.project_dir } else { $root }
    $benchModel = if ($cfg.model) { $cfg.model } else { "kilo/kilo-auto/free" }
    $resultsBaseDir = if ($cfg.results_dir) { Join-Path $root ($cfg.results_dir -replace '/','\') } else { Join-Path $benchDir "results" }
    $logsDir = if ($cfg.logs_dir) { Join-Path $root ($cfg.logs_dir -replace '/','\') } else { Join-Path $benchDir "logs" }
    $reportsDir = if ($cfg.reports_dir) { Join-Path $root ($cfg.reports_dir -replace '/','\') } else { Join-Path $benchDir "reports" }
    $baselineTemplate = if ($cfg.baseline_template) { Join-Path $root ($cfg.baseline_template -replace '/','\') } else { Join-Path $benchDir "configs\kilo.baseline.json" }
    $mcpTemplate = if ($cfg.mcp_template) { Join-Path $root ($cfg.mcp_template -replace '/','\') } else { Join-Path $benchDir "configs\kilo.mcp.json" }
    $autoApprove = if ($null -ne $cfg.auto_approve) { [bool]$cfg.auto_approve } else { $true }
    $kiloConfigPath = if ($cfg.kilo_config_path) { $cfg.kilo_config_path } else { Join-Path $env:USERPROFILE ".config\kilo\kilo.jsonc" }
    $budgetMinutes = if ($null -ne $cfg.max_minutes) { [double]$cfg.max_minutes } else { 10 }
    $estBaseline = 30
    $estMcp = 75
    if ($cfg.estimate_seconds) {
        if ($cfg.estimate_seconds.baseline) { $estBaseline = [double]$cfg.estimate_seconds.baseline }
        if ($cfg.estimate_seconds.mcp) { $estMcp = [double]$cfg.estimate_seconds.mcp }
    }
    if ($null -ne $cfg.use_workspace) { $useWorkspace = [bool]$cfg.use_workspace }
    if ($cfg.workspace_dir) { $workspaceDir = $cfg.workspace_dir }
    if ($cfg.sandbox_dir) { $sandboxDir = $cfg.sandbox_dir }
    if ($cfg.isolation) {
        if ($cfg.isolation.blocked_path_dirs) { $blockedDirs = @($cfg.isolation.blocked_path_dirs) }
        if ($cfg.isolation.blocked_binaries) { $blockedBinaries = @($cfg.isolation.blocked_binaries) }
    }
    if ($Model) { $benchModel = $Model }
    if ($MaxMinutes -gt 0) { $budgetMinutes = $MaxMinutes }
} else {
    # Defaults
    $projectDir = $root
    $benchModel = "kilo/kilo-auto/free"
    $resultsBaseDir = Join-Path $benchDir "results"
    $logsDir = Join-Path $benchDir "logs"
    $reportsDir = Join-Path $benchDir "reports"
    $baselineTemplate = Join-Path $benchDir "configs\kilo.baseline.json"
    $mcpTemplate = Join-Path $benchDir "configs\kilo.mcp.json"
    $autoApprove = $true
    $kiloConfigPath = Join-Path $env:USERPROFILE ".config\kilo\kilo.jsonc"
    $budgetMinutes = 10
    $estBaseline = 30
    $estMcp = 75
    if ($Model) { $benchModel = $Model }
    if ($MaxMinutes -gt 0) { $budgetMinutes = $MaxMinutes }
}

# El workspace neutral (sin AGENTS.md del repo) es el proyecto de trabajo por defecto.
if ($NoWorkspace) { $useWorkspace = $false }
if ($WorkspaceDir) { $workspaceDir = $WorkspaceDir }
# Rutas absolutas: el proceso hijo se ejecuta en el workspace, por lo que ninguna
# ruta relativa del entorno debe depender del directorio de trabajo.
if (-not [System.IO.Path]::IsPathRooted($sandboxDir)) { $sandboxDir = Join-Path $root $sandboxDir }
if (-not [System.IO.Path]::IsPathRooted($workspaceDir)) { $workspaceDir = Join-Path $root $workspaceDir }
$sandboxDir = [System.IO.Path]::GetFullPath($sandboxDir)
$workspaceDir = [System.IO.Path]::GetFullPath($workspaceDir)
# Resultados separados por etiqueta: no se mezclan fases distintas.
$resultsDir = if ($Label -and $Label -ne "default") { Join-Path $resultsBaseDir $Label } else { $resultsBaseDir }

# --- Cargar bateria de consultas ---
if (-not (Test-Path $queriesFile)) { throw "No se encuentra el fichero de consultas: $queriesFile" }
$queriesData = Get-Content $queriesFile -Raw | ConvertFrom-Json
$allQueries = $queriesData.queries

# Normalizar la seleccion: admite "Q01,Q02" (un unico string) o un array de ids.
$queryIds = @()
foreach ($q in @($Queries)) {
    if ($null -eq $q) { continue }
    foreach ($part in ([string]$q -split ',')) {
        $t = $part.Trim()
        if ($t) { $queryIds += $t }
    }
}
$Queries = $queryIds

# Filtrar consultas
if ($Pilot) {
    $pilotIds = $queriesData.metadata.pilot_queries
    if (-not $pilotIds) { $pilotIds = @($allQueries[0].id, $allQueries[4].id) }
    $selected = $allQueries | Where-Object { $pilotIds -contains $_.id }
    $Repetitions = 1
    Write-Host "[PILOT] Consultas: $($pilotIds -join ', ') | 1 repeticion" -ForegroundColor Cyan
} elseif ($queryIds.Count -gt 0) {
    $selected = $allQueries | Where-Object { $queryIds -contains $_.id }
} else {
    $selected = $allQueries
}

if (-not $selected) { throw "No se selecciono ninguna consulta" }

# Prioridad: con presupuesto de tiempo limitado se ejecutan primero las consultas
# que mas rinden por segundo (uso de MCP apreciable y ejecucion ligera), de modo
# que lo que quepa en el presupuesto es la muestra mas informativa.
#   1) busqueda y terminal (MCP apreciable, rapidas)
#   2) multi-herramienta / repomix (MCP muy apreciable, lentas)
#   3) conceptuales sin herramientas (no diferencian, solo consumen tiempo)
$priorityOrder = @('Q03', 'Q04', 'Q12', 'Q07', 'Q05', 'Q06', 'Q08', 'Q01', 'Q02', 'Q09', 'Q10', 'Q11')
$rankOf = @{}
for ($i = 0; $i -lt $priorityOrder.Count; $i++) { $rankOf[$priorityOrder[$i]] = $i }
$selected = @($selected | Sort-Object -Property `
    @{Expression = { if ($rankOf.ContainsKey([string]$_.id)) { $rankOf[[string]$_.id] } else { 99 } }}, `
    @{Expression = { $_.id } })

# --- Helpers ---

function Write-Utf8NoBom {
    # Escribe texto en UTF-8 sin BOM (el parser JSON de Kilo/Node no tolera BOM).
    param([string]$Path, [string]$Content)
    $dir = Split-Path $Path -Parent
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function ConvertTo-JsonObject {
    # Convierte un diccionario ordenado en PSCustomObject (JSON object, no array).
    param([System.Collections.IDictionary]$Map)
    $obj = [PSCustomObject]@{}
    foreach ($k in @($Map.Keys)) {
        $obj | Add-Member -NotePropertyName $k -NotePropertyValue $Map[$k] -Force
    }
    return $obj
}

function Resolve-KiloCommand {
    # Localiza el ejecutable de KiloCode. Devuelve un hashtable con:
    #   Exe  -> ruta del ejecutable (.cmd / .exe)
    #   Args -> argumentos previos (para .ps1 hay que lanzar powershell)
    #   Kind -> 'cmd' | 'exe' | 'ps1'
    $found = $null
    foreach ($name in @('kilo.cmd', 'kilocode.cmd')) {
        $c = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($c) { $found = $c.Source; break }
    }
    if (-not $found) {
        $candidates = @(
            (Join-Path $env:APPDATA "npm\kilo.cmd"),
            (Join-Path $env:APPDATA "npm\kilocode.cmd"),
            (Join-Path $env:ProgramFiles "nodejs\kilo.cmd")
        )
        foreach ($c in $candidates) { if (Test-Path $c) { $found = $c; break } }
    }
    if (-not $found) {
        $c = Get-Command kilo -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($c) { $found = $c.Source }
    }
    if (-not $found) { throw "No se encuentra el ejecutable de KiloCode ('kilo'). Instala @kilocode/cli o anadelo al PATH." }

    if ($found -like "*.ps1") {
        return @{ Exe = "powershell.exe"; Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $found); Kind = "ps1"; Source = $found }
    }
    if ($found -like "*.cmd" -or $found -like "*.bat") {
        return @{ Exe = $found; Args = @(); Kind = "cmd"; Source = $found }
    }
    return @{ Exe = $found; Args = @(); Kind = "exe"; Source = $found }
}

function Invoke-Kilo {
    # Ejecuta Kilo y devuelve stdout como texto. $KiloArgs son los argumentos previos.
    param([string[]]$KiloArgs, [string[]]$CliArgs, [string]$WorkingDirectory)
    $exe = $Kilo.Exe
    $full = @($Kilo.Args + $KiloArgs)
    $psi = $null
    if ($WorkingDirectory) {
        Push-Location -LiteralPath $WorkingDirectory
    }
    try {
        $out = & $exe @full 2>$null | Out-String
    } finally {
        if ($WorkingDirectory) { Pop-Location }
    }
    return $out
}

function Get-ResolvedKiloConfig {
    # Config efectiva de Kilo (global + proyecto), tal y como la ve el CLI.
    $wd = if ($runDir) { $runDir } else { $projectDir }
    $raw = Invoke-Kilo -KiloArgs @("debug", "config") -WorkingDirectory $wd
    if (-not $raw) { return $null }
    $idx = $raw.IndexOf('{')
    if ($idx -lt 0) { return $null }
    try {
        return $raw.Substring($idx) | ConvertFrom-Json
    } catch {
        Write-Warning "No se pudo parsear 'kilo debug config': $_"
        return $null
    }
}

function Resolve-TemplateEntry {
    # Resuelve las rutas relativas del template contra la raiz del repo: el workspace de
    # ejecucion (neutro) no contiene el codigo del proyecto.
    param($Entry)
    if (-not $Entry) { return $Entry }
    $cmd = $Entry.command
    if ($cmd -is [System.Array] -and $cmd.Count -ge 2) {
        $script = [string]$cmd[1]
        if ($script -match '^\.{1,2}[\\/]' -or $script -match '^dist[\\/]') {
            $abs = Join-Path $root ($script -replace '/','\')
            $rest = @()
            if ($cmd.Count -gt 2) { $rest = @($cmd[2..($cmd.Count - 1)]) }
            $cmd = @([string]$cmd[0], $abs) + $rest
            $Entry.command = $cmd
        }
    }
    return $Entry
}

function New-ModeOverride {
    # Genera el override de configuracion para un modo.
    #   baseline -> todos los servidores MCP resueltos quedan deshabilitados
    #   mcp      -> todos los servidores MCP resueltos quedan habilitados
    # Los servidores que solo existen en el template se anaden.
    param(
        [ValidateSet("baseline","mcp")][string]$Mode,
        [string]$TemplatePath,
        [string]$OutPath
    )
    $resolved = Get-ResolvedKiloConfig
    $servers = [ordered]@{}

    if ($resolved -and $resolved.mcp) {
        foreach ($p in $resolved.mcp.PSObject.Properties) {
            $entry = [ordered]@{}
            foreach ($ep in $p.Value.PSObject.Properties) {
                if ($ep.Name -eq 'enabled' -or $ep.Name -eq 'disabled') { continue }
                $entry[$ep.Name] = $ep.Value
            }
            $servers[$p.Name] = (Resolve-TemplateEntry (ConvertTo-JsonObject $entry))
        }
    }

    # Template: servidores que no existan en la config resuelta.
    if (Test-Path $TemplatePath) {
        $tpl = Get-Content $TemplatePath -Raw | ConvertFrom-Json
        if ($tpl -and $tpl.mcp) {
            foreach ($p in $tpl.mcp.PSObject.Properties) {
                if ($servers.Contains($p.Name)) { continue }
                $entry = [ordered]@{}
                foreach ($ep in $p.Value.PSObject.Properties) {
                    if ($ep.Name -eq 'enabled' -or $ep.Name -eq 'disabled') { continue }
                    $entry[$ep.Name] = $ep.Value
                }
                $servers[$p.Name] = (Resolve-TemplateEntry (ConvertTo-JsonObject $entry))
            }
        }
    }

    $enabled = ($Mode -eq "mcp")
    foreach ($name in @($servers.Keys)) {
        $entry = $servers[$name]
        $entry | Add-Member -NotePropertyName 'enabled' -NotePropertyValue $enabled -Force
        if ($entry.PSObject.Properties.Name -contains 'disabled') {
            $entry.PSObject.Properties.Remove('disabled')
        }
    }

    $doc = [ordered]@{
        '$schema' = 'https://app.kilo.ai/config.json'
        'mcp' = (ConvertTo-JsonObject $servers)
    }
    Write-Utf8NoBom -Path $OutPath -Content (($doc | ConvertTo-Json -Depth 12))
    return $OutPath
}

function Get-SessionMetrics {
    param([string]$SessionId)
    # Consulta la BD de Kilo para obtener tokens y coste reales de la sesion.
    if (-not $SessionId) { return $null }
    $sql = "SELECT tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, cost, model, title, time_created, time_updated FROM session WHERE id = '$SessionId'"
    try {
        $json = Invoke-Kilo -KiloArgs @("db", $sql, "--format", "json")
        $rows = $json | ConvertFrom-Json
        if ($rows -and $rows.Count -gt 0) { return $rows[0] }
    } catch {
        Write-Warning "No se pudieron leer metricas de la BD para sesion $SessionId : $_"
    }
    return $null
}

function Get-TokensFromJsonl {
    param([string]$JsonlPath)
    # Tokens acumulados de todos los step_finish del JSONL (fallback si la BD falla).
    $tokensInput = 0
    $tokensOutput = 0
    $tokensReasoning = 0
    $tokensCacheRead = 0
    $tokensCacheWrite = 0
    if (-not (Test-Path $JsonlPath)) { return @{ tokens_input = $tokensInput; tokens_output = $tokensOutput; tokens_reasoning = $tokensReasoning; tokens_cache_read = $tokensCacheRead; tokens_cache_write = $tokensCacheWrite } }
    Get-Content $JsonlPath | ForEach-Object {
        if ([string]::IsNullOrWhiteSpace($_)) { return }
        try {
            $ev = $_ | ConvertFrom-Json
        } catch { return }
        if ($ev.type -eq "step_finish" -and $ev.part -and $ev.part.tokens) {
            $t = $ev.part.tokens
            $tokensInput += [int]($t.input)
            $tokensOutput += [int]($t.output)
            $tokensReasoning += [int]($t.reasoning)
            # Kilo/OpenCode exponen la cache como {cache:{read,write}} o {cache_read,cache_write}.
            if ($null -ne $t.cache) {
                $tokensCacheRead += [int]($t.cache.read)
                $tokensCacheWrite += [int]($t.cache.write)
            }
            $tokensCacheRead += [int]($t.cache_read)
            $tokensCacheWrite += [int]($t.cache_write)
        }
    }
    return @{ tokens_input = $tokensInput; tokens_output = $tokensOutput; tokens_reasoning = $tokensReasoning; tokens_cache_read = $tokensCacheRead; tokens_cache_write = $tokensCacheWrite }
}

function Parse-ToolCallsFromJsonl {
    param([string]$JsonlPath)
    # Extrae llamadas a herramientas del stream JSON de `kilo run --format json`.
    $toolCalls = @()
    $assistantMessages = 0
    $errors = @()
    if (-not (Test-Path $JsonlPath)) { return @{ toolCalls = $toolCalls; assistantMessages = 0; errors = $errors } }
    Get-Content $JsonlPath | ForEach-Object {
        if ([string]::IsNullOrWhiteSpace($_)) { return }
        try {
            $ev = $_ | ConvertFrom-Json
        } catch { return }
        # Eventos con tool calls: type = "tool_use"
        switch ($ev.type) {
            "tool_use" {
                $toolName = $ev.part.tool
                if (-not $toolName) { $toolName = $ev.tool }
                if (-not $toolName -and $ev.name) { $toolName = $ev.name }
                $server = $null
                # Deteccion de server: prefijo mcp_<server>_<tool> o <server>_<tool>
                if ($toolName -match '^mcp_([a-z][a-z0-9-]*)_(.+)$') {
                    $server = $Matches[1]
                    $toolName = $Matches[2]
                } elseif ($toolName -match '^([a-z][a-z0-9-]+)_(.+)$') {
                    $server = $Matches[1]
                    $toolName = $Matches[2]
                } elseif ($ev.server) {
                    $server = $ev.server
                }
                # Detectar error en el estado de la herramienta
                $toolStatus = $null
                if ($ev.part.state) { $toolStatus = $ev.part.state.status }
                if ($toolStatus -eq "error") {
                    $errors += "tool.error: $toolName"
                }
                $toolCalls += [PSCustomObject]@{
                    tool = $toolName
                    server = $server
                    args = if ($ev.part.state) { $ev.part.state.input } else { $ev.args }
                    status = $toolStatus
                    time = $ev.timestamp
                }
            }
            "text" { $assistantMessages++ }
            "error" {
                $msg = $ev.error.data.message
                if (-not $msg) { $msg = $ev.error.message }
                if (-not $msg) { $msg = "error desconocido" }
                $errors += "run.error: $msg"
            }
        }
        # Errores generales: step_finish con reason = error
        if ($ev.type -eq "step_finish" -and $ev.part.reason -eq "error") {
            $errors += "step.error: $($ev.part.error)"
        }
        # Formato alternativo: eventos con role assistant + tool_calls
        if ($ev.role -eq "assistant" -and $ev.tool_calls) {
            $assistantMessages++
            foreach ($tc in $ev.tool_calls) {
                $toolCalls += [PSCustomObject]@{
                    tool = $tc.function.name
                    server = $null
                    args = $tc.function.arguments
                    status = $null
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
        # Formato Kilo/OpenCode V2: type = "text", texto en part.text
        if ($ev.type -eq "text" -and $ev.part -and $ev.part.text) {
            $lastAssistantText = $ev.part.text
        } elseif ($ev.type -eq "text" -and $ev.text) {
            $lastAssistantText = $ev.text
        } elseif ($ev.type -eq "assistant.message" -and $ev.text) {
            $lastAssistantText = $ev.text
        } elseif ($ev.type -eq "message" -and $ev.role -eq "assistant" -and $ev.content) {
            $lastAssistantText = if ($ev.content -is [string]) { $ev.content } else { ($ev.content | ConvertTo-Json -Depth 5) }
        } elseif ($ev.role -eq "assistant" -and $ev.content) {
            $lastAssistantText = if ($ev.content -is [string]) { $ev.content } else { ($ev.content | ConvertTo-Json -Depth 5) }
        }
    }
    return $lastAssistantText
}

# --- Resolver CLI de Kilo ---
$Kilo = Resolve-KiloCommand
Write-Host "[KILO] Ejecutable: $($Kilo.Source) ($($Kilo.Kind))" -ForegroundColor Cyan

# --- Ejecucion ---
$modesToRun = if ($Mode -eq "both") { @("baseline","mcp") } else { @($Mode) }
$selectedArr = @($selected)
$totalRuns = $selectedArr.Count * $modesToRun.Count * $Repetitions
$currentRun = 0
$failures = @()

# Presupuesto de tiempo: limite duro de la bateria completa.
$batteryStart = Get-Date
$deadline = $batteryStart.AddMinutes($budgetMinutes)
$estSec = @{ baseline = [double]$estBaseline; mcp = [double]$estMcp }
$observed = @{ baseline = @(); mcp = @() }
$executedQueries = @()
$skippedQueries = @()

function Get-IterationEstimate {
    # Tiempo estimado de una iteracion completa (una consulta en TODOS los modos de la fase).
    $sum = 0
    foreach ($m in $modesToRun) { $sum += $estSec[$m] }
    return $sum
}

# --- Aislamiento de entorno (fase baseline) ---
# Crea un HOME y una config de Kilo aislados: sin plugins globales, sin reglas globales,
# sin servidores MCP. El entorno real se restaura al terminar.
$envSnapshot = New-EnvSnapshot
$sandbox = $null
if (($modesToRun -contains "baseline") -and (-not $NoSandbox)) {
    $sandbox = New-BenchmarkSandbox -Root $sandboxDir
    Write-Host "[ISOLATION] Sandbox de baseline: $($sandbox.Root)" -ForegroundColor Cyan
    Write-Host "[ISOLATION]   HOME aislado:      $($sandbox.Home)" -ForegroundColor DarkCyan
    Write-Host "[ISOLATION]   Config aislada:    $($sandbox.ConfigHome)" -ForegroundColor DarkCyan
    Write-Host "[ISOLATION]   PATH sin:          $($blockedDirs -join ', ')" -ForegroundColor DarkCyan
    Write-Host "[ISOLATION]   Binarios bloqueados: $($blockedBinaries -join ', ')" -ForegroundColor DarkCyan
}

Write-Host "`n=== BENCHMARK MCP vs BASELINE (KiloCode) ===" -ForegroundColor White
Write-Host "Etiqueta: $Label | Consultas: $($selectedArr.Count) | Modos: $($modesToRun -join ', ') | Repeticiones: $Repetitions | Total: $totalRuns" -ForegroundColor White
Write-Host "Modelo: $benchModel" -ForegroundColor White
Write-Host "Presupuesto de tiempo: $budgetMinutes min (deadline $(($deadline).ToString('HH:mm:ss')))" -ForegroundColor Cyan
Write-Host "Estimacion por iteracion (todos los modos): $([math]::Round((Get-IterationEstimate)))s" -ForegroundColor DarkCyan
Write-Host "Config global (solo lectura): $kiloConfigPath`n" -ForegroundColor White

if ($DryRun) {
    foreach ($mode in $modesToRun) {
        $tpl = if ($mode -eq "baseline") { $baselineTemplate } else { $mcpTemplate }
        Write-Host "[PLAN] Modo '$mode' -> override con template $tpl" -ForegroundColor Yellow
        if ($mode -eq "baseline") {
            Write-Host "[PLAN]   + flag --pure (sin plugins externos)" -ForegroundColor Yellow
            if (-not $NoSandbox) { Write-Host "[PLAN]   + sandbox de HOME/config y PATH sin binarios de optimizadores" -ForegroundColor Yellow }
        }
    }
    $iterEst = Get-IterationEstimate
    $fits = [math]::Floor(($budgetMinutes * 60) / $iterEst)
    Write-Host "[PLAN] Orden priorizado: $(($selectedArr | ForEach-Object { $_.id }) -join ', ')" -ForegroundColor Yellow
    Write-Host "[PLAN] Iteraciones estimadas que caben en $budgetMinutes min: $fits (~$([math]::Round($iterEst))s por iteracion)" -ForegroundColor Yellow
    Write-Host "`n[DRY RUN] No se ejecuta nada." -ForegroundColor Green
    return
}

# Directorios de salida
if (-not (Test-Path $resultsDir)) { New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null }
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }
$overrideDir = Join-Path $logsDir "overrides"

# --- Workspace neutral ---
# El proyecto de trabajo no debe incluir el AGENTS.md del repo (empuja al modelo a usar
# los optimizadores) ni el README del producto: el baseline debe medir el entorno limpio.
$runDir = $projectDir
if ($useWorkspace) {
    $ws = New-BenchmarkWorkspace -SourceRoot $root -Dest $workspaceDir -Force
    $runDir = $ws.Path
}
Write-Host "[PROYECTO] Directorio de trabajo: $runDir" -ForegroundColor White

# --- Manifiesto: impide mezclar resultados de baterías distintas ---
# Si los resultados existentes no pertenecen a esta misma bateria (otro modelo o
# sesion anterior), se archivan en vez de mezclarse con los nuevos.
$manifestPath = Join-Path $resultsDir "manifest.json"
$resume = $false
if (Test-Path $manifestPath) {
    try {
        $prevManifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
        if ($prevManifest.model -eq $benchModel) {
            $ageMin = ((Get-Date) - ([datetime]$prevManifest.started_at)).TotalMinutes
            if ($ageMin -le 120) { $resume = $true }
        }
    } catch { }
}
if (-not $resume) {
    $stale = @(Get-ChildItem $resultsDir -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "manifest.json" })
    if ($stale.Count -gt 0) {
        $archiveDir = Join-Path (Split-Path $resultsBaseDir -Parent) "results-archive\$($batteryStart.ToString('yyyyMMdd-HHmmss'))"
        foreach ($f in $stale) {
            $rel = $f.FullName.Substring($resultsDir.Length).TrimStart('\')
            $dest = Join-Path $archiveDir $rel
            New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
            Move-Item -LiteralPath $f.FullName -Destination $dest -Force -ErrorAction SilentlyContinue
        }
        Write-Host "[ARCHIVE] Resultados de una bateria anterior archivados en: $archiveDir" -ForegroundColor Yellow
    }
}
$manifest = [PSCustomObject]@{
    model = $benchModel
    label = $Label
    started_at = $batteryStart.ToString("o")
    max_minutes = $budgetMinutes
    modes = @($modesToRun)
    queries = @($selectedArr | ForEach-Object { $_.id })
    repetitions = $Repetitions
    workspace = $runDir
    isolation = [PSCustomObject]@{
        sandbox = (-not $NoSandbox -and ($modesToRun -contains "baseline"))
        sandbox_root = if ($sandbox) { $sandbox.Root } else { $null }
        blocked_path_dirs = @($blockedDirs)
        blocked_binaries = @($blockedBinaries)
    }
}
Write-Utf8NoBom -Path $manifestPath -Content ($manifest | ConvertTo-Json -Depth 5)

# Generar los overrides por modo (una vez): el isolation no depende del estado global.
# Cada override se genera bajo el entorno del modo correspondiente (sandbox en baseline).
$overridePaths = @{}
foreach ($mode in $modesToRun) {
    $tpl = if ($mode -eq "baseline") { $baselineTemplate } else { $mcpTemplate }
    $ovr = Join-Path $overrideDir "kilo.$mode.json"
    Set-BenchmarkEnv -Mode $mode -Snapshot $envSnapshot -Sandbox $sandbox -BlockedDirs $blockedDirs -BlockedBinaries $blockedBinaries -NoSandbox:$NoSandbox | Out-Null
    try {
        New-ModeOverride -Mode $mode -TemplatePath $tpl -OutPath $ovr | Out-Null
    } finally {
        Restore-EnvSnapshot -Snapshot $envSnapshot
    }
    $overridePaths[$mode] = $ovr
    Write-Host "[CONFIG] Override '$mode' generado: $ovr" -ForegroundColor Green
}

$prevKiloConfig = $env:KILO_CONFIG
try {
    foreach ($query in $selectedArr) {
        # Control de presupuesto: solo se inicia una consulta si el tiempo restante
        # cubre la iteracion completa (todos los modos de esta fase).
        $remaining = ($deadline - (Get-Date)).TotalSeconds
        $iterEstimate = Get-IterationEstimate
        if ($remaining -lt [math]::Max(30, $iterEstimate * 0.9)) {
            Write-Host "`n--- Consulta $($query.id): OMITIDA (presupuesto agotado) ---" -ForegroundColor DarkYellow
            Write-Host "    Quedan $([math]::Round($remaining))s | se necesitan ~$([math]::Round($iterEstimate))s para la iteracion completa" -ForegroundColor DarkYellow
            # Se registran como omitidas la consulta actual y todas las siguientes:
            # el bucle se detiene aqui, asi que nunca se intentaran.
            $currentIndex = [array]::IndexOf($selectedArr, $query)
            if ($currentIndex -ge 0) {
                foreach ($q in @($selectedArr[$currentIndex..($selectedArr.Count - 1)])) { $skippedQueries += $q.id }
            } else {
                $skippedQueries += $query.id
            }
            $skippedQueries = @($skippedQueries | Select-Object -Unique)
            break
        }

        Write-Host "`n--- Consulta $($query.id): $($query.category) ---" -ForegroundColor Cyan
        Write-Host "    Prompt: $($query.prompt.Substring(0,[Math]::Min(80,$query.prompt.Length)))..."
        foreach ($mode in $modesToRun) {
            # Entorno de la fase: en baseline se aislan HOME/config y se bloquean los binarios
            # de optimizadores; en modo mcp se restaura el entorno real del usuario.
            $phaseIsolation = Set-BenchmarkEnv -Mode $mode -Snapshot $envSnapshot -Sandbox $sandbox -BlockedDirs $blockedDirs -BlockedBinaries $blockedBinaries -NoSandbox:$NoSandbox
            if ($phaseIsolation) {
                Write-Host "  [ENTORNO] $($mode): sandbox=$($phaseIsolation.sandbox) | binarios bloqueados=$($phaseIsolation.blocked_binaries -join ',')" -ForegroundColor DarkCyan
            }
            for ($r = 1; $r -le $Repetitions; $r++) {
                $currentRun++
                $runId = "run-$r"
                $outDir = Join-Path $resultsDir "$mode\$($query.id)\$runId"
                $metricsFile = Join-Path $outDir "metrics.json"
                $rawFile = Join-Path $outDir "raw.jsonl"
                $responseFile = Join-Path $outDir "response.txt"
                $sessionFile = Join-Path $outDir "session.json"

                # Idempotencia: si ya existe metrics.json, saltar
                if ((Test-Path $metricsFile) -and (-not $Force)) {
                    Write-Host "  [$currentRun/$totalRuns] $mode\$($query.id)\$runId  SKIP (ya existe)" -ForegroundColor DarkGray
                    continue
                }

                Write-Host "  [$currentRun/$totalRuns] $mode\$($query.id)\$runId  EJECUTANDO..." -ForegroundColor Yellow
                New-Item -ItemType Directory -Path $outDir -Force | Out-Null

                # Aislamiento: override de config por modo (KILO_CONFIG)
                $env:KILO_CONFIG = $overridePaths[$mode]

                # Ejecutar `kilo run --format json`
                $startTs = Get-Date
                $logFile = Join-Path $logsDir "$mode-$($query.id)-$runId.log"
                $argsList = @("run","--format","json")
                if ($mode -eq "baseline") { $argsList += "--pure" }
                if ($autoApprove) { $argsList += "--auto" }
                $argsList += @("--model",$benchModel,"--title","[BENCH] $($query.id) $mode $runId",$query.prompt)

                # Timeout de la ejecucion: nunca puede superar el presupuesto restante.
                $remainingNow = ($deadline - (Get-Date)).TotalSeconds
                $runTimeout = [int][math]::Floor([math]::Min($QueryTimeout, [math]::Max(25, $remainingNow - 10)))

                $proc = $null
                if ($Kilo.Kind -eq "ps1") {
                    $proc = Start-Process -FilePath $Kilo.Exe -ArgumentList (@($Kilo.Args + $argsList)) -WorkingDirectory $runDir -RedirectStandardOutput $rawFile -RedirectStandardError $logFile -PassThru -NoNewWindow
                } else {
                    $proc = Start-Process -FilePath $Kilo.Exe -ArgumentList $argsList -WorkingDirectory $runDir -RedirectStandardOutput $rawFile -RedirectStandardError $logFile -PassThru -NoNewWindow
                }
                $exited = $proc.WaitForExit(($runTimeout * 1000))
                $endTs = Get-Date
                $latencySec = [math]::Round(($endTs - $startTs).TotalSeconds, 2)

                if (-not $exited) {
                    try { $proc | Stop-Process -Force -ErrorAction SilentlyContinue } catch {}
                    Write-Warning "  TIMEOUT tras ${runTimeout}s en $mode\$($query.id)\$runId"
                    $failures += [PSCustomObject]@{
                        query_id = $query.id; mode = $mode; run = $runId; error = "timeout"
                    }
                    $failMetrics = [PSCustomObject]@{
                        query_id = $query.id
                        mode = $mode
                        run = $runId
                        category = $query.category
                        status = "timeout"
                        error = "Timeout tras $runTimeout s"
                        latency_seconds = $runTimeout
                        started_at = $startTs.ToString("o")
                        ended_at = $endTs.ToString("o")
                    }
                    Write-Utf8NoBom -Path $metricsFile -Content ($failMetrics | ConvertTo-Json -Depth 5)
                    $observed[$mode] += $runTimeout
                    continue
                }

                try { $proc.Refresh() } catch {}
                $exitCode = $null
                try { $exitCode = $proc.ExitCode } catch {}
                Write-Host "  Exit: $exitCode | Latencia: ${latencySec}s" -ForegroundColor DarkGray

                # Extraer sessionId del stream
                $sessionId = Extract-SessionId -JsonlPath $rawFile

                # Obtener metricas reales de la BD de Kilo (fallback a JSONL si falla)
                $sessMetrics = $null
                if ($sessionId) {
                    Start-Sleep -Milliseconds 800  # dar tiempo a que se escriba en BD
                    $sessMetrics = Get-SessionMetrics -SessionId $sessionId
                }
                $jsonlTokens = Get-TokensFromJsonl -JsonlPath $rawFile

                # Parsear tool calls del stream
                $parsed = Parse-ToolCallsFromJsonl -JsonlPath $rawFile
                $responseText = Extract-Response -JsonlPath $rawFile

                # Guardar respuesta
                Write-Utf8NoBom -Path $responseFile -Content $responseText

                # Guardar session.json
                if ($sessMetrics) {
                    Write-Utf8NoBom -Path $sessionFile -Content ($sessMetrics | ConvertTo-Json -Depth 5)
                }

                # Construir metrics.json consolidado (BD si disponible, sino JSONL)
                $tokensInput = if ($sessMetrics -and $sessMetrics.tokens_input) { $sessMetrics.tokens_input } else { $jsonlTokens.tokens_input }
                $tokensOutput = if ($sessMetrics -and $sessMetrics.tokens_output) { $sessMetrics.tokens_output } else { $jsonlTokens.tokens_output }
                $tokensReasoning = if ($sessMetrics -and $sessMetrics.tokens_reasoning) { $sessMetrics.tokens_reasoning } else { $jsonlTokens.tokens_reasoning }
                $tokensCacheRead = if ($sessMetrics -and $sessMetrics.tokens_cache_read) { $sessMetrics.tokens_cache_read } else { $jsonlTokens.tokens_cache_read }
                $tokensCacheWrite = if ($sessMetrics -and $sessMetrics.tokens_cache_write) { $sessMetrics.tokens_cache_write } else { $jsonlTokens.tokens_cache_write }
                $costUsd = if ($sessMetrics) { [math]::Round([double]$sessMetrics.cost, 6) } else { 0 }
                $totalTokens = [int]$tokensInput + [int]$tokensOutput + [int]$tokensReasoning

                # Status: success si hay respuesta y no hay errores criticos
                $hasResponse = ($responseText -and $responseText.Length -gt 0)
                $hasErrors = $parsed.errors.Count -gt 0
                $status = if ($hasResponse -and -not $hasErrors) { "success" } elseif ($hasResponse) { "success_with_errors" } else { "failed" }

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
                    model = $benchModel
                    session_id = $sessionId
                    status = $status
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

                Write-Utf8NoBom -Path $metricsFile -Content ($metrics | ConvertTo-Json -Depth 6)
                Write-Host "  Tokens: in=$tokensInput out=$tokensOutput reason=$tokensReasoning total=$totalTokens | Cost: `$$costUsd | Tools: $($parsed.toolCalls.Count)" -ForegroundColor Green
                if ($hasErrors) { Write-Host "  Errores: $($parsed.errors -join '; ')" -ForegroundColor Red }

                # Actualizar la estimacion con la latencia real observada.
                $observed[$mode] += $latencySec
                $estSec[$mode] = [math]::Max(15, ($observed[$mode] | Measure-Object -Average).Average)
                if ($executedQueries -notcontains $query.id) { $executedQueries += $query.id }
            }
            # Fin de la fase: se restaura el entorno original.
            Restore-EnvSnapshot -Snapshot $envSnapshot
        }
    }
} finally {
    # Restaurar el entorno (la config global nunca se toco).
    Restore-EnvSnapshot -Snapshot $envSnapshot
    if ($prevKiloConfig) { $env:KILO_CONFIG = $prevKiloConfig } else { Remove-Item Env:\KILO_CONFIG -ErrorAction SilentlyContinue }
}

# --- Resumen de presupuesto y cobertura ---
$batteryEnd = Get-Date
$elapsedSec = [math]::Round(($batteryEnd - $batteryStart).TotalSeconds, 1)
$avgBaseline = if ($observed.baseline.Count -gt 0) { [math]::Round(($observed.baseline | Measure-Object -Average).Average, 1) } else { 0 }
$avgMcp = if ($observed.mcp.Count -gt 0) { [math]::Round(($observed.mcp | Measure-Object -Average).Average, 1) } else { 0 }
$budgetSummary = [PSCustomObject]@{
    max_minutes = $budgetMinutes
    label = $Label
    modes = @($modesToRun)
    started_at = $batteryStart.ToString("o")
    ended_at = $batteryEnd.ToString("o")
    elapsed_seconds = $elapsedSec
    within_budget = ($elapsedSec -le ($budgetMinutes * 60))
    planned_queries = @($selectedArr | ForEach-Object { $_.id })
    executed_queries = @($executedQueries)
    skipped_queries = @($skippedQueries)
    repetitions = $Repetitions
    workspace = $runDir
    isolation = [PSCustomObject]@{
        sandbox = (-not $NoSandbox -and ($modesToRun -contains "baseline"))
        sandbox_root = if ($sandbox) { $sandbox.Root } else { $null }
        blocked_path_dirs = @($blockedDirs)
        blocked_binaries = @($blockedBinaries)
    }
    avg_latency_seconds = [PSCustomObject]@{ baseline = $avgBaseline; mcp = $avgMcp }
    estimated_seconds = [PSCustomObject]@{ baseline = [math]::Round($estSec.baseline, 1); mcp = [math]::Round($estSec.mcp, 1) }
    model = $benchModel
}
Write-Utf8NoBom -Path (Join-Path $resultsDir "budget-summary.json") -Content ($budgetSummary | ConvertTo-Json -Depth 6)

Write-Host "`n=== BENCHMARK COMPLETADO ===" -ForegroundColor Green
Write-Host "Etiqueta: $Label | Modos: $($modesToRun -join ', ')" -ForegroundColor White
Write-Host "Total ejecuciones: $currentRun / $totalRuns" -ForegroundColor White
Write-Host "Duración: ${elapsedSec}s de presupuesto $($budgetMinutes * 60)s" -ForegroundColor $(if ($elapsedSec -le ($budgetMinutes * 60)) { "Green" } else { "Red" })
Write-Host "Cobertura: $($executedQueries.Count) consultas ejecutadas | omitidas: $(@($skippedQueries).Count) ($($skippedQueries -join ', '))" -ForegroundColor White
Write-Host "Latencia media: baseline ${avgBaseline}s | mcp ${avgMcp}s" -ForegroundColor DarkGray
if ($failures.Count -gt 0) {
    Write-Host "Fallos: $($failures.Count)" -ForegroundColor Red
    $failures | Format-Table -AutoSize
}
Write-Host "Resultados en: $resultsDir" -ForegroundColor White
Write-Host "Logs en: $logsDir`n" -ForegroundColor White
