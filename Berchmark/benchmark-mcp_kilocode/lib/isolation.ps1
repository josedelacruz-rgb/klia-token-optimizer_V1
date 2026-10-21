#Requires -Version 5.1
<#
.SYNOPSIS
    Aislamiento de entorno para el benchmark: sandbox de HOME/config y bloqueo de binarios de optimizadores.
.DESCRIPTION
    Proporciona las piezas que permiten ejecutar una fase "baseline" en la que TODOS los
    programas de optimizacion estan effectively desinstalados, sin desinstalar nada del
    equipo y sin tocar la configuracion global del usuario:
      - New-BenchmarkSandbox  : crea un HOME/config aislado (sin plugins, sin MCP, sin reglas)
      - New-BlockedShim       : crea shims que emulan "comando no instalado" (cmd + sh)
      - Get-IsolatedPath      : filtra del PATH los directorios con binarios de optimizadores
      - New-EnvSnapshot / Restore-EnvSnapshot / Set-BenchmarkEnv : gestion del entorno por fase
#>

# Directorios del sistema que contienen binarios de optimizadores (rtk, semble, serena,
# tokenade, fff, mempalace, headroom...). Se eliminan del PATH solo durante la fase baseline.
$script:DefaultBlockedDirs = @(
    (Join-Path $env:USERPROFILE ".cargo\bin"),
    (Join-Path $env:APPDATA "Roaming\Python\Python314\Scripts"),
    (Join-Path $env:USERPROFILE ".local\bin"),
    (Join-Path $env:APPDATA "npm")
)

# Binarios concretos que se bloquean con shims (por si comparten directorio con utiles).
$script:DefaultBlockedBinaries = @("rtk", "semble", "serena", "tokenade", "repomix")

