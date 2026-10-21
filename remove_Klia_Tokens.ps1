<#
.SYNOPSIS
    Script de desinstalacion completa para KLIA Token Optimizer y todos sus optimizadores dependientes.

    Desinstala:
    - Semble (via uv tool)
    - Context Mode (via npm)
    - RTK (plugin + configuracion + openrtk via npm)
    - Repomix (via npm)
    - Serena (via uv tool)
    - Entradas MCP y de plugin en OpenCode (en opencode.json Y opencode.jsonc si existen)
    - Plugins de Klia globales y copias locales (klia-auto-record, klia-router-inject, openrtk)
    - Bloques de AGENTS.md (SEMBLE, RTK, REPOMIX, SERENA y KLIA_ROUTER)
    - Comando slash /klia-stats (fichero .md, no vive en el config)
    - Entradas de Klia en los perfiles de OpenCode (~/.config/opencode/profiles/*.json)

    Compatibilidad:
    - OpenCode V2: MCP en `mcp.servers`, plugins en `plugins`.
    - OpenCode V1: MCP plano en `mcp.<nombre>`, plugins en `plugin`.
    El script limpia AMBAS formas y AMBOS ficheros de config (json + jsonc) si
    existen, para no dejar residuos al cambiar de version de OpenCode.

    Garantias:
    - Idempotente: re-ejecutarlo no genera errores ni re-escrituras inutiles del config.
    - El resumen distingue "eliminado" / "ya no existia" / "FALLO" / "conservado" segun el estado real.
    - Verifica exit codes y presencia en disco; nunca asume exito.
    - Nunca reescribe un config que no se pudo parsear (evita dejarlo vacio).
    - Crea un unico backup por fichero de config antes de modificarlo.
    - No usa winget. El binario rtk se deja para baja manual.

    Codigo de salida: 0 = sin fallos, 1 = hubo al menos un FALLO.
#>

# Raiz del proyecto: preferir la ubicacion real del script (portable entre maquinas).
if ($PSScriptRoot) { $projectRoot = $PSScriptRoot }
elseif ($env:KLIA_PROJECT_ROOT) { $projectRoot = $env:KLIA_PROJECT_ROOT }
else { $projectRoot = (Get-Location).Path }
Set-Location -LiteralPath $projectRoot

# Configuracion de rutas (mismo que el instalador)
if (-not $env:USERPROFILE) { $env:USERPROFILE = [System.Environment]::GetEnvironmentVariable("USERPROFILE", "User") }
if (-not $env:USERPROFILE) { $env:USERPROFILE = [System.Environment]::GetEnvironmentVariable("USERPROFILE", "Process") }
if (-not $env:USERPROFILE) { $env:USERPROFILE = $env:HOME }

$ocDir        = Join-Path $env:USERPROFILE ".config/opencode"
$ocConfigV2   = Join-Path $ocDir "opencode.json"
$ocConfigV1   = Join-Path $ocDir "opencode.jsonc"
$agentsMd     = Join-Path $ocDir "AGENTS.md"
$ctxDocsMd    = Join-Path $ocDir "docs/context-mode.md"
$profilesDir  = Join-Path $ocDir "profiles"
$RtkPluginDir  = Join-Path $ocDir "plugin"
$RtkPluginPath = Join-Path $RtkPluginDir "openrtk.ts"
$KliaAutoRecordPath   = Join-Path $RtkPluginDir "klia-auto-record.ts"
$KliaRouterInjectPath = Join-Path $RtkPluginDir "klia-router-inject.ts"
$RtkMdPath     = Join-Path $ocDir "RTK.md"
$RtkConfigPath = Join-Path $env:APPDATA "rtk/config.toml"
$RepomixConfigPath = Join-Path $ocDir "repomix.config.json"
$RepomixIgnorePath = Join-Path $ocDir ".repomixignore"
$NpmGlobalModules = Join-Path $env:APPDATA "npm/node_modules"
$UvToolsDir = Join-Path $env:APPDATA "uv/tools"

# ==========================================
# Estado de la ejecucion (para el resumen real)
# ==========================================
$script:Results          = New-Object System.Collections.Generic.List[object]
$script:ConfigBroken     = $false
$script:ConfigBackup     = @{}   # Path -> ruta del backup

function Add-Result {
    param(
        [string]$Section,
        [string]$Item,
        [ValidateSet('Eliminado','YaNoExistia','Fallo','Conservado')][string]$Status
    )
    $script:Results.Add([PSCustomObject]@{ Section = $Section; Item = $Item; Status = $Status })
}

# Helper functions
function Write-Ok   { param([string]$Msg) Write-Host "  [OK] $Msg" -ForegroundColor Green }
function Write-Err  { param([string]$Msg) Write-Host "  [XX] $Msg" -ForegroundColor Red }
function Write-Warn { param([string]$Msg) Write-Host "  [!!] $Msg" -ForegroundColor Yellow }
function Write-Info { param([string]$Msg) Write-Host "  [--] $Msg" -ForegroundColor DarkGray }
function Write-Step { param([string]$Id, [string]$Msg) Write-Host ""; Write-Host "[$Id] $Msg" -ForegroundColor Cyan }

# ==========================================
# Config seguro (opencode.json + opencode.jsonc)
# ==========================================
function Load-Config {
    param([string]$Path)
    $script:ConfigBroken = $false
    if (-not (Test-Path -LiteralPath $Path)) { return [PSCustomObject]@{} }
    $raw = Get-Content -LiteralPath $Path -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) { return [PSCustomObject]@{} }
    $stripped = $raw -replace '(?m)^\s*//.*$', ''
    try { return $stripped | ConvertFrom-Json } catch {
        # Segundo intento: tolerar comas finales (tipico de JSONC)
        try { return ($stripped -replace '(?m),(\s*[}\]])', '$1') | ConvertFrom-Json } catch {
            $script:ConfigBroken = $true
            return [PSCustomObject]@{}
        }
    }
}

