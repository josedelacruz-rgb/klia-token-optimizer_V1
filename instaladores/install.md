# install_klia_tokens.ps1

Instalador unificado "todo-en-uno" en PowerShell que monta el entorno completo
de **OpenCode** y **KiloCode** con el router adaptativo `klia-token-optimizer` y los
4 optimizadores de contexto en Windows.

Sustituye a los antiguos scripts separados:
- `install.ps1` (raiz): instalaba solo el router e invocaba el instalador
  externo por stdin.
- `instaladores/install.ps1`: instalaba OpenCode + Semble + Context Mode +
  RTK + Repomix con menu interactivo.

Este script unifica ambos en uno solo, desatendido por defecto.

## Que instala

| Componente          | Funcion                                               | Origen            |
|---------------------|-------------------------------------------------------|-------------------|
| klia-token-optimizer| Router adaptativo (servidor MCP)                      | `npm run build`   |
| Semble              | Busqueda semantica de codigo (MCP)                    | `uv tool` (PyPI)  |
| Context Mode        | Indexacion y sandbox de archivos grandes (plugin)    | `npm`             |
| RTK                 | Proxy que comprime salida de comandos CLI             | winget/cargo/GitHub |
| repomix             | Empaquetador de repos para vision global (MCP)        | `npm`             |
| klia-auto-record    | Plugin que registra metricas reales automaticamente  | embebido          |

Nota: Serena esta EXCLUIDA del stack. El instalador nunca la instala ni
escribe su configuracion (ni en OpenCode ni en KiloCode); solo limpia los
restos de una instalacion anterior.

## Uso

```powershell
# Desatendido (por defecto): instala los 4 optimizadores + router
.\install_klia_tokens.ps1

# Perfil especifico
.\install_klia_tokens.ps1 -StackProfile minimo
.\install_klia_tokens.ps1 -StackProfile repomix

# Menu interactivo
.\install_klia_tokens.ps1 -Interactive

# Simular sin tocar nada
.\install_klia_tokens.ps1 -DryRun

# Reinstalar sin pedir confirmacion
.\install_klia_tokens.ps1 -Force

# No generar backups antes de modificar
.\install_klia_tokens.ps1 -SkipBackup

# Desinstalar todo
.\install_klia_tokens.ps1 -Uninstall
```

## Perfiles

| Perfil    | Optimizadores instalados                          |
|-----------|---------------------------------------------------|
| `all`     | Semble + Context Mode + RTK + Repomix (default)        |
| `minimo`  | Semble + Context Mode + RTK                       |
| `repomix` | minimo + Repomix                                  |

En modo `all` no se aplica exclusividad: se instala Repomix junto al resto.
En el perfil `minimo` Repomix se excluye (exclusividad original).

## Parametros

| Parametro       | Descripcion                                          |
|-----------------|------------------------------------------------------|
| `-Force`        | Reinstala sin pedir confirmacion.                    |
| `-SkipBackup`   | No genera copias `.bak-*` antes de modificar.        |
| `-DryRun`       | Muestra que haria sin tocar nada.                    |
| `-Uninstall`    | Desinstala el router + los 4 optimizadores.          |
| `-StackOnly`    | Solo instala optimizadores, sin el router.           |
| `-Interactive`  | Menu interactivo (8 opciones).                        |
| `-StackProfile` | `all` (default), `minimo`, `repomix`.                 |

## Fases del instalador (12 fases)

