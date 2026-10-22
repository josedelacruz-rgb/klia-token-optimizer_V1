import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn, spawnSync } from 'child_process';
import { stripBom, writeFileSyncAtomic } from '../utils/json';

// Chequeo global de salud del stack KLIA Token Optimizer.
// Lo invocan los plugins finos (klia-healthcheck) de OpenCode v1/v2 y KiloCode
// en cada arranque del host; concentra toda la logica para que los plugins
// sean triviales. Puede ejecutarse a mano con:
//   node dist/scripts/health-check.js [--json] [--popup] [--force]
//        [--interval-hours N] [--timeout MS] [--no-popup]

const HOME = os.homedir().replace(/\\/g, '/');
const LOCAL_APP_DATA = (process.env.LOCALAPPDATA ?? '').replace(/\\/g, '/');

export type HealthStatus = 'ok' | 'warn' | 'fail';

export interface CheckResult {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
}

export interface HealthReport {
  status: HealthStatus;
  generatedAt: string;
  cached: boolean;
  checks: CheckResult[];
  summary: { ok: number; warn: number; fail: number };
}

export interface HealthState {
  lastRunAt: string;
  status: HealthStatus;
  okCount: number;
  failedCount: number;
  warnCount: number;
  lastMessage: string;
  lastPopupAt?: string;
  runs: number;
}

export const DEFAULT_INTERVAL_HOURS = 24;
export const DEFAULT_BIN_TIMEOUT_MS = 10000;
export const DEFAULT_POPUP_TIMEOUT_SECONDS = 10;
export const MIN_NODE_VERSION = [22, 5, 0];

// ---------------------------------------------------------------- helpers puros

export function severityOf(results: CheckResult[]): HealthStatus {
  if (results.some((r) => r.status === 'fail')) return 'fail';
  if (results.some((r) => r.status === 'warn')) return 'warn';
  return 'ok';
}

export function summarize(results: CheckResult[]): { ok: number; warn: number; fail: number } {
  const summary = { ok: 0, warn: 0, fail: 0 };
  for (const r of results) summary[r.status] += 1;
  return summary;
}

export type PopupPolicy = 'always' | 'fail-only' | 'off';

export function parsePopupPolicy(value: string | undefined): PopupPolicy {
  const normalized = (value ?? 'always').trim().toLowerCase();
  if (normalized === 'fail-only' || normalized === 'off') return normalized;
  return 'always';
}

// Decide si este arranque debe mostrar el popup del sistema.
// - Un run cacheado (dentro del intervalo) no abre popup salvo --popup explicito.
// - fail-only solo avisa cuando el estado es 'fail'.
// - off y noPopupFlag silencian el popup.
export function decidePopup(input: {
  policy: PopupPolicy;
  status: HealthStatus;
  cached: boolean;
  popupFlag: boolean;
  noPopupFlag: boolean;
  disabled: boolean;
}): boolean {
  if (input.disabled || input.noPopupFlag) return false;
  if (input.policy === 'off') return false;
  if (input.cached && !input.popupFlag) return false;
  if (input.policy === 'fail-only') return input.status === 'fail';
  return true;
}

// Mensaje plano para WScript.Shell.Popup; sin emojis para evitar problemas de raster.
export function formatPopupMessage(
  status: HealthStatus,
  results: CheckResult[],
  maxIssues = 6,
): string {
  const fails = results.filter((r) => r.status === 'fail');
  const warns = results.filter((r) => r.status === 'warn');
  const lines: string[] = [];
  if (status === 'fail') {
    lines.push('KLIA Token Optimizer: problemas detectados');
  } else if (status === 'warn') {
    lines.push('KLIA Token Optimizer: funcionando con avisos');
  } else {
    lines.push('KLIA Token Optimizer: todo funciona bien');
  }
  const issues = [...fails, ...warns].slice(0, maxIssues);
  for (const issue of issues) {
    const tag = issue.status === 'fail' ? '[FALLO]' : '[AVISO]';
    lines.push(`${tag} ${issue.label}: ${issue.detail}`);
  }
  if (fails.length + warns.length > maxIssues) {
    lines.push(`(y ${fails.length + warns.length - maxIssues} mas)`);
  }
  if (issues.length === 0) {
    lines.push(`Chequeo completo: ${results.length} verificaciones correctas`);
  }
  return lines.join('\n');
}