function Save-Config {
    param([string]$Path, [object]$Config, [bool]$Broken = $false)
    if ($Broken) {
        Write-Err "NO se reescribe ${Path}: no se pudo parsear (se evita perder la config original)"
        return $false
    }
    $dir = Split-Path $Path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    # Un unico backup por fichero, antes de la primera escritura
    if (-not $script:ConfigBackup.ContainsKey($Path) -and (Test-Path -LiteralPath $Path)) {
        $bak = "$Path.bak-remove-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Copy-Item -LiteralPath $Path -Destination $bak
        $script:ConfigBackup[$Path] = $bak
    }
    $json = $Config | ConvertTo-Json -Depth 20
    try {
        [System.IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding($false)))
        return $true
    } catch {
        Write-Err "Error escribiendo ${Path}: $($_.Exception.Message)"
        return $false
    }
}

# Elimina una entrada MCP en AMBAS formas: V2 (mcp.servers.<name>) y V1 (mcp.<name>).
function Remove-McpEntry {
    param([object]$Config, [string]$Name)
    $changed = $false
    if ($Config.mcp -and ($Config.mcp.PSObject.Properties.Name -contains 'servers') -and $Config.mcp.servers -and
        ($Config.mcp.servers.PSObject.Properties.Name -contains $Name)) {
        $Config.mcp.servers.PSObject.Properties.Remove($Name)
        $changed = $true
    }
    if ($Config.mcp -and ($Config.mcp.PSObject.Properties.Name -contains $Name)) {
        $Config.mcp.PSObject.Properties.Remove($Name)
        $changed = $true
    }
    return $changed
}

# Elimina entradas de plugin que CONTENGAN el patron, en AMBAS formas:
# V2 (`plugins`) y V1 (`plugin`). Robusto frente a rutas absolutas o paquetes (@scope/name@ver).
function Remove-PluginEntry {
    param([object]$Config, [string]$Pattern)
    $changed = $false
    $rx = [regex]::Escape($Pattern)
    foreach ($key in @('plugins', 'plugin')) {
        if (($Config.PSObject.Properties.Name -contains $key) -and $null -ne $Config.$key) {
            $before = @($Config.$key)
            $after  = @($before | Where-Object { -not ($_ -and ($_ -match $rx)) })
            if ($after.Count -ne $before.Count) {
                if ($after.Count -eq 0) {
                    $Config.PSObject.Properties.Remove($key)
                } else {
                    $Config | Add-Member -NotePropertyName $key -NotePropertyValue $after -Force
                }
                $changed = $true
            }
        }
    }
    return $changed
}

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Native {
    # Ejecuta un comando nativo y devuelve $true solo si exit code == 0
    param([string]$File, [string[]]$Arguments)
    & $File @Arguments 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
}