function Write-Utf8NoBom {
    # Escribe texto en UTF-8 sin BOM (el parser JSON de Kilo/Node no tolera BOM).
    param([string]$Path, [string]$Content)
    $dir = Split-Path $Path -Parent
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function New-BenchmarkSandbox {
    # Crea el sandbox: config home aislada + HOME aislado + directorio de shims.
    #   config/kilo/kilo.jsonc -> config minima de Kilo (sin MCP, bash permitido)
    #   home/                  -> HOME/USERPROFILE nuevo (sin ~/.kilo/rules ni ~/.config/kilo/AGENTS.md)
    #   blocked-bin/           -> shims de binarios de optimizadores
    param(
        [Parameter(Mandatory = $true)][string]$Root
    )

    if (-not [System.IO.Path]::IsPathRooted($Root)) { $Root = [System.IO.Path]::GetFullPath($Root) }
    $configHome = Join-Path $Root "config"
    $kiloDir = Join-Path $configHome "kilo"
    $homeDir = Join-Path $Root "home"
    $shimDir = Join-Path $Root "blocked-bin"
    foreach ($d in @($configHome, $kiloDir, $homeDir, $shimDir)) {
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }

    # Config minima de Kilo para el sandbox: sin servidores MCP y con los permisos basicos.
    # Ojo: el schema de Kilo no admite claves de comentario ("_comment"): solo las clave conocidas.
    $doc = [ordered]@{
        '$schema'  = 'https://app.kilo.ai/config.json'
        'mcp'      = [PSCustomObject]@{}
        'permission' = [ordered]@{
            'bash'     = 'allow'
            'edit'     = 'allow'
            'webfetch' = 'allow'
        }
    }
    Write-Utf8NoBom -Path (Join-Path $kiloDir "kilo.jsonc") -Content (($doc | ConvertTo-Json -Depth 6))

    return [PSCustomObject]@{
        Root       = $Root
        ConfigHome = $configHome
        ConfigFile = (Join-Path $kiloDir "kilo.jsonc")
        Home       = $homeDir
        ShimDir    = $shimDir
    }
}

function New-BlockedShim {
    # Crea shims que emulan "comando no instalado" para un conjunto de binarios.
    #   <nombre>.cmd -> lo encuentra cmd.exe / PowerShell (PATHEXT)
    #   <nombre>     -> lo encontra bash/sh (shebang)
    param(
        [Parameter(Mandatory = $true)][string]$Dir,
        [string[]]$Names = @(),
        [string]$Reason = "no esta instalado en el entorno baseline del benchmark"
    )
    if (-not $Names -or $Names.Count -eq 0) { return }
    if (-not (Test-Path $Dir)) { New-Item -ItemType Directory -Path $Dir -Force | Out-Null }
    foreach ($n in $Names) {
        $cmdBody = "@echo off`r`necho '$n' $Reason (shim de aislamiento del benchmark). 1>&2`r`nexit /b 9009`r`n"
        Write-Utf8NoBom -Path (Join-Path $Dir "$n.cmd") -Content $cmdBody
        $shBody = "#!/bin/sh`necho '$n' $Reason (shim de aislamiento del benchmark) >&2`nexit 127`n"
        Write-Utf8NoBom -Path (Join-Path $Dir $n) -Content $shBody
    }
}

function Get-IsolatedPath {
    # Devuelve un PATH sin los directorios bloqueados y con el directorio de shims delante.
    param(
        [string]$Path = $env:PATH,
        [string[]]$BlockedDirs = @(),
        [string]$ShimDir = $null
    )
    $parts = @()
    foreach ($p in ($Path -split ';')) {
        if ([string]::IsNullOrWhiteSpace($p)) { continue }
        $norm = $p.Trim().TrimEnd('\')
        $blocked = $false
        foreach ($b in $BlockedDirs) {
            if ([string]::IsNullOrWhiteSpace($b)) { continue }
            if ($norm -ieq $b.Trim().TrimEnd('\')) { $blocked = $true; break }
        }
        if (-not $blocked) { $parts += $p }
    }
    if ($ShimDir) { $parts = @($ShimDir) + $parts }
    return ($parts -join ';')
}

function Set-ProcessEnv {
    # Asigna (o elimina, si el valor es $null) una variable de entorno del proceso.
    # Se usa la API de .NET porque en Windows PowerShell $env:HOME no es asignable
    # (HOME es una variable automatica de solo lectura).
    param([string]$Name, [string]$Value)
    if ($null -eq $Value) {
        [Environment]::SetEnvironmentVariable($Name, $null, 'Process')
    } else {
        [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
    }
}

function New-EnvSnapshot {
    # Captura el estado actual de las variables de entorno que manipula el benchmark.
    param([string[]]$Names = @("HOME", "USERPROFILE", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "PATH"))
    $snap = @{}
    foreach ($n in $Names) {
        $snap[$n] = [Environment]::GetEnvironmentVariable($n, 'Process')
    }
    return $snap
}

function Restore-EnvSnapshot {
    # Restaura el entorno capturado (los valores $null se eliminan).
    param([hashtable]$Snapshot)
    if (-not $Snapshot) { return }
    foreach ($k in @($Snapshot.Keys)) {
        Set-ProcessEnv -Name $k -Value $Snapshot[$k]
    }
}

function Set-BenchmarkEnv {
    # Aplica el entorno de una fase concreta.
    #   baseline -> HOME/config aislados, PATH sin optimizadores, shims delante
    #   mcp      -> entorno real restaurado (plugins globales, MCP, PATH completo)
    # Devuelve una descripcion del aislamiento aplicado (null si no hubo aislamiento).
    param(
        [ValidateSet("baseline", "mcp")][string]$Mode,
        [hashtable]$Snapshot,
        [PSCustomObject]$Sandbox = $null,
        [string[]]$BlockedDirs = @(),
        [string[]]$BlockedBinaries = @(),
        [switch]$NoSandbox
    )

    # Siempre partimos del entorno original.
    Restore-EnvSnapshot -Snapshot $Snapshot
    if ($Mode -ne "baseline" -or $NoSandbox) {
        return $null
    }

    $description = [ordered]@{
        sandbox = (-not $NoSandbox)
        sandbox_root = if ($Sandbox) { $Sandbox.Root } else { $null }
        home = if ($Sandbox) { $Sandbox.Home } else { $null }
        config_home = if ($Sandbox) { $Sandbox.ConfigHome } else { $null }
        blocked_path_dirs = @($BlockedDirs)
        blocked_binaries = @($BlockedBinaries)
        pure = $true
    }

    if ($Sandbox) {
        Set-ProcessEnv -Name "HOME" -Value $Sandbox.Home
        Set-ProcessEnv -Name "USERPROFILE" -Value $Sandbox.Home
        Set-ProcessEnv -Name "XDG_CONFIG_HOME" -Value $Sandbox.ConfigHome
        # El data dir real (auth + BD de Kilo) se conserva: sin el, no hay metricas.
        if (-not $env:XDG_DATA_HOME) {
            $realData = Join-Path $Snapshot['USERPROFILE'] ".local\share"
            Set-ProcessEnv -Name "XDG_DATA_HOME" -Value $realData
        }
    }

    $shimDir = $null
    if ($Sandbox) { $shimDir = $Sandbox.ShimDir }
    if ($BlockedBinaries.Count -gt 0 -and $shimDir) {
        New-BlockedShim -Dir $shimDir -Names $BlockedBinaries
    }
    $env:PATH = Get-IsolatedPath -Path $env:PATH -BlockedDirs $BlockedDirs -ShimDir $shimDir

    return [PSCustomObject]$description
}