// Elimina comentarios // y /* */ sin romper las cadenas ("://" aparece en URLs).
export function stripJsonComments(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1] ?? '';
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      // consumir hasta fin de linea
      while (i < text.length && text[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 1; // salta '/'
      continue;
    }
    out += ch;
  }
  return out;
}

// Detecta `"mcp": { ... "repomix": { ... }` en opencode.jsonc / kilo.jsonc.
export function hasMcpEntry(cleanText: string, name: string): boolean {
  const pattern = new RegExp(`"${name}"\\s*:\\s*\\{`);
  return pattern.test(cleanText);
}

// ---------------------------------------------------------------- resolucion de rutas

export interface RuntimeCliResolution {
  path: string;
  candidates: string[];
  exists: boolean;
}

// Mismo orden que los plugins router-inject: env explicito, runtime global, proyecto.
export function resolveRuntimeCli(env: NodeJS.ProcessEnv = process.env): RuntimeCliResolution {
  const localAppData = (env.LOCALAPPDATA ?? LOCAL_APP_DATA).trim() === '' ? '' : (env.LOCALAPPDATA ?? LOCAL_APP_DATA).replace(/\\/g, '/');
  const candidates = [
    env.KLIA_ROUTER_CLI_PATH ?? '',
    localAppData ? `${localAppData}/klia-token-optimizer/dist/router-cli.js` : '',
    env.KLIA_PROJECT_ROOT ? `${env.KLIA_PROJECT_ROOT.replace(/\\/g, '/')}/dist/router-cli.js` : '',
  ].filter((c) => c.length > 0);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { path: candidate, candidates, exists: true };
    }
  }
  return { path: candidates[0] ?? '', candidates, exists: false };
}

// Orden documentado de ROUTER_EVENTS_PATH: explicito > env > KLIA_STORE_DIR >
// KLIA_HOME > ~/.klia/data > legacy .router-history en cwd.
export function resolveEventsCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const kliaHome = (env.KLIA_HOME ?? `${HOME}/.klia`).replace(/\\/g, '/');
  const candidates = [
    env.ROUTER_EVENTS_PATH ?? '',
    env.KLIA_STORE_DIR ? `${env.KLIA_STORE_DIR}/events.json` : '',
    env.KLIA_HOME ? `${env.KLIA_HOME}/data/events.json` : '',
    `${kliaHome}/data/events.json`,
    `${process.cwd().replace(/\\/g, '/')}/.router-history/events.json`,
  ];
  // dedup conservando orden
  return Array.from(new Set(candidates.filter((c) => c.length > 0)));
}

function checkEventsWritable(candidates: string[]): CheckResult {
  for (const candidate of candidates) {
    const dir = path.dirname(candidate);
    if (!fs.existsSync(dir)) continue;
    const probe = path.join(dir, '.klia-health-probe');
    try {
      fs.writeFileSync(probe, 'x');
      fs.rmSync(probe, { force: true });
      const exists = fs.existsSync(candidate);
      return {
        id: 'events-store',
        label: 'Almacen de eventos',
        status: 'ok',
        detail: exists ? `editable: ${candidate}` : `directorio listo (se creara en ${candidate})`,
      };
    } catch (error) {
      return {
        id: 'events-store',
        label: 'Almacen de eventos',
        status: 'fail',
        detail: `sin permisos de escritura en ${dir}: ${(error as Error).message}`,
      };
    }
  }
  return {
    id: 'events-store',
    label: 'Almacen de eventos',
    status: 'warn',
    detail: 'ningun candidato existe todavia; se creara con la primera ejecucion',
  };
}

function checkNodeVersion(minimum: number[] = MIN_NODE_VERSION): CheckResult {
  const parts = process.versions.node.split('.').map((p) => Number.parseInt(p, 10));
  const [major = 0, minor = 0] = parts;
  const [minMajor, minMinor] = minimum;
  const version = process.versions.node;
  if (major > minMajor || (major === minMajor && minor >= minMinor)) {
    return { id: 'node', label: 'Node.js', status: 'ok', detail: `v${version}` };
  }
  return {
    id: 'node',
    label: 'Node.js',
    status: 'fail',
    detail: `v${version} por debajo del minimo ${minMajor}.${minMinor}`,
  };
}

