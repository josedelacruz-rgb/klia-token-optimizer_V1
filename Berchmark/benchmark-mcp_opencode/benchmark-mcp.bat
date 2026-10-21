@echo off
REM ==========================================================================
REM Benchmark MCP vs Baseline - Script autocontenido
REM ==========================================================================
REM Este script hace TODO:
REM   1. Cierra TODOS los procesos opencode (libera memoria y locks)
REM   2. Limpia locks huerfanos
REM   3. Ejecuta el benchmark completo (12 consultas x 2 modos x 3 repeticiones)
REM   4. Restaura la config original de opencode
REM   5. Genera el analisis y el informe
REM
REM USO:
REM   Doble clic sobre este archivo, o desde una terminal CMD:
REM   > benchmark-mcp.bat
REM
REM O con parametros (opcional):
REM   > benchmark-mcp.bat pilot        (solo Q01 y Q05, 1 repeticion)
REM   > benchmark-mcp.bat full         (12 consultas x 2 modos x 3 repeticiones)
REM   > benchmark-mcp.bat baseline     (solo modo baseline)
REM   > benchmark-mcp.bat mcp         (solo modo mcp)
REM
REM IMPORTANTE: Ejecutar FUERA de OpenCode. Cierra OpenCode antes de lanzarlo.
REM ==========================================================================

setlocal enabledelayedexpansion

set MODE_ARG=%1
if "%MODE_ARG%"=="" set MODE_ARG=full

set PROJECT_DIR=C:\ProyectosV2\telemetria\Klia_Optimizer_Last_Version
set BENCH_DIR=%PROJECT_DIR%\benchmark-mcp
set LOG_FILE=%BENCH_DIR%\logs\benchmark-run-%date:~-4,4%%date:~-7,2%%date:~-10,2%-%time:~0,2%%time:~3,2%%time:~6,2%.log
set LOG_FILE=%LOG_FILE: =0%
set CONFIG_PATH=%USERPROFILE%\.config\opencode\opencode.json
set CONFIG_BAK=%CONFIG_PATH%.bak-benchmark-manual

echo.
echo ==========================================================
echo  BENCHMARK MCP vs BASELINE - Script autocontenido
echo ==========================================================
echo Modo: %MODE_ARG%
echo Proyecto: %PROJECT_DIR%
echo Log: %LOG_FILE%
echo.

REM Verificar que estamos en el directorio correcto
if not exist "%BENCH_DIR%\run-benchmark-safe.ps1" (
    echo ERROR: No se encuentra %BENCH_DIR%\run-benchmark-safe.ps1
    echo Ejecuta este script desde el directorio del proyecto.
    pause
    exit /b 1
)

REM ==========================================================
REM PASO 1: Cerrar TODOS los procesos opencode
REM ==========================================================
echo.
echo --- PASO 1: Cerrando procesos opencode ---
tasklist /FI "IMAGENAME eq opencode.exe" 2>nul | find /I "opencode.exe" >nul
if %ERRORLEVEL%==0 (
    echo Cerrando opencode.exe...
    taskkill /F /IM opencode.exe >nul 2>&1
    timeout /t 3 /nobreak >nul
    echo Procesos opencode cerrados.
) else (
    echo No hay procesos opencode activos.
)

REM Cerrar procesos node que puedan ser servidores MCP huerfanos
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if %ERRORLEVEL%==0 (
    echo Cerrando procesos node.exe huerfanos...
    taskkill /F /IM node.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
    echo Procesos node cerrados.
) else (
    echo No hay procesos node activos.
)

REM ==========================================================
REM PASO 2: Limpiar locks huerfanos
REM ==========================================================
echo.
echo --- PASO 2: Limpiando locks huerfanos ---
set LOCKS_DIR=%USERPROFILE%\.local\state\opencode\locks
if exist "%LOCKS_DIR%" (
    echo Eliminando locks en %LOCKS_DIR% ...
    del /Q "%LOCKS_DIR%\*.lock" >nul 2>&1
    del /Q "%LOCKS_DIR%\*.lock\*" >nul 2>&1
    for /D %%D in ("%LOCKS_DIR%\*.lock") do rmdir /S /Q "%%D" 2>nul
    echo Locks limpiados.
) else (
    echo No hay directorio de locks.
)