# ==========================================
# Desinstaladores con verificacion real
# ==========================================
function Uninstall-NpmPackage {
    param([string]$Section, [string]$Name)
    $modDir = Join-Path $NpmGlobalModules $Name
    if (-not (Test-Path -LiteralPath $modDir)) {
        Write-Info "npm: '$Name' ya no esta instalado"
        Add-Result $Section "npm:$Name" 'YaNoExistia'
        return
    }
    if (Test-Command "npm") {
        if (-not (Invoke-Native 'npm' @('uninstall', '-g', $Name, '--silent'))) {
            Write-Warn "npm uninstall devolvio error para '$Name'; se verificara el estado en disco"
        }
    } else {
        Write-Warn "npm no disponible; eliminando modulo global manualmente"
    }
    if (Test-Path -LiteralPath $modDir) {
        try { Remove-Item -LiteralPath $modDir -Recurse -Force -ErrorAction Stop } catch { }
    }
    if (Test-Path -LiteralPath $modDir) {
        Write-Err "npm: '$Name' sigue presente en $modDir"
        Add-Result $Section "npm:$Name" 'Fallo'
    } else {
        Write-Ok "npm: '$Name' desinstalado"
        Add-Result $Section "npm:$Name" 'Eliminado'
    }
}

function Uninstall-UvTool {
    param([string]$Section, [string]$Name)
    $toolDir = Join-Path $UvToolsDir $Name
    if (-not (Test-Path -LiteralPath $toolDir)) {
        Write-Info "uv tool: '$Name' ya no esta instalado"
        Add-Result $Section "uv:$Name" 'YaNoExistia'
        return
    }
    if (Test-Command "uv") {
        if (-not (Invoke-Native 'uv' @('tool', 'uninstall', $Name))) {
            Write-Warn "uv tool uninstall devolvio error para '$Name'"
        }
    } else {
        Write-Warn "uv no disponible; eliminando entorno tool manualmente"
    }
    if (Test-Path -LiteralPath $toolDir) {
        # Entorno residual (ej. instalacion rota): forzar borrado
        Write-Warn "uv dejo un entorno residual en $toolDir; forzando borrado"
        try { Remove-Item -LiteralPath $toolDir -Recurse -Force -ErrorAction Stop } catch { }
    }
    if (Test-Path -LiteralPath $toolDir) {
        Write-Err "uv tool: '$Name' sigue presente en $toolDir"
        Add-Result $Section "uv:$Name" 'Fallo'
    } else {
        Write-Ok "uv tool: '$Name' desinstalado"
        Add-Result $Section "uv:$Name" 'Eliminado'
    }
}

function Remove-FileChecked {
    param([string]$Section, [string]$Path, [string]$Label)
    if (Test-Path -LiteralPath $Path) {
        try {
            Remove-Item -LiteralPath $Path -Force -Recurse -ErrorAction Stop
            Write-Ok "$Label eliminado"
            Add-Result $Section $Label 'Eliminado'
        } catch {
            Write-Err "No se pudo eliminar $Label : $($_.Exception.Message)"
            Add-Result $Section $Label 'Fallo'
        }
    } else {
        Write-Info "$Label ya no existe"
        Add-Result $Section $Label 'YaNoExistia'
    }
}

function Remove-AgentsBlock {
    param([string]$Section, [string]$Marker)
    if (-not (Test-Path -LiteralPath $agentsMd)) {
        Write-Info "AGENTS.md no existe; bloque $Marker ya no esta"
        Add-Result $Section "AGENTS.md:$Marker" 'YaNoExistia'
        return
    }
    $content = Get-Content -LiteralPath $agentsMd -Raw
    $pattern = "(?s)<!-- $Marker`_START -->.*?<!-- $Marker`_END -->`r?`n?"
    if ([regex]::IsMatch($content, $pattern)) {
        $newContent = [regex]::Replace($content, $pattern, '')
        [System.IO.File]::WriteAllText($agentsMd, $newContent, (New-Object System.Text.UTF8Encoding($false)))
        Write-Ok "Bloque $Marker removido de AGENTS.md"
        Add-Result $Section "AGENTS.md:$Marker" 'Eliminado'
    } else {
        Write-Info "Bloque $Marker no encontrado en AGENTS.md (ya no existe)"
        Add-Result $Section "AGENTS.md:$Marker" 'YaNoExistia'
    }
}