function candidateConfigPaths(): string[] {
  return [
    `${HOME}/.config/opencode/opencode.jsonc`,
    `${HOME}/.config/opencode/opencode.json`,
    (process.env.APPDATA ?? '').replace(/\\/g, '/')
      ? `${(process.env.APPDATA ?? '').replace(/\\/g, '/')}/opencode/opencode.jsonc`
      : '',
    `${HOME}/.config/kilo/kilo.jsonc`,
    `${HOME}/.config/kilo/kilo.json`,
    `${HOME}/.config/kilo/config.json`,
  ].filter((c) => c.length > 0);
}

function checkMcpEntries(names: string[] = ['repomix', 'semble']): CheckResult[] {
  const configs = candidateConfigPaths().filter((c) => fs.existsSync(c));
  return names.map((name) => {
    const foundIn: string[] = [];
    for (const configPath of configs) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        const clean = stripJsonComments(stripBom(raw));
        if (hasMcpEntry(clean, name)) foundIn.push(configPath);
      } catch {
        // fichero ilegible: se ignora, otros candidatos pueden responder
      }
    }
    if (foundIn.length > 0) {
      return {
        id: `mcp-${name}`,
        label: `MCP ${name}`,
        status: 'ok' as HealthStatus,
        detail: `registrado en ${foundIn.length} config(s)`,
      };
    }
    return {
      id: `mcp-${name}`,
      label: `MCP ${name}`,
      status: 'warn' as HealthStatus,
      detail: 'no aparece en ninguna config de OpenCode/Kilo',
    };
  });
}

function checkBinaries(names: string[] = ['rtk', 'repomix', 'semble'], timeoutMs: number = DEFAULT_BIN_TIMEOUT_MS): CheckResult[] {
  const shell = process.platform === 'win32';
  return names.map((name) => {
    try {
      // Unica cadena con shell:true (DEP0190) para resolver .cmd/.ps1 en PATH.
      const result = spawnSync(`${name} --version`, {
        encoding: 'utf8',
        timeout: timeoutMs,
        windowsHide: true,
        shell,
      });
      if (result.status === 0) {
        const version = (result.stdout ?? '').trim().split(/\r?\n/)[0] || 'ok';
        return { id: `bin-${name}`, label: `Binario ${name}`, status: 'ok' as HealthStatus, detail: version };
      }
      const detail = result.error ? `${(result.error as NodeJS.ErrnoException).code ?? result.error.message}` : `exit ${result.status}`;
      return { id: `bin-${name}`, label: `Binario ${name}`, status: 'warn' as HealthStatus, detail };
    } catch (error) {
      return {
        id: `bin-${name}`,
        label: `Binario ${name}`,
        status: 'warn' as HealthStatus,
        detail: (error as Error).message,
      };
    }
  });
}

interface PluginDirSpec {
  label: string;
  dir: string;
}

function candidatePluginDirs(): PluginDirSpec[] {
  const appData = (process.env.APPDATA ?? '').replace(/\\/g, '/');
  return [
    { label: 'Kilo', dir: `${HOME}/.config/kilo/plugin` },
    { label: 'OpenCode v1', dir: `${HOME}/.config/opencode/plugin` },
    { label: 'OpenCode v2', dir: `${HOME}/.config/opencode/plugins` },
    ...(appData ? [{ label: 'OpenCode (AppData)', dir: `${appData}/opencode/plugins` }] : []),
  ];
}

const PLUGIN_FILE_NAMES = ['klia-router-inject.ts', 'klia-auto-record.ts', 'klia-healthcheck.ts'];

function checkPluginFiles(required: string[] = PLUGIN_FILE_NAMES): CheckResult {
  const dirs = candidatePluginDirs().filter((spec) => fs.existsSync(spec.dir));
  if (dirs.length === 0) {
    return {
      id: 'plugins',
      label: 'Plugins de host',
      status: 'warn',
      detail: 'ningun directorio de plugins presente',
    };
  }
  const missing: string[] = [];
  for (const fileName of required) {
    const present = dirs.some((spec) => fs.existsSync(path.join(spec.dir, fileName)));
    if (!present) missing.push(fileName);
  }
  if (missing.length === 0) {
    return {
      id: 'plugins',
      label: 'Plugins de host',
      status: 'ok',
      detail: `${dirs.length} dir(s) con los ${required.length} plugins`,
    };
  }
  return {
    id: 'plugins',
    label: 'Plugins de host',
    status: 'warn',
    detail: `faltan ${missing.join(', ')}`,
  };
}