REM ==========================================================
REM PASO 3: Backup de config de opencode
REM ==========================================================
echo.
echo --- PASO 3: Backup de config de opencode ---
if exist "%CONFIG_BAK%" del /Q "%CONFIG_BAK%" >nul
if exist "%CONFIG_PATH%" (
    copy "%CONFIG_PATH%" "%CONFIG_BAK%" >nul
    echo Backup creado: %CONFIG_BAK%
) else (
    echo WARNING: No existe %CONFIG_PATH%
)

REM ==========================================================
REM PASO 4: Ejecutar benchmark
REM ==========================================================
echo.
echo --- PASO 4: Ejecutando benchmark ---
echo.

REM Determinar parametros segun el modo (con goto para evitar el parser
REM de bloques de CMD, que se rompe con parentesis en los echo)
set PS_ARGS=-NoProfile -ExecutionPolicy Bypass -File "%BENCH_DIR%\run-benchmark-safe.ps1" -QueryTimeout 240 -ServerPort 14099

if /I "%MODE_ARG%"=="pilot"   goto mode_pilot
if /I "%MODE_ARG%"=="full"     goto mode_full
if /I "%MODE_ARG%"=="baseline" goto mode_baseline
if /I "%MODE_ARG%"=="mcp"      goto mode_mcp
goto mode_unknown

:mode_pilot
set PS_ARGS=%PS_ARGS% -Pilot
echo Modo pilot: Q01 y Q05 en ambos modos, 1 repeticion, 4 ejecuciones
goto run_benchmark

:mode_full
set PS_ARGS=%PS_ARGS% -Mode both -Repetitions 3
echo Modo full: 12 consultas x 2 modos x 3 repeticiones = 72 ejecuciones
goto run_benchmark

:mode_baseline
set PS_ARGS=%PS_ARGS% -Mode baseline -Repetitions 3
echo Modo baseline: 12 consultas x 3 repeticiones = 36 ejecuciones
goto run_benchmark

:mode_mcp
set PS_ARGS=%PS_ARGS% -Mode mcp -Repetitions 3
echo Modo mcp: 12 consultas x 3 repeticiones = 36 ejecuciones
goto run_benchmark

:mode_unknown
echo Modo desconocido: %MODE_ARG%
echo Modos validos: pilot, full, baseline, mcp
pause
exit /b 1

:run_benchmark
echo.
echo Iniciando benchmark...
echo Log completo en: %LOG_FILE%
echo.

REM Ejecutar PowerShell
powershell.exe %PS_ARGS% > "%LOG_FILE%" 2>&1
set PS_EXIT=%ERRORLEVEL%

echo.
echo Benchmark finalizado con exit code: %PS_EXIT%

REM ==========================================================
REM PASO 5: Restaurar config de opencode
REM ==========================================================
echo.
echo --- PASO 5: Restaurando config de opencode ---
if exist "%CONFIG_BAK%" (
    copy /Y "%CONFIG_BAK%" "%CONFIG_PATH%" >nul
    echo Config restaurada desde: %CONFIG_BAK%
) else (
    echo WARNING: No hay backup para restaurar.
)

REM ==========================================================
REM PASO 6: Analizar y generar informe
REM ==========================================================
echo.
echo --- PASO 6: Analisis y generacion de informe ---
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%BENCH_DIR%\analyze.ps1" >> "%LOG_FILE%" 2>&1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%BENCH_DIR%\generate-report.ps1" >> "%LOG_FILE%" 2>&1

echo.
echo ==========================================================
echo  BENCHMARK COMPLETADO
echo ==========================================================
echo Resultados: %BENCH_DIR%\results\
echo Informe:    %BENCH_DIR%\reports\reporte-benchmark-mcp.md
echo Informe:    %BENCH_DIR%\reports\reporte-benchmark-mcp.html
echo Log:        %LOG_FILE%
echo.
pause
endlocal