# ==========================================
# Config global: cargar TODOS los ficheros existentes (json + jsonc)
# ==========================================
$ocConfigPaths = @()
foreach ($p in @($ocConfigV2, $ocConfigV1)) {
    if (Test-Path -LiteralPath $p) { $ocConfigPaths += $p }
}
if ($ocConfigPaths.Count -eq 0) { $ocConfigPaths += $ocConfigV2 }  # quedara como no-op

$script:Targets = @()
foreach ($p in $ocConfigPaths) {
    $script:ConfigBroken = $false
    $cfg = Load-Config $p
    $script:Targets += [PSCustomObject]@{ Path = $p; Cfg = $cfg; Broken = $script:ConfigBroken; Dirty = $false }
    if ($script:ConfigBroken) { Write-Warn "$p no parsea como JSON; sus cambios NO se guardaran" }
}
Write-Info ("Config global detectada: " + (($script:Targets | ForEach-Object { Split-Path $_.Path -Leaf }) -join ', '))

# Aplican un cambio a TODOS los configs; marcan Dirty y devuelven si algo cambio.
function Remove-McpEntryAll {
    param([string]$Name)
    $changed = $false
    foreach ($t in $script:Targets) {
        if (-not $t.Broken -and (Remove-McpEntry $t.Cfg $Name)) { $t.Dirty = $true; $changed = $true }
    }
    return $changed
}
function Remove-PluginEntryAll {
    param([string]$Pattern)
    $changed = $false
    foreach ($t in $script:Targets) {
        if (-not $t.Broken -and (Remove-PluginEntry $t.Cfg $Pattern)) { $t.Dirty = $true; $changed = $true }
    }
    return $changed
}
function Remove-McpEntryReported {
    param([string]$Section, [string]$Name)
    if (Remove-McpEntryAll $Name) {
        Write-Ok "Entrada MCP '$Name' removida del config global"
        Add-Result $Section "mcp:$Name" 'Eliminado'
    } else {
        Write-Info "Entrada MCP '$Name' ya no estaba en el config global"
        Add-Result $Section "mcp:$Name" 'YaNoExistia'
    }
}

# ==========================================
# 1. DESINSTALAR SEMBLE
# ==========================================
Write-Step "SEMBLE" "Desinstalando Semble"
Uninstall-UvTool "SEMBLE" "semble"
Remove-McpEntryReported "SEMBLE" "semble"
Remove-FileChecked "SEMBLE" (Join-Path $ocDir "agents/semble-search.md") "Sub-agente semble-search.md"
Remove-AgentsBlock "SEMBLE" "SEMBLE"

# ==========================================
# 2. DESINSTALAR CONTEXT MODE
# ==========================================
Write-Step "CTX" "Desinstalando Context Mode"
Uninstall-NpmPackage "CTX" "context-mode"
Remove-McpEntryReported "CTX" "context-mode"
Remove-McpEntryReported "CTX" "context_mode"
$ctxPluginRemoved = Remove-PluginEntryAll "context-mode"
if ($ctxPluginRemoved) {
    Write-Ok "Entrada de plugin 'context-mode' removida del config global"
    Add-Result "CTX" "plugin:context-mode" 'Eliminado'
} else {
    Write-Info "Entrada de plugin 'context-mode' ya no estaba en el config global"
    Add-Result "CTX" "plugin:context-mode" 'YaNoExistia'
}

# ==========================================
# 3. DESINSTALAR RTK (plugin + configuracion + openrtk)
# ==========================================
Write-Step "RTK" "Desinstalando RTK (plugin y configuracion)"
Remove-FileChecked "RTK" $RtkPluginPath "Plugin openrtk.ts"
Remove-FileChecked "RTK" $RtkMdPath "RTK.md"
Remove-AgentsBlock "RTK" "RTK"
Remove-FileChecked "RTK" $RtkConfigPath "config.toml de RTK"
$rtkPluginRemoved = Remove-PluginEntryAll "openrtk"
if ($rtkPluginRemoved) { Add-Result "RTK" "plugin:openrtk" 'Eliminado' }
else { Add-Result "RTK" "plugin:openrtk" 'YaNoExistia' }
Uninstall-NpmPackage "RTK" "openrtk"