// ---------------------------------------------------------------- ciclo completo

export function resolveStatePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.KLIA_HEALTH_STATE_PATH) return env.KLIA_HEALTH_STATE_PATH;
  const kliaHome = env.KLIA_HOME ?? `${HOME}/.klia`;
  const storeDir = env.KLIA_STORE_DIR ?? `${kliaHome}/data`;
  return `${String(storeDir).replace(/\\/g, '/')}/health-state.json`;
}

export function loadHealthState(statePath: string): HealthState | null {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(stripBom(raw)) as HealthState;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.lastRunAt !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isWithinInterval(state: HealthState | null, intervalHours: number, now = new Date()): boolean {
  if (!state) return false;
  const last = Date.parse(state.lastRunAt);
  if (!Number.isFinite(last)) return false;
  return now.getTime() - last < intervalHours * 3600_000;
}

export function saveHealthState(statePath: string, state: HealthState): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSyncAtomic(statePath, JSON.stringify(state, null, 2));
}

export async function runFullCheck(
  options: { timeoutMs?: number } = {},
): Promise<HealthReport> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_BIN_TIMEOUT_MS;
  const checks: CheckResult[] = [];

  checks.push(checkNodeVersion());
  const runtime = resolveRuntimeCli();
  checks.push({
    id: 'runtime-cli',
    label: 'Router CLI (runtime global)',
    status: runtime.exists ? 'ok' : 'fail',
    detail: runtime.exists ? runtime.path : `no se encuentra router-cli.js (probados: ${runtime.candidates.join(', ') || 'ninguno'})`,
  });
  checks.push(checkEventsWritable(resolveEventsCandidates()));
  checks.push(...checkMcpEntries());
  checks.push(...checkBinaries(undefined, timeoutMs));
  checks.push(checkPluginFiles());

  return {
    status: severityOf(checks),
    generatedAt: new Date().toISOString(),
    cached: false,
    checks,
    summary: summarize(checks),
  };
}

// ---------------------------------------------------------------- popup del sistema

export function buildPopupCommand(message: string, timeoutSeconds: number): string {
  const encoded = Buffer.from(message, 'utf8').toString('base64');
  return (
    "$m=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" +
    encoded +
    "'));(New-Object -ComObject WScript.Shell).Popup($m," +
    timeoutSeconds +
    ",'KLIA Token Optimizer',64)|Out-Null"
  );
}

export function showSystemPopup(message: string, timeoutSeconds: number = DEFAULT_POPUP_TIMEOUT_SECONDS): void {
  if (process.platform !== 'win32') return;
  try {
    const child = spawn(
      'powershell',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', buildPopupCommand(message, timeoutSeconds)],
      { detached: true, stdio: 'ignore', windowsHide: true },
    );
    child.unref();
  } catch {
    // el popup es opcional: nunca debe romper la ejecucion del CLI
  }
}

// ---------------------------------------------------------------- salida de texto

function textLine(result: CheckResult): string {
  const tag = result.status === 'ok' ? '[OK]   ' : result.status === 'warn' ? '[AVISO]' : '[FALLO]';
  return `  ${tag} ${result.label}: ${result.detail}`;
}

