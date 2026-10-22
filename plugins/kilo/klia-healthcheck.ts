import { spawn } from 'child_process';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import * as path from 'path';

// Plugin ligero de health-check para KiloCode: dispara el chequeo central
// dist/scripts/health-check.js una vez por arranque y nunca interfiere con
// el flujo de mensajes. Toda la logica vive en el runtime global.

const LOCAL_APP_DATA = (process.env.LOCALAPPDATA ?? '').replace(/\\/g, '/')
const KLIA_INSTALL_DIR = process.env.KLIA_PROJECT_ROOT ?? (LOCAL_APP_DATA ? LOCAL_APP_DATA + '/klia-token-optimizer' : '')

function kliaHome(): string {
  return process.env.KLIA_HOME ?? homedir().replace(/\\/g, '/') + '/.klia'
}

function dbg(message: string): void {
  try {
    const logDir = kliaHome() + '/logs'
    mkdirSync(logDir, { recursive: true })
    appendFileSync(logDir + '/healthcheck-debug.log', new Date().toISOString() + ' ' + message + '\n')
  } catch {
    // log best-effort
  }
}

// Popup directo (solo si ni siquiera existe health-check.js: instalacion rota).
function popupFail(message: string): void {
  const encoded = Buffer.from(message, 'utf8').toString('base64')
  const command =
    "$m=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" +
    encoded +
    "'));(New-Object -ComObject WScript.Shell).Popup($m,10,'KLIA Token Optimizer',48)|Out-Null"
  try {
    const child = spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', command], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
  } catch {
    // popup opcional
  }
}

function resolveHealthScript(): string {
  const routerCli =
    process.env.KLIA_ROUTER_CLI_PATH ||
    (KLIA_INSTALL_DIR ? KLIA_INSTALL_DIR + '/dist/router-cli.js' : '')
  if (routerCli) {
    const candidate = path.join(path.dirname(routerCli), 'scripts', 'health-check.js')
    if (existsSync(candidate)) return candidate
  }
  return ''
}

function triggerHealthCheck(): void {
  if (process.env.KLIA_HEALTH_DISABLE === '1' || process.env.HEALTH_DISABLE === '1') return
  const script = resolveHealthScript()
  if (!script) {
    dbg('health-check.js no encontrado junto a router-cli.js; instalacion incompleta')
    popupFail('KLIA Token Optimizer: instalacion incompleta\nNo se encuentra health-check.js en el runtime global.\nReinstala con install_klia_tokens.ps1')
    return
  }
  try {
    const child = spawn(process.execPath, [script, '--popup'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    dbg('chequeo lanzado: ' + script)
  } catch (error: any) {
    dbg('disparo fallido: ' + (error?.message ?? String(error)))
  }
}

export default {
  id: 'klia-healthcheck',
  server: async (_input: any) => {
    triggerHealthCheck()
    return {}
  },
}