# El binario rtk no se instala via npm/uv: se deja para baja manual
$rtkCmd = Get-Command rtk -ErrorAction SilentlyContinue
if ($rtkCmd) {
    Write-Info "Binario rtk instalado en: $($rtkCmd.Source)"
    Write-Info "Para eliminarlo: winget uninstall --id rtk-ai.rtk | cargo uninstall rtk-cli | borrar el .exe"
    Add-Result "RTK" "binario rtk ($($rtkCmd.Source))" 'Conservado'
} else {
    Write-Info "Binario rtk no esta en PATH (nada que eliminar manualmente)"
    Add-Result "RTK" "binario rtk" 'YaNoExistia'
}

# ==========================================
# 4. DESINSTALAR REPOMIX
# ==========================================
Write-Step "REPOMIX" "Desinstalando Repomix"
Uninstall-NpmPackage "REPOMIX" "repomix"
Remove-McpEntryReported "REPOMIX" "repomix"
Remove-FileChecked "REPOMIX" $RepomixConfigPath "repomix.config.json"
Remove-FileChecked "REPOMIX" $RepomixIgnorePath ".repomixignore"
Remove-AgentsBlock "REPOMIX" "REPOMIX"

# ==========================================
# 5. DESINSTALAR SERENA
# ==========================================
Write-Step "SERENA" "Desinstalando Serena"
Uninstall-UvTool "SERENA" "serena-agent"
Remove-McpEntryReported "SERENA" "serena"
Remove-AgentsBlock "SERENA" "SERENA"

# ==========================================
# 6. DESINSTALAR LOS PLUGINS DE KLIA
# ==========================================
Write-Step "PLUGINS" "Desinstalando plugins de Klia (globales y locales)"
# Ficheros globales en ~/.config/opencode/plugin
Remove-FileChecked "PLUGINS" $KliaAutoRecordPath   "Plugin global klia-auto-record.ts"
Remove-FileChecked "PLUGINS" $KliaRouterInjectPath "Plugin global klia-router-inject.ts"
# Runtime global autocontenido (%LOCALAPPDATA%\klia-token-optimizer):
# dist + node_modules de produccion + classifier/training-data.json.
$kliaRuntimeDir = Join-Path $env:LOCALAPPDATA "klia-token-optimizer"
Remove-FileChecked "PLUGINS" $kliaRuntimeDir "Runtime global klia-token-optimizer (programa autocontenido)"
# Datos y logs globales del usuario (~/.klia).
$kliaHomeDir = Join-Path $env:USERPROFILE ".klia"
Remove-FileChecked "PLUGINS" (Join-Path $kliaHomeDir "data") "Datos globales ~/.klia/data"
Remove-FileChecked "PLUGINS" (Join-Path $kliaHomeDir "logs") "Logs globales ~/.klia/logs"
# Restos de directorios de plugins antiguos
Remove-FileChecked "PLUGINS" (Join-Path $ocDir "plugins/rtk-v2") "Directorio plugins/rtk-v2 (obsoleto)"
Remove-FileChecked "PLUGINS" (Join-Path $ocDir "local-plugins")  "Directorio local-plugins (obsoleto)"
# Copias locales dentro del proyecto (.js heredado y .ts)
$projectPluginDir = Join-Path $projectRoot ".opencode\plugin"
foreach ($f in @('klia-auto-record.js', 'klia-auto-record.ts', 'klia-router-inject.js', 'klia-router-inject.ts')) {
    Remove-FileChecked "PLUGINS" (Join-Path $projectPluginDir $f) "Plugin local $f"
}
# Entradas de registro en el/los config(s) y en AGENTS.md
if (Remove-PluginEntryAll "klia-auto-record")   { Add-Result "PLUGINS" "plugin:klia-auto-record" 'Eliminado' }   else { Add-Result "PLUGINS" "plugin:klia-auto-record" 'YaNoExistia' }
if (Remove-PluginEntryAll "klia-router-inject") { Add-Result "PLUGINS" "plugin:klia-router-inject" 'Eliminado' } else { Add-Result "PLUGINS" "plugin:klia-router-inject" 'YaNoExistia' }
if (Remove-PluginEntryAll "opencode-dcp")       { Add-Result "PLUGINS" "plugin:@tarquinen/opencode-dcp" 'Eliminado' } else { Add-Result "PLUGINS" "plugin:@tarquinen/opencode-dcp" 'Conservado' }
Remove-AgentsBlock "PLUGINS" "KLIA_ROUTER"