function formatTextReport(report: HealthReport): string {
  const head =
    report.status === 'fail'
      ? 'KLIA health-check: FALLO'
      : report.status === 'warn'
        ? 'KLIA health-check: avisos'
        : 'KLIA health-check: todo bien';
  const lines = [
    head,
    ...report.checks.map(textLine),
    `Resumen: ${report.summary.ok} correctas, ${report.summary.warn} avisos, ${report.summary.fail} fallos`
      + (report.cached ? ' (cacheado)' : ''),
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------- CLI

async function runHealthCheckCli(argv: string[]): Promise<void> {
  let jsonOutput = false;
  let popupFlag = false;
  let noPopup = false;
  let force = false;
  let intervalHours = DEFAULT_INTERVAL_HOURS;
  let timeoutMs = DEFAULT_BIN_TIMEOUT_MS;
  const env = process.env;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--json':
        jsonOutput = true;
        break;
      case '--popup':
        popupFlag = true;
        break;
      case '--no-popup':
        noPopup = true;
        break;
      case '--force':
        force = true;
        break;
      case '--interval-hours': {
        const value = Number(argv[i + 1]);
        if (Number.isFinite(value) && value >= 0) intervalHours = value;
        i += 1;
        break;
      }
      case '--timeout': {
        const value = Number(argv[i + 1]);
        if (Number.isFinite(value) && value > 0) timeoutMs = value;
        i += 1;
        break;
      }
      case '--help':
        console.log(
          [
            'Uso: node dist/scripts/health-check.js [opciones]',
            '  --json               salida JSON',
            '  --popup              fuerza el popup aunque el chequeo venga cacheado',
            '  --no-popup           silencia el popup en este run',
            '  --force              ignora el intervalo de refresco',
            '  --interval-hours N   intervalo de cache (defecto 24)',
            '  --timeout MS         timeout de los binarios (defecto 5000)',
          ].join('\n'),
        );
        return;
      default:
        break;
    }
  }

  if (env.KLIA_HEALTH_DISABLE === '1' || env.KLIA_HEALTH_DISABLE === 'true') {
    if (jsonOutput) console.log(JSON.stringify({ skipped: true, reason: 'KLIA_HEALTH_DISABLE' }));
    return;
  }
  if (env.HEALTH_DISABLE === '1' || env.HEALTH_DISABLE === 'true') {
    if (jsonOutput) console.log(JSON.stringify({ skipped: true, reason: 'HEALTH_DISABLE' }));
    return;
  }

  intervalHours = Number(env.KLIA_HEALTH_HOURS ?? intervalHours) || intervalHours;
  timeoutMs = Number(env.KLIA_HEALTH_TIMEOUT ?? timeoutMs) || timeoutMs;
  const popupTimeoutSeconds = Number(env.KLIA_HEALTH_POPUP_TIMEOUT ?? DEFAULT_POPUP_TIMEOUT_SECONDS) || DEFAULT_POPUP_TIMEOUT_SECONDS;
  const policy = parsePopupPolicy(env.KLIA_HEALTH_POPUP);

  const statePath = resolveStatePath(env);
  const state = loadHealthState(statePath);
  const cached = !force && isWithinInterval(state, intervalHours);

  let report: HealthReport;
  let newState: HealthState;
  if (cached && state) {
    report = {
      status: state.status,
      generatedAt: state.lastRunAt,
      cached: true,
      checks: [],
      summary: { ok: state.okCount ?? 0, warn: state.warnCount, fail: state.failedCount },
    };
    newState = state;
    newState.runs = (state.runs ?? 0) + 1;
  } else {
    report = await runFullCheck({ timeoutMs });
    const previousPopupAt = state?.lastPopupAt;
    newState = {
      lastRunAt: report.generatedAt,
      status: report.status,
      okCount: report.summary.ok,
      failedCount: report.summary.fail,
      warnCount: report.summary.warn,
      lastMessage: formatPopupMessage(report.status, report.checks),
      runs: (state?.runs ?? 0) + 1,
    };
    if (previousPopupAt) newState.lastPopupAt = previousPopupAt;
    try {
      saveHealthState(statePath, newState);
    } catch {
      // el estado es opcional: si no se puede escribir, el chequeo sigue valido
    }
  }

  const shouldPopup = decidePopup({
    policy,
    status: report.status,
    cached: report.cached,
    popupFlag,
    noPopupFlag: noPopup,
    disabled: false,
  });
  if (shouldPopup && !report.cached) {
    showSystemPopup(formatPopupMessage(report.status, report.checks), popupTimeoutSeconds);
    newState.lastPopupAt = new Date().toISOString();
    try {
      saveHealthState(statePath, newState);
    } catch {
      // igual que arriba: opcional
    }
  } else if (shouldPopup && report.cached) {
    // popup explicito sobre estado cacheado: se muestra el ultimo mensaje
    showSystemPopup(state?.lastMessage ?? formatPopupMessage(report.status, report.checks), popupTimeoutSeconds);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatTextReport(report));
  }
  if (report.status === 'fail') {
    process.exitCode = 1;
  }
}

// Punto de entrada directo (npm run router no lo encadena; es standalone).
if (require.main === module) {
  runHealthCheckCli(process.argv.slice(2)).catch(() => {
    process.exitCode = 1;
  });
}