| Fase | Descripcion                                                  |
|------|--------------------------------------------------------------|
| 0    | Pre-checks: opencode, Node >= 22.5, npm, uv                 |
| 1    | Instalar Semble (`uv tool install`, configura MCP + AGENTS) |
| 2    | Instalar Context Mode (plugin npm, limpia MCP legacy)        |
| 3    | Instalar RTK (7 sub-fases: binario, plugin, RTK.md, AGENTS)  |
| 4    | Instalar Repomix (6 sub-fases: npm, MCP, config, AGENTS)    |
| 5    | Limpiar configuracion residual de Serena (no se instala)   |
| 6    | Preset: normalizar plugin, MCPs y eliminar config de ahorro |
| 7    | Ajustar `base-rules.ts` (BASELINE si un optimizador fallo)   |
| 8    | `npm install` (dependencias del proyecto)                    |
| 9    | `npm run build` (compilar a `dist/`)                         |
| 10   | Preparar `.router-history/` + calibrar si esta vacio         |
| 11   | Registrar MCP `klia-token-optimizer` en `opencode.jsonc`     |
| 12   | Inyectar system prompt + escribir plugin `klia-auto-record` |
| ST   | Smoke test del router                                         |

### Detalle de cada optimizador

**Semble** (fase 1):
- Verifica `uv` + Python >= 3.10.
- Instala globalmente con `uv tool install semble[mcp]==0.6.1`.
- Ejecuta `semble install --agent opencode --type all --yes`.
- Verifica los 3 archivos: `opencode.jsonc` (MCP), `AGENTS.md` (bloque
  SEMBLE), `agents/semble-search.md` (sub-agente).
- Inyecta/refuerza routing en `AGENTS.md` (semble > grep para semantica).
- Crea `.sembleignore` template.
- Prueba de humo (`semble --version` + `semble search`).

**Context Mode** (fase 2):
- Lo registra como **plugin** (no MCP), segun benchmark interno.
- Limpia configuracion MCP legacy si existe.
- Crea `~/.config/opencode/docs/context-mode.md` (politica + benchmark).
- Sobrescribe `~/.config/opencode/AGENTS.md` con reglas minimas
  PRESERVANDO los bloques SEMBLE, RTK y REPOMIX si existen.
- Registra `context-mode` como plugin tambien en KiloCode
  (`~/.config/kilo/kilo.jsonc`, `kilo.json` y `config.json` legacy).
- Ejecuta `ctx stats` / `ctx doctor` si estan disponibles.

**RTK** (fase 3, 7 sub-fases, NO usa `rtk init`):
1. Instalar binario rtk (winget -> cargo -> GitHub release + SHA-256).
2. Escribir `plugin/openrtk.ts` (version parcheada, inlinea `rewrite()`
   para evitar bug ESM upstream de `rtk init -g --opencode`).
3. Crear `RTK.md` (instrucciones de rtk para el agente).
4. Insertar bloque `RTK_START`/`RTK_END` en `AGENTS.md` (idempotente).
5. Escribir `%APPDATA%\rtk\config.toml` (tracking, display, filters).
6. Migrar recall de tee a sqlite (`rtk config recall sqlite`).
7. Verificacion final (rtk --version, plugin, RTK.md, bloque AGENTS.md,
   config.toml, rtk gain).
- Log: `~/.config/opencode/rtk-install-<fecha>.log`
- Backups: `.bak-rtk-<fecha>` por archivo modificado (salvo `-SkipBackup`).
- Coexiste con semble (busqueda) y context-mode (archivos grandes).

**Repomix** (fase 4, 6 sub-fases):
1. Instalar paquete npm global `repomix`.
2. Verificar/inyectar entrada MCP `mcp.repomix` en `opencode.jsonc`.
3. Crear `~/.config/opencode/repomix.config.json` con defaults.
4. Inyectar bloque `REPOMIX_START`/`END` en `AGENTS.md` con routing
   anti-solapamiento (repomix = empaquetador, NO buscador).
5. Crear `~/.config/opencode/.repomixignore` global.
6. Verificacion final (5 checks).
- Coexiste con semble (busqueda) y context-mode (archivos grandes).

**Serena** (fase 5): excluida del stack.
- No se instala `serena-agent` ni se escribe su configuracion.
- La fase 5 solo limpia restos de instalaciones anteriores: entrada MCP
  `mcp.serena` (OpenCode y KiloCode) y bloque `SERENA_START`/`END` en
  `AGENTS.md`.