# ==========================================
# 7. NORMALIZAR CONFIGURACION DE OPENCODE
# ==========================================
Write-Step "OPT" "Normalizando configuracion OpenCode"
Remove-McpEntryReported "OPT" "klia-token-optimizer"

# Los comandos slash /klia_* no viven en el config: se registran como
# ficheros .md dentro de una carpeta de comandos. Sin borrarlos siguen apareciendo
# en el autocompletado de OpenCode aunque el MCP ya este desinstalado.
$kliaCmdDirs = @(
    (Join-Path $projectRoot ".opencode\command"),
    (Join-Path $projectRoot ".opencode\commands"),
    (Join-Path $ocDir "command"),
    (Join-Path $ocDir "commands"),
    (Join-Path $ocDir ".opencode\command"),
    (Join-Path $ocDir ".opencode\commands")
)
$kliaCmdPaths = @()
foreach ($dir in $kliaCmdDirs) {
    if (Test-Path -LiteralPath $dir) {
        $kliaCmdPaths += @(Get-ChildItem -LiteralPath $dir -Filter "klia_*.md" -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
        $kliaCmdPaths += @(Get-ChildItem -LiteralPath $dir -Filter "klia-stats.md" -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
    }
}
$kliaCmdFound = @($kliaCmdPaths | Select-Object -Unique | Where-Object { Test-Path -LiteralPath $_ })
if ($kliaCmdFound.Count -gt 0) {
    foreach ($cmdPath in $kliaCmdFound) {
        Remove-FileChecked "OPT" $cmdPath "Comando /klia_* ($cmdPath)"
    }
} else {
    Write-Info "Comandos /klia_* ya no estan registrados"
    Add-Result "OPT" "comandos /klia_*" 'YaNoExistia'
}

# Reportar estado final de los arrays de plugins en cada config
foreach ($t in $script:Targets) {
    $leaf = Split-Path $t.Path -Leaf
    $hasLegacy = ($t.Cfg.PSObject.Properties.Name -contains 'plugin')
    $hasV2     = ($t.Cfg.PSObject.Properties.Name -contains 'plugins')
    if (-not $hasLegacy -and -not $hasV2) {
        Write-Info "Sin arrays de plugins en $leaf"
        Add-Result "OPT" "plugins:$leaf" 'YaNoExistia'
    } else {
        $arr = @(); if ($hasV2) { $arr += @($t.Cfg.plugins) }; if ($hasLegacy) { $arr += @($t.Cfg.plugin) }
        Write-Info "Plugins conservados en ${leaf}: $($arr -join ', ')"
        Add-Result "OPT" "plugins:$leaf ($($arr.Count) entradas)" 'Conservado'
    }
}

# ==========================================
# 8. LIMPIAR ENTRADAS DE KLIA EN LOS PERFILES
# ==========================================
Write-Step "PROFILES" "Limpiando perfiles de OpenCode"
if (Test-Path -LiteralPath $profilesDir) {
    $profileFiles = @(Get-ChildItem -LiteralPath $profilesDir -Filter *.json -File -ErrorAction SilentlyContinue)
    if ($profileFiles.Count -eq 0) {
        Write-Info "No hay perfiles .json en $profilesDir"
    }
    $touched = 0
    foreach ($pf in $profileFiles) {
        $script:ConfigBroken = $false
        $pc = Load-Config $pf.FullName
        if ($script:ConfigBroken) {
            Write-Warn "Perfil no parseable, se omite: $($pf.Name)"
            Add-Result "PROFILES" $pf.Name 'Fallo'
            continue
        }
        $dirty = $false
        if (Remove-McpEntry $pc 'klia-token-optimizer') { $dirty = $true }
        foreach ($pat in @('klia-auto-record', 'klia-router-inject', 'openrtk', 'context-mode')) {
            if (Remove-PluginEntry $pc $pat) { $dirty = $true }
        }
        if ($dirty) {
            if (Save-Config $pf.FullName $pc $script:ConfigBroken) {
                Write-Ok "Perfil limpiado: $($pf.Name)"
                Add-Result "PROFILES" $pf.Name 'Eliminado'
                $touched++
            } else {
                Add-Result "PROFILES" $pf.Name 'Fallo'
            }
        }
    }
    if ($touched -eq 0) { Add-Result "PROFILES" "perfiles sin entradas de Klia" 'YaNoExistia' }
} else {
    Write-Info "No existe el directorio de perfiles: $profilesDir"
    Add-Result "PROFILES" "profiles/" 'YaNoExistia'
}

# ==========================================
# 9. GUARDAR CONFIG GLOBAL (solo si hubo cambios)
# ==========================================
Write-Step "SAVE" "Guardando configuracion global"
$anySaved = $false
foreach ($t in $script:Targets) {
    $leaf = Split-Path $t.Path -Leaf
    if (-not $t.Dirty) {
        Write-Info "$leaf sin cambios; no se reescribe"
        continue
    }
    if (Save-Config $t.Path $t.Cfg $t.Broken) {
        $bak = if ($script:ConfigBackup.ContainsKey($t.Path)) { [System.IO.Path]::GetFileName($script:ConfigBackup[$t.Path]) } else { 'sin backup' }
        Write-Ok "$leaf actualizado (backup: $bak)"
        Add-Result "SAVE" $leaf 'Eliminado'
        $anySaved = $true
    } else {
        Write-Err "$leaf NO se pudo actualizar"
        Add-Result "SAVE" $leaf 'Fallo'
    }
}
if (-not $anySaved) { Write-Info "Config global sin cambios" }

# ==========================================
# 10. LIMPIEZA / NOTAS FINALES
# ==========================================
Write-Step "FIN" "Notas finales"
if (Test-Path -LiteralPath $ctxDocsMd) {
    Write-Info "docs/context-mode.md se conserva como documentacion de referencia"
    Add-Result "FIN" "docs/context-mode.md" 'Conservado'
}
Add-Result "FIN" "AGENTS.md (reglas base)" 'Conservado'
Add-Result "FIN" ".router-history/ y data/ (historial del router)" 'Conservado'

# ==========================================
# RESUMEN REAL (generado desde el estado observado)
# ==========================================
Write-Host ""
Write-Host "=== RESUMEN DE DESINSTALACION ===" -ForegroundColor Cyan
Write-Host ""

function Show-Group {
    param([string]$Title, [string]$Status, [string]$Color, [string]$Symbol)
    $items = @($script:Results | Where-Object { $_.Status -eq $Status })
    if ($items.Count -eq 0) { return }
    Write-Host "$Title ($($items.Count)):" -ForegroundColor $Color
    foreach ($i in $items) { Write-Host "  $Symbol [$($i.Section)] $($i.Item)" }
    Write-Host ""
}

Show-Group "ELIMINADOS"      'Eliminado'   'Green'  'OK  '
Show-Group "YA NO EXISTIAN"  'YaNoExistia' 'DarkGray' '--  '
Show-Group "FALLOS"          'Fallo'       'Red'    'FAIL'
Show-Group "CONSERVADOS (manual / referencia)" 'Conservado' 'Yellow' 'KEPT'

$fallos = @($script:Results | Where-Object { $_.Status -eq 'Fallo' })
Write-Host "NOTAS:" -ForegroundColor Yellow
Write-Host "  1. Reinicia OpenCode para que los cambios de config surtan efecto."
if ($script:ConfigBackup.Count -gt 0) {
    Write-Host "  2. Backups creados:"
    foreach ($k in $script:ConfigBackup.Keys) { Write-Host "     - $($script:ConfigBackup[$k])" }
} else {
    Write-Host "  2. No se modifico ningun config (sin backup)."
}
Write-Host "  3. El historial (.router-history/ y data/) se conserva para que el router siga aprendiendo."
if ($fallos.Count -gt 0) {
    Write-Host ""
    Write-Host "=== DESINSTALACION COMPLETADA CON FALLOS ($($fallos.Count)) ===" -ForegroundColor Red
    exit 1
}
Write-Host ""
Write-Host "=== DESINSTALACION COMPLETADA ===" -ForegroundColor Green
exit 0
