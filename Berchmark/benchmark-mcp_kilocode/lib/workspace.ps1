#Requires -Version 5.1
<#
.SYNOPSIS
    Workspace neutral para el benchmark: copia del codigo sin instrucciones de optimizador.
.DESCRIPTION
    Las consultas del benchmark hacen referencia a "este repositorio" (classifyTask, tipo
    Optimizer...). Para que el baseline sea justo, el proyecto de trabajo NO debe incluir
    el AGENTS.md del repo (que empuja al modelo a usar los optimizadores) ni el README
    del producto. Este modulo genera un workspace limpio:
      - copia de src/ y tests/ (el codigo que las consultas necesitan para ser respondibles)
      - README.md y package.json neutros
      - historial git con 7 commits (para que Q12 pueda mostrar los ultimos 5 commits)
    El workspace vive fuera del repositorio (TEMP) para que Kilo no pueda descubrir el
    AGENTS.md del repo ni las reglas globales.
#>

function Write-WorkspaceUtf8 {
    param([string]$Path, [string]$Content)
    $dir = Split-Path $Path -Parent
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-WorkspaceGit {
    # Ejecuta git en el workspace con identidad local (sin tocar la config global).
    # autocrlf=off evita los avisos de conversion LF/CRLF que PowerShellOSA como error.
    param(
        [Parameter(Mandatory = $true)][string]$Repo,
        [Parameter(Mandatory = $true)][string[]]$GitArgs
    )
    $ErrorActionPreference = "Continue"
    $out = & git -C $Repo -c "user.name=Benchmark" -c "user.email=benchmark@local" -c "core.autocrlf=false" -c "core.safecrlf=false" @GitArgs 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "git $($GitArgs -join ' ') fallo en $Repo : $out"
    }
    return $out
}

function Remove-WorkspaceDir {
    # Borra un directorio recursivamente. Remove-Item falla con rutas largas o
    # ficheros en uso, asi que se recurre a rmdir de cmd.
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path $Path)) { return }
    try {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        return
    } catch {
        Write-Warning "Remove-Item fallo ($_). Intentando rmdir de cmd..."
    }
    & cmd.exe /c "rmdir /s /q `"$Path`"" 2>&1 | Out-Null
    if (Test-Path $Path) {
        throw "No se pudo limpiar el workspace: $Path"
    }
}

function New-BenchmarkWorkspace {
    # Genera el workspace neutral. Devuelve un descriptor con la ruta y el numero de commits.
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$Dest,
        [switch]$Force
    )

    if ((Test-Path $Dest) -and -not $Force) {
        Write-Host "[WORKSPACE] Se reutiliza el workspace existente: $Dest" -ForegroundColor DarkGray
        return [PSCustomObject]@{ Path = $Dest; Created = $false }
    }
    if (Test-Path $Dest) { Remove-WorkspaceDir -Path $Dest }
    New-Item -ItemType Directory -Path $Dest -Force | Out-Null

    # Codigo: la parte que las consultas del benchmark necesitan para ser respondibles.
    foreach ($d in @("src", "tests")) {
        $src = Join-Path $SourceRoot $d
        if (Test-Path $src) {
            Copy-Item -LiteralPath $src -Destination (Join-Path $Dest $d) -Recurse -Force
        }
    }

    # Metadatos neutros (sin menciones a optimizadores ni a MCP).
    $pkg = [ordered]@{
        name         = "sample-project"
        version      = "1.0.0"
        private      = $true
        description  = "Proyecto de ejemplo usado como contexto para las consultas del benchmark."
        scripts      = [ordered]@{ test = "vitest run" }
    }
    Write-WorkspaceUtf8 -Path (Join-Path $Dest "package.json") -Content (($pkg | ConvertTo-Json -Depth 4))

    $readme = @"
# sample-project

Proyecto de ejemplo usado como contexto de trabajo por un benchmark de consumo de tokens.

## Estructura

- ``src/classifier`` - clasificacion de tareas por tipo.
- ``src/rules`` - reglas base por tipo de tarea.
- ``src/scorer`` - calculo de coste esperado y estadisticas.
- ``src/selector`` - seleccion de estrategia y reparto de exploratory/exploit.
- ``src/history`` - persistencia de eventos de ejecucion.
- ``src/types`` - tipos compartidos (incluye el tipo ``Optimizer``).
- ``tests`` - pruebas unitarias que replican la estructura de ``src``.

## Convenciones

- TypeScript/Node.js.
- Nombres en ingles, comentarios en espanol.
"@
    Write-WorkspaceUtf8 -Path (Join-Path $Dest "README.md") -Content $readme

    # Historial git: commits agrupados por modulo para que `git log -5` tenga contenido.
    Invoke-WorkspaceGit -Repo $Dest -GitArgs @("init", "-q", "-b", "main") | Out-Null
    $batches = @(
        @{ Paths = @("README.md", "package.json"); Message = "chore: bootstrap del proyecto de ejemplo" },
        @{ Paths = @("src/classifier"); Message = "feat(classifier): modulo de clasificacion de tareas" },
        @{ Paths = @("src/rules"); Message = "feat(rules): reglas base por tipo de tarea" },
        @{ Paths = @("src/scorer", "src/selector"); Message = "feat(scorer): coste esperado y seleccion de estrategia" },
        @{ Paths = @("src/history"); Message = "feat(history): persistencia de eventos de ejecucion" },
        @{ Paths = @("src/types.ts", "src/index.ts", "src/utils"); Message = "feat(core): tipos compartidos y utilidades" },
        @{ Paths = @("tests"); Message = "test: suite de pruebas unitarias" }
    )
    foreach ($b in $batches) {
        $existing = @($b.Paths | Where-Object { Test-Path (Join-Path $Dest $_) })
        if ($existing.Count -eq 0) { continue }
        Invoke-WorkspaceGit -Repo $Dest -GitArgs (@("add", "--") + $existing) | Out-Null
        Invoke-WorkspaceGit -Repo $Dest -GitArgs @("commit", "-q", "-m", $b.Message) | Out-Null
    }
    # Resto de ficheros sueltos, por si el repo tiene modulos en la raiz de src/.
    Invoke-WorkspaceGit -Repo $Dest -GitArgs @("add", "-A") | Out-Null
    Invoke-WorkspaceGit -Repo $Dest -GitArgs @("commit", "-q", "-m", "chore: resto de modulos del proyecto") | Out-Null

    $commitCount = 0
    try {
        $log = & git -C $Dest rev-list --count HEAD 2>$null | Out-String
        $commitCount = [int]($log.Trim())
    } catch { $commitCount = 0 }

    Write-Host "[WORKSPACE] Workspace neutral generado en: $Dest ($commitCount commits)" -ForegroundColor Green
    return [PSCustomObject]@{ Path = $Dest; Created = $true; Commits = $commitCount }
}