### Preset (fase 6)

Ademas de instalar, el preset:
1. Normaliza el array `plugin` de OpenCode conservando `context-mode`,
   `@tarquinen/opencode-dcp`, `openrtk.ts`, `klia-auto-record.ts` y
   `klia-router-inject.ts`.
2. Normaliza los MCPs: elimina siempre `mcp.serena` (Serena esta excluida)
   y los MCPs legacy `context-mode` / `context_mode` / `llmlingua`.
3. **Elimina la configuracion de ahorro de OpenCode** (el instalador ya no
   la escribe): `aggressive_truncation`, `preemptive_compaction`,
   `truncate_all_tool_outputs`, `dynamic_context_pruning`, `deduplication`,
   `supersede_writes`, `purge_errors` y `context_protection`.
   OpenCode vuelve a sus valores por defecto.
4. En modo `all` NO elimina repomix (sin exclusividad).
   En modo `minimo` si se aplica la exclusividad original.
5. Inyecta bloques `SEMBLE`, `RTK` y `REPOMIX` en `AGENTS.md` segun perfil.

### Ajuste automatico de base-rules.ts (fase 7)

Si un optimizador fallo al instalarse, el instalador reemplaza automaticamente
su nombre por `BASELINE` en `src/rules/base-rules.ts` para que el router
nunca recomiende un optimizador que no esta disponible. Genera backup de
`base-rules.ts` antes de modificarlo.

### Plugin klia-auto-record (fase 12)

El instalador escribe `plugin/klia-auto-record.ts` en el directorio de
OpenCode. Este plugin cierra el bucle del router adaptativo:
- Hookea `tool.execute.after` para detectar llamadas a `route_task`.
- Cuando la sesion entra en idle (`session.idle`), calcula los tokens
  reales (input + output) y la latencia de la sesion.
- Invoca `router-cli.js --record-execution` con las metricas reales.
- No requiere accion manual del usuario.

### System prompt (fase 12)

El instalador inyecta automaticamente el system prompt del router en
`opencode.jsonc` (propiedad `systemPrompt`). El prompt instruye al modelo
para:
1. Verificar al arrancar que el router responde.
2. Invocar `route_task` antes de tareas significativas.
3. Aplicar el optimizador recomendado.
4. Dejar que el plugin `klia-auto-record` registre las metricas.

## Caracteristicas

- **Idempotente**: detecta lo que ya esta instalado y solo anade lo que falta.
- **Con backups**: cada archivo modificado deja una copia `.bak-<fase>-<fecha>`.
- **Sin sobreescritura destructiva**: preserva bloques previos en `AGENTS.md`
  (SEMBLE, RTK, REPOMIX) y solo actualiza su contenido entre
  marcadores `<!-- ..._START --> / <!-- ..._END -->`.
- **Ajuste automatico**: si un optimizador falla, `base-rules.ts` se ajusta
  para que el router use `BASELINE` en su lugar.
- **Smoke test**: ejecuta una decision de prueba del router al final.
- **Politica de versiones fijas**: Semble 0.6.1, RTK 0.50.0 y Python 3.11
  para Context Mode (politica empresarial, no usa `latest`).

## Requisitos

- **Node.js >= 22.5** (requerido por Context Mode).
- **npm**.
- **uv** (gestor de Python, instalado automaticamente si falta, lo necesita
  Semble).
- **opencode** (instalado automaticamente si falta via `npm install -g
  opencode-ai`).

## Notas

- El script debe ejecutarse desde la raiz del proyecto
  `klia-token-optimizer`.
- Cada modulo es idempotente (re-ejecutable sin romper nada).
- Para uso desatendido (CI, despliegue masivo) usar el modo por defecto
  (sin `-Interactive`).
- Despues de instalar, solo queda reiniciar OpenCode para que cargue el
  servidor MCP, el system prompt, los plugins y los MCP.
