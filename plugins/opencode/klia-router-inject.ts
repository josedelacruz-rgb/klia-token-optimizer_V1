/**
 * Plugin de OpenCode: klia-router-inject (adaptador OpenCode)
 *
 * OpenCode usa la API de plugins V2: el modulo exporta una funcion
 * `Plugin` que recibe el contexto y devuelve el objeto de hooks. KiloCode
 * usa la API V1 ({ id, server }); por eso existen dos ficheros con la misma
 * logica:
 *   - plugins/kilo/klia-router-inject.ts     (KiloCode, export default V1)
 *   - plugins/opencode/klia-router-inject.ts (OpenCode, export const V2)
 *
 * Este fichero es un port mecanico del de KiloCode: solo cambian el
 * encabezado (imports y export final). Cualquier cambio en la politica de
 * inyeccion debe aplicarse a los dos ficheros.
 *
 * En cada mensaje del usuario clasifica la tarea con klia-token-optimizer
 * (via dist/router-cli.js) usando el hook "chat.message" e inyecta una
 * directiva compacta con el aplicativo a usar.
 *
 * Politica de inyeccion (mapa saver-first, Saver-Direct):
 *   - Tareas PEQUENAS o SIN saver (BASELINE, gate refused, SMALL_CODE/UNKNOWN):
 *     NO se anade NADA al prompt, la tarea corre identica a una sesion
 *     opencode directa; refused con pinta de peticion de codigo ademas recibe
 *     la pre-busqueda de Semble pre-computada en el prompt.
 *   - El resto de tareas (el router recomienda un optimizador != BASELINE) se
 *     resuelven usando DIRECTAMENTE ese aplicativo (RTK/SEMBLE/REPOMIX/
 *     CONTEXT_MODE/DCP). En todos los casos se evita pasar por el MCP
 *     klia-token-optimizer (route_task): cargar los servidores MCP anade un
 *     overhead fijo por sesion (~2.5-3.5k tokens) que penaliza en tareas de un
 *     solo paso; los aplicativos directos son los que ahorran de verdad.
 */

import type { Plugin } from '@opencode-ai/plugin'

import { spawn } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

// Directorio de instalacion del programa (para localizar el CLI compilado).
// Resolucion 100% en tiempo de ejecucion: nunca rutas absolutas fixes, para
// que el mismo plugin sirva en cualquier maquina. El runtime global se
// publica en %LOCALAPPDATA%\klia-token-optimizer (ver install_klia_tokens.ps1,
// FASE 13), que es la ruta que el plugin busca y la que borra el uninstaller.
const LOCAL_APP_DATA = (process.env.LOCALAPPDATA ?? '').replace(/\\/g, '/')
const KLIA_INSTALL_DIR =
  process.env.KLIA_PROJECT_ROOT ??
  (LOCAL_APP_DATA ? LOCAL_APP_DATA + '/klia-token-optimizer' : '')
const PROJECT_ROOT = KLIA_INSTALL_DIR
const PROJECT_ROUTER_CLI = PROJECT_ROOT ? PROJECT_ROOT + '/dist/router-cli.js' : ''

// Store y logs GLOBALES, independientes del proyecto: %USERPROFILE%/.klia
const KLIA_HOME = process.env.KLIA_HOME ?? homedir() + '/.klia'
const KLIA_STORE_DIR = process.env.KLIA_STORE_DIR ?? KLIA_HOME + '/data'
const KLIA_LOG_DIR = KLIA_HOME + '/logs'
const KLIA_DEBUG_LOG = KLIA_LOG_DIR + '/router-inject-debug.log'
const KLIA_ERROR_LOG = KLIA_LOG_DIR + '/router-inject-error.log'
const KLIA_PENDING_FILE = KLIA_STORE_DIR + '/.router-pending.json'
const KLIA_HISTORY_PATH = KLIA_STORE_DIR + '/history.json'
const KLIA_EVENTS_PATH = KLIA_STORE_DIR + '/events.json'
const KLIA_CLASS_STATE_FILE = KLIA_STORE_DIR + '/.klia-class-state.json'
const MARKER = '[KLIA]'

function ensureDir(filePath: string): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true })
  } catch {}
}

function dbg(msg: string): void {
  try {
    ensureDir(KLIA_DEBUG_LOG)
    appendFileSync(KLIA_DEBUG_LOG, new Date().toISOString() + ' ' + msg + '\n')
  } catch {}
}

// Log de errores: el fallo del router NUNCA debe ser silencioso. Un error
// aqui significa que el plugin no inyecta directivas [KLIA] y el usuario no
// entiende por que. Se escribe aparte para que el diagnostico no se mezcle
// con el trace de ejecucion.
function errDbg(msg: string): void {
  try {
    ensureDir(KLIA_ERROR_LOG)
    appendFileSync(KLIA_ERROR_LOG, new Date().toISOString() + ' ' + msg + '\n')
  } catch {}
  dbg('ERROR ' + msg)
}

// Conjunto de optimizadores que se aplican como un aplicativo directo.
const DIRECT_OPTIMIZERS = ['RTK', 'SEMBLE', 'REPOMIX', 'CONTEXT_MODE', 'DCP'] as const

// Instrucciones compactas por saver (~8-12 tokens cada una).
const DIRECTIVE_TEXT: Record<'RTK' | 'SEMBLE' | 'REPOMIX' | 'CONTEXT_MODE' | 'DCP', string> = {
  RTK: 'usa EXCLUSIVAMENTE comandos directos (RTK comprime la salida)',
  SEMBLE: 'usa EXCLUSIVAMENTE semble.search por intencion; si tarda mas de 15s, grep',
  REPOMIX: 'usa EXCLUSIVAMENTE repomix --compress por defecto',
  CONTEXT_MODE: 'usa EXCLUSIVAMENTE ctx_search sobre el indice',
  DCP: 'usa EXCLUSIVAMENTE DCP poda el contexto entre pasos',
}

const NO_ROUTER = '. Sin route_task.'
// BASELINE/SMALL_CODE/UNKNOWN no reciben NINGUNA inyeccion: la sesion es
// identica a una sesion kilocode directa (0 tokens de overhead sin saver).

// Gate refused con pinta de peticion real de codigo: longitud minima y
// vocabulario de codigo. Solo estas reciben la busqueda pre-computada de
// Semble; "como va" o "haz commit" se quedan 100% nativas (sin inyeccion).
const REFUSED_MIN_QUERY_CHARS = 40
const REFUSED_CODE_HINT_RE =
  /\b(funcion|funci[oó]n|function|clase|class|tipo|type|interfaz|interface|variable|constante|modulo|m[oó]dulo|archivo|archivos|fichero|ficheros|busca|buscar|encuentra|d[oó]nde|referencias|usos|usada|usado|llamadas|lista|define|implementa|ejemplo|errores?|exception|regex|explica|muestra|como funciona|que hace|como se usa|estructura)\b/i

function refusedMayBenefitFromSearch(query: string): boolean {
  const q = String(query ?? '')
  if (q.length < REFUSED_MIN_QUERY_CHARS) return false
  return REFUSED_CODE_HINT_RE.test(q)
}

/**
 * Saver directo que corresponde a la tarea: si el router recomienda un saver
 * real (!= BASELINE) manda ese; si el router dice BASELINE, se aplica el mapa
 * por tipo; si el tipo es trivial (SMALL_CODE/UNKNOWN) la tarea es nativa.
 */
function resolvedSaverFor(optimizer: string): string | null {
  if ((DIRECT_OPTIMIZERS as readonly string[]).includes(optimizer)) return optimizer
  return null
}

/**
 * Construye la directiva compacta que se anade al prompt, o null si no procede.
 * Es una funcion pura (optimizer, taskType) -> string|null.
 */
function buildDirective(optimizer: string, taskType: string): string | null {
  // Solo los savers con aplicativo inyectan directiva. BASELINE/SMALL_CODE/
  // UNKNOWN no inyectan NADA: 0 overhead de prompt cuando no hay saver.
  const saver = resolvedSaverFor(optimizer)
  if (saver) {
    const text = DIRECTIVE_TEXT[saver as keyof typeof DIRECTIVE_TEXT]
    return MARKER + ' ' + taskType + ': ' + text + NO_ROUTER
  }
  return null
}

// Dedup por sesion: si la directiva es identica a la ultima inyectada en la
// sesion, no se vuelve a pagar. Cap 200 anti-fugas.
const lastInjects = new Map<string, string>()
const MAX_LAST_INJECTS = 200

function shouldInject(sessionID: string, directive: string): boolean {
  if (lastInjects.get(sessionID) === directive) return false
  if (lastInjects.size >= MAX_LAST_INJECTS) {
    const first = lastInjects.keys().next().value
    if (first !== undefined) lastInjects.delete(first)
  }
  lastInjects.set(sessionID, directive)
  return true
}

// LRU cache con limite de 100 entradas para evitar memory leak.
// LRU cache con limite de 100 entradas para evitar memory leak.
// Solo se cachean los ACIERTOS: cachear un fallo (timeout del CLI, router
// no disponible) congelaria la ausencia de decision para esa query durante
// toda la vida del cache, sin volver a preguntar al router.
interface CachedDecision {
  optimizer: string
  taskType: string
  ts: number
  refused?: boolean
}
const recCache = new Map<string, CachedDecision>()
const MAX_CACHE_SIZE = 100
// TTL corto: el router aprende del historico, asi que una decision cacheada
// hace de media hora puede ser peor que la que daria el router ahora.
const REC_CACHE_TTL_MS = 5 * 60_000

function sanitizeQuery(q: string): string {
  return q.slice(0, 2000).replace(/[\x00-\x1f\x7f]/g, ' ')
}

// Resultado de buscar el CLI del router: no basta con la ruta, hay que saber
// SI EXISTE. Antes el plugin resolvia la ruta a ciegas y, si el fichero no
// estaba, el spawn fallaba en silencio (sin directivas y sin aviso).
interface RouterCliResolution {
  path: string
  exists: boolean
  candidates: string[]
}

function resolveRouterCli(): RouterCliResolution {
  const candidates = [
    process.env.KLIA_ROUTER_CLI_PATH,
    LOCAL_APP_DATA ? LOCAL_APP_DATA + '/klia-token-optimizer/dist/router-cli.js' : '',
    PROJECT_ROUTER_CLI,
  ].filter((c): c is string => !!c)
  for (const c of candidates) {
    try {
      if (existsSync(c)) return { path: c, exists: true, candidates }
    } catch {}
  }
  return { path: candidates[0] ?? '', exists: false, candidates }
}

// Modelo por defecto: el que declara la config global de Kilo, o el que
// reporta el propio hook.
function resolveDefaultModel(model?: { providerID?: string; modelID?: string }): string {
  if (model?.providerID && model?.modelID) return model.providerID + '/' + model.modelID
  try {
    const base = (process.env.USERPROFILE ?? process.env.HOME ?? homedir()) + '/.config/kilo'
    for (const name of ['kilo.jsonc', 'kilo.json', 'opencode.jsonc', 'opencode.json']) {
      const cfg = base + '/' + name
      if (!existsSync(cfg)) continue
      const parsed = JSON.parse(readFileSync(cfg, 'utf8').replace(/^\s*\/\/.*$/gm, ''))
      if (parsed?.model && typeof parsed.model === 'string') return parsed.model
    }
  } catch {}
  return process.env.KLIA_DEFAULT_MODEL ?? 'klia/deepseek-v4-flash-demo'
}

// Resultado de ejecutar el CLI: se conserva stderr y el error de spawn para
// poder distinguir "el router no existe" de "el router no ha dicho nada".
interface CaptureResult {
  out: string
  err: string
  spawnError: string | null
  timedOut: boolean
}

function runCapture(cmd: string, args: string[], timeoutMs: number): Promise<CaptureResult> {
  return new Promise((resolve) => {
    let out = ''
    let err = ''
    let done = false
    let spawnError: string | null = null
    let timedOut = false
    const finish = () => {
      if (!done) {
        done = true
        resolve({ out, err, spawnError, timedOut })
      }
    }
    try {
      const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
      const timer = setTimeout(() => {
        timedOut = true
        try {
          child.kill()
        } catch {}
        finish()
      }, timeoutMs)
      child.stdout?.on('data', (d) => {
        out += String(d)
      })
      child.stderr?.on('data', (d) => {
        err += String(d)
      })
      child.on('error', (e: any) => {
        spawnError = String(e?.message ?? e)
        clearTimeout(timer)
        finish()
      })
      child.on('exit', () => {
        clearTimeout(timer)
        finish()
      })
    } catch (e: any) {
      spawnError = String(e?.message ?? e)
      finish()
    }
  })
}

// Identificador best-effort del repo actual (cwd del proceso del plugin).
function resolveProjectId(): string {
  try {
    const parts = process.cwd().split(/[\\/]/).filter(Boolean)
    return parts.length > 0 ? parts[parts.length - 1] : ''
  } catch {
    return ''
  }
}

// Resultado de consultar al router: la decision (si la hay) y el error
// tecnico (si no la hay). Sin este campo el plugin se callaba y el usuario
// no tenia forma de saber que el router no estaba disponible.
interface RouteOutcome {
  rec: { optimizer: string; taskType: string; refused?: boolean } | null
  error?: string
  cliPath?: string
}

async function routeRecommendation(
  query: string,
  model: string,
  sessionID: string,
): Promise<RouteOutcome> {
  const safeQuery = sanitizeQuery(query)
  const key = model + ' ' + sessionID + ' ' + safeQuery
  const cached = recCache.get(key)
  if (cached) {
    if (Date.now() - cached.ts < REC_CACHE_TTL_MS) {
      return {
        rec: {
          optimizer: cached.optimizer,
          taskType: cached.taskType,
          ...(cached.refused ? { refused: true } : {}),
        },
      }
    }
    recCache.delete(key)
  }
  const cli = resolveRouterCli()
  if (!cli.exists) {
    const where = cli.candidates.join(' | ')
    errDbg(
      'router-cli-missing: no existe el CLI del router. Candidatos: ' +
        (where || '(ninguno)') +
        '. Reinstalar con install_klia_tokens.ps1 (publica el runtime global) o definir KLIA_ROUTER_CLI_PATH.',
    )
    return { rec: null, error: 'router-cli-missing', cliPath: cli.path }
  }
  const args = [
    cli.path,
    '--model',
    model,
    '--query',
    safeQuery,
    '--history',
    KLIA_HISTORY_PATH,
    '--events',
    KLIA_EVENTS_PATH,
    '--session-id',
    sessionID,
  ]
  const projectId = resolveProjectId()
  if (projectId) args.push('--project-id', projectId)
  // Exploracion controlada (V3): sin ella el saver nuevo nunca consigue las
  // minSamples necesarias para poder ganar la celda (deadlock de cold-start:
  // BASELINE siempre). ~10% de las queries intenta el alternativo.
  args.push('--explore')
  const capture = await runCapture(process.env.KLIA_NODE_BIN ?? 'node', args, 15000)
  const out = capture.out
  let res: { optimizer: string; taskType: string; refused?: boolean } | null = null
  try {
    const parsed = JSON.parse(out)
    // Gate refused: el router rechaza la tarea pequena ({refused:true}); la
    // decision registrada es BASELINE, pero se marca refused para que el hook
    // no inyecte directiva y pueda considerar la pre-busqueda de Semble.
    if (parsed.refused === true) {
      res = {
        optimizer:
          parsed.optimizer && typeof parsed.optimizer === 'string' ? parsed.optimizer : 'BASELINE',
        taskType: parsed.taskType && typeof parsed.taskType === 'string' ? parsed.taskType : 'SMALL_CODE',
        refused: true,
      }
    } else if (parsed.optimizer && typeof parsed.optimizer === 'string') {
      res = {
        optimizer: parsed.optimizer,
        taskType: parsed.taskType && typeof parsed.taskType === 'string' ? parsed.taskType : 'UNKNOWN',
      }
    }
  } catch {
    const opt = out.match(/OPTIMIZER=([A-Z_]+)/)
    const tt = out.match(/TASK_TYPE=([A-Z_]+)/)
    const refused = /REFUSED=true/.test(out)
    if (opt) res = { optimizer: opt[1], taskType: tt ? tt[1] : 'UNKNOWN', ...(refused ? { refused: true } : {}) }
  }
  if (!res) {
    // Sin decision: hay que decir POR QUE (CLI que no arranca, timeout,
    // salida vacia). Antes esto terminaba en un "sin recomendacion" mudo.
    if (capture.spawnError) {
      errDbg('router-cli-spawn: ' + capture.spawnError)
      return { rec: null, error: 'router-cli-spawn: ' + capture.spawnError, cliPath: cli.path }
    }
    if (capture.timedOut) {
      errDbg('router-cli-timeout: el router no respondio en 15s')
      return { rec: null, error: 'router-cli-timeout', cliPath: cli.path }
    }
    const stderrTail = capture.err.trim().split('\n').slice(-3).join(' | ')
    errDbg(
      'router-cli-sin-salida: el router no devolvio decision. stderr=' +
        (stderrTail || '(vacio)') +
        ' stdout=' +
        (out.trim().slice(0, 200) || '(vacio)'),
    )
    return { rec: null, error: 'router-cli-sin-salida', cliPath: cli.path }
  }
  if (recCache.size >= MAX_CACHE_SIZE) {
    const firstKey = recCache.keys().next().value
    if (firstKey !== undefined) recCache.delete(firstKey)
  }
  // Solo se cachean los aciertos (ver comentario de recCache).
  recCache.set(key, {
    optimizer: res.optimizer,
    taskType: res.taskType,
    ts: Date.now(),
    ...(res.refused ? { refused: true } : {}),
  })
  return { rec: res }
}

// Aviso anadido al prompt cuando se detecta un re-prompt.
const RETRY_NOTICE =
  '[KLIA] RETRY: prompt similar ya ejecutado hace poco y el resultado no sirvio; cambia de enfoque.'

const DEFAULT_REPROMPT_WINDOW_MINUTES = 30

// Cabecera de la seccion de contexto podado dentro del prompt.
const PRUNED_HEADER = '[KLIA] Contexto podado (resultados de busqueda ya filtrados):\n'

// ---------------------------------------------------------------------------
// Resolucion del ejecutable de Semble.
//
// En Windows el script de consola de Python (semble.exe) suele vivir en
// %APPDATA%\Python\PythonXY\Scripts o en ~/.local\bin, y NO siempre esta en el
// PATH del proceso que lanza OpenCode. Se resuelven esas rutas conocidas
// ANTES de recurrir al PATH, sin pasar por cmd.exe: `spawn` con shell:true
// expondría el --query del usuario a cmd.exe (riesgo de ejecucion de comandos).
// ---------------------------------------------------------------------------
let sembleBinCache: string | null = null
// Valor de KLIA_SEMBLE_BIN con el que se resolvio la cache: si cambia, se
// vuelve a buscar el binario.
let sembleBinCacheFor: string | undefined = undefined;

function sembleCandidatePaths(): string[] {
  const out: string[] = [];
  if (process.env.KLIA_SEMBLE_BIN) out.push(process.env.KLIA_SEMBLE_BIN);
  const home = process.env.USERPROFILE ?? process.env.HOME ?? homedir();
  if (home) {
    out.push(join(home, '.local', 'bin', 'semble.exe'));
    out.push(join(home, '.local', 'bin', 'semble'));
  }
  // Consola de Python: %APPDATA%\Python\PythonXY\Scripts\semble.exe
  const appData = process.env.APPDATA;
  if (appData) {
    const pythonRoot = join(appData, 'Python');
    try {
      for (const entry of readdirSync(pythonRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        out.push(join(pythonRoot, entry.name, 'Scripts', 'semble.exe'));
      }
    } catch {
      // no hay %APPDATA%\Python: se ignora
    }
  }
  return out;
}

/**
 * Ruta absoluta del ejecutable de Semble si se encuentra en una ubicacion
 * conocida; si no, el nombre plano para que spawn lo resuelva en el PATH.
 */
function resolveSembleCommand(): string {
  // Si cambia el override explicito, la cache deja de ser valida.
  const override = process.env.KLIA_SEMBLE_BIN
  if (override !== sembleBinCacheFor) {
    sembleBinCache = null
    sembleBinCacheFor = override
  }
  if (override) {
    try {
      if (existsSync(override)) return override
    } catch {
      // override no inspeccionable
    }
  }
  if (sembleBinCache) {
    if (sembleBinCache === 'semble' || existsSync(sembleBinCache)) return sembleBinCache
    sembleBinCache = null
  }
  for (const candidate of sembleCandidatePaths()) {
    try {
      if (candidate && existsSync(candidate)) {
        sembleBinCache = candidate
        return candidate
      }
    } catch {
      // ruta no inspeccionable: se sigue con la siguiente
    }
  }
  sembleBinCache = 'semble'
  return sembleBinCache
}

/**
 * Cita un argumento para cmd.exe.
 *
 * Solo se usa cuando el ejecutable es un script .cmd/.bat: en ese caso Node
 * necesita `shell: true` para lanzarlo en Windows. Para .exe NO se usa shell
 * en absoluto: `spawn` sin shell pasa los argumentos como argv, sin que
 * cmd.exe pueda interpretarlos (el --query del usuario nunca llega a una
 * shell).
 */
function quoteArg(value: string): string {
  const text = String(value ?? '')
  if (text === '') return '""'
  // % se expande antes de que el comando se ejecute: se neutraliza duplicando %.
  const escaped = text.replace(/%/g, '%%').replace(/"/g, '""')
  return '"' + escaped + '"'
}

/**
 * Lanza el ejecutable de Semble.
 *
 * - `.exe` (caso normal: shim de uv o console script de Python): spawn sin
 *   shell. Los argumentos viajan como argv y no hay shell que los interprete.
 * - `.cmd`/`.bat`: Node no puede lanzarlos sin shell en Windows, asi que se
 *   usa `shell: true` con cada argumento citado explicitamente.
 */
function spawnSemble(bin: string, args: string[]): { child: ReturnType<typeof spawn> } {
  const isScript = /\.(cmd|bat)$/i.test(bin)
  const spawnOptions = {
    stdio: ['ignore', 'pipe', 'ignore'] as ('ignore' | 'pipe')[],
    windowsHide: true,
    ...(isScript ? { shell: true } : {}),
  }
  const child = isScript
    ? spawn(bin, args.map(quoteArg), spawnOptions)
    : spawn(bin, args, spawnOptions)
  return { child }
}

// ---------------------------------------------------------------------------
// Contexto podado: busqueda pre-computada de Semble.
//
// `semble search` devuelve un JSON con metadatos por resultado (file_path,
// start_line, end_line, score) donde `score` es un float de 17 digitos que
// ocupa ~20 tokens por resultado y no aporta nada al modelo. Compactarlo a
// `archivo:start-end` + contenido ahorra ~20% del bloque inyectado.
// ---------------------------------------------------------------------------
const MAX_SNIPPET_LINES = 10;
const DEFAULT_PRUNED_MAX_CHARS = 4000;

/**
 * Compacta la salida JSON de `semble search` a lineas `archivo:start-end`
 * seguidas del contenido. Devuelve '' si la salida no es JSON valido.
 */
function compactSembleOutput(raw: string, maxChars: number = DEFAULT_PRUNED_MAX_CHARS): string {
  if (!raw) return '';
  // Tolerar BOM: algunos，包 Environments anadenlo al escribir a fichero.
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text.startsWith('{') && !text.startsWith('[')) return '';
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return '';
  }
  const results: any[] = Array.isArray(parsed) ? parsed : (parsed?.results ?? []);
  if (!Array.isArray(results) || results.length === 0) return '';

  const parts: string[] = [];
  let used = 0;
  for (const item of results) {
    if (!item) continue;
    if (typeof item === 'string') {
      const block = item;
      if (used + block.length > maxChars) break;
      parts.push(block);
      used += block.length;
      continue;
    }
    const file = String(item.file_path ?? item.path ?? item.file ?? '');
    const start = item.start_line ?? item.startLine ?? '';
    const end = item.end_line ?? item.endLine ?? '';
    const content = String(item.content ?? item.snippet ?? '');
    if (!file && !content) continue;
    const header = file ? `${file}:${start}-${end}` : '';
    const block = (header ? header + '\n' : '') + content;
    if (used + block.length > maxChars) {
      // Ultimo bloque: se trunca para respetar el presupuesto.
      const remaining = maxChars - used;
      if (remaining > 120) parts.push(block.slice(0, remaining));
      break;
    }
    parts.push(block);
    used += block.length;
  }
  if (parts.length === 0) return '';
  return parts.join('\n---\n');
}

// LRU del contexto podado: los valores son bloques de texto (KB), asi que
// ademas del limite de entradas se acota el total de caracteres en memoria.
const prunedCache = new Map<string, { text: string; ts: number }>();
const MAX_PRUNED_CACHE = 50;
const MAX_PRUNED_TOTAL_CHARS = 200_000;
const PRUNED_CACHE_TTL_MS = 10 * 60_000;

function prunedCacheGet(key: string): string | null {
  const hit = prunedCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > PRUNED_CACHE_TTL_MS) {
    prunedCache.delete(key);
    return null;
  }
  return hit.text;
}

function prunedCacheSet(key: string, text: string): void {
  if (!text) return;
  if (prunedCache.size >= MAX_PRUNED_CACHE) {
    const firstKey = prunedCache.keys().next().value;
    if (firstKey !== undefined) prunedCache.delete(firstKey);
  }
  prunedCache.set(key, { text, ts: Date.now() });
  let total = 0;
  for (const entry of prunedCache.values()) total += entry.text.length;
  while (total > MAX_PRUNED_TOTAL_CHARS && prunedCache.size > 1) {
    const firstKey = prunedCache.keys().next().value;
    if (firstKey === undefined) break;
    const removed = prunedCache.get(firstKey);
    prunedCache.delete(firstKey);
    total -= removed?.text.length ?? 0;
  }
}

// Optimizadores y tipos de tarea donde la busqueda pre-computada compensa:
// SEMBLE es el unico saver con CLI barata de indexar y buscar; REPOMIX es
// destructivo en repos grandes y CONTEXT_MODE/DCP no son CLI. Tipos: todo
// aquel cuyo router PUEDA recomendar SEMBLE (tras V2.1: REPOSITORY_SEARCH de
// busquedas pequenas/puntuales y LARGE_CONTEXT), ya que SMALL_CODE/UNKNOWN/
// TERMINAL solo pueden dar BASELINE/RTK y ahi la busqueda pre-computada no
// aplica.
const PRUNED_OPTIMIZERS = ['SEMBLE'] as const;
const PRUNED_TASK_TYPES = ['REPOSITORY_SEARCH', 'LARGE_CONTEXT'] as const;

function prunedEnabled(): boolean {
  return process.env.KLIA_PRUNED_DISABLED !== '1';
}

function prunedTimeoutMs(): number {
  const raw = Number(process.env.KLIA_PRUNED_TIMEOUT_MS ?? '');
  if (!Number.isFinite(raw) || raw <= 0) return 20_000;
  return Math.min(raw, 30_000);
}

function prunedMaxChars(): number {
  const raw = Number(process.env.KLIA_PRUNED_MAX_CHARS ?? '');
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_PRUNED_MAX_CHARS;
  return Math.min(raw, 20_000);
}

/**
 * Resuelve el directorio raiz del proyecto de la sesion.
 *
 * Prioridad: el directorio que reporta el evento/hook, luego el directorio
 * de trabajo del proceso. Se valida que exista para no lanzar una busqueda
 * sobre una ruta vacia.
 */
function resolveSessionProjectRoot(event: any, ctx: any): string {
  // El directorio que reporta la sesion manda; el cwd es solo el respaldo.
  // Comprobar antes el cwd "porque tiene .git" seria un error: al abrir un
  // repo desde otro directorio devolveria el proyecto equivocado.
  const fromSession = [
    event?.directory,
    event?.cwd,
    event?.workspaceDirectory,
    ctx?.directory,
    ctx?.cwd,
  ]
  for (const candidate of fromSession) {
    if (!candidate || typeof candidate !== 'string') continue
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      // ruta no inspeccionable: se prueba la siguiente
    }
  }
  return process.cwd()
}

/**
 * Calcula el contexto podado de una consulta usando el saver elegido.
 *
 * Devuelve '' si el optimizador no es pre-computable, si la busqueda falla o
 * si supera el timeout: en ese caso el agente trabaja con sus herramientas
 * normales, exactamente igual que ahora.
 */
async function computePrunedContext(
  query: string,
  optimizer: string,
  taskType: string,
  projectRoot: string,
): Promise<string> {
  if (!prunedEnabled()) return ''
  if (!(PRUNED_OPTIMIZERS as readonly string[]).includes(optimizer)) return ''
  if (!(PRUNED_TASK_TYPES as readonly string[]).includes(taskType)) return ''
  const safeQuery = sanitizeQuery(query)
  if (!safeQuery) return ''

  const cacheKey = optimizer + '|' + (taskType || 'UNKNOWN') + '|' + projectRoot + '|' + safeQuery
  const cached = prunedCacheGet(cacheKey);
  if (cached) return cached;

  const bin = resolveSembleCommand();
  const args = [
    'search',
    safeQuery,
    projectRoot,
    '--max-snippet-lines',
    String(MAX_SNIPPET_LINES),
    '-k',
    '3',
  ];
  const started = Date.now();
  const raw = (await runCapture(bin, args, prunedTimeoutMs())).out;
  const elapsed = Date.now() - started;

  const compact = compactSembleOutput(raw, prunedMaxChars());
  if (!compact) {
    dbg('pruned: sin resultado opt=' + optimizer + ' chars=0 elapsed=' + elapsed + 'ms');
    return '';
  }
  dbg(
    'pruned: optimizer=' +
      optimizer +
      ' chars=' +
      compact.length +
      ' elapsed=' +
      elapsed +
      'ms',
  );
  prunedCacheSet(cacheKey, compact);
  return compact;
}

function resolveRepromptWindow(): number {
  const raw = Number(process.env.KLIA_REPROMPT_WINDOW_MINUTES ?? '')
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_REPROMPT_WINDOW_MINUTES
}

async function checkReprompt(query: string, sessionID: string): Promise<boolean> {
  const cli = resolveRouterCli()
  if (!cli.exists) return false
  const args = [
    cli.path,
    'reprompt',
    '--query',
    sanitizeQuery(query),
    '--session-id',
    sessionID,
    '--events',
    KLIA_EVENTS_PATH,
  ]
  const windowMinutes = resolveRepromptWindow()
  if (windowMinutes !== DEFAULT_REPROMPT_WINDOW_MINUTES) {
    args.push('--window-minutes', String(windowMinutes))
  }
  const projectId = resolveProjectId()
  if (projectId) args.push('--project-id', projectId)
  try {
    const out = (await runCapture(process.env.KLIA_NODE_BIN ?? 'node', args, 12000)).out
    const lastLine = out.trim().split('\n').pop() ?? ''
    const parsed = JSON.parse(lastLine) as { reprompt?: boolean }
    return parsed.reprompt === true
  } catch {
    return false
  }
}

// Estado de la ultima clasificacion, para que el badge pueda leerlo.
function writeClassState(
  rec: { optimizer: string; taskType: string },
  sessionID: string,
  injected: boolean,
): void {
  try {
    ensureDir(KLIA_CLASS_STATE_FILE)
    writeFileSync(
      KLIA_CLASS_STATE_FILE,
      JSON.stringify({
        ts: Date.now(),
        sessionID,
        taskType: rec.taskType,
        optimizer: rec.optimizer,
        saver: resolvedSaverFor(rec.optimizer),
        injected,
      }),
      'utf8',
    )
  } catch {
    /* observador: sin senalizacion */
  }
}

function rememberPending(
  sessionID: string,
  rec: { optimizer: string; taskType: string },
  model: string,
  query: string,
  tokensPruned?: number,
): void {
  try {
    let map: Record<string, unknown> = {}
    if (existsSync(KLIA_PENDING_FILE)) {
      try {
        map = JSON.parse(readFileSync(KLIA_PENDING_FILE, 'utf8'))
      } catch {}
    }
    map[sessionID] = {
      optimizer: rec.optimizer,
      taskType: rec.taskType,
      model,
      query,
      timestamp: Date.now(),
      ...(tokensPruned ? { tokensPruned } : {}),
    }
    const keys = Object.keys(map)
    if (keys.length > 50) for (const k of keys.slice(0, keys.length - 50)) delete map[k]
    ensureDir(KLIA_PENDING_FILE)
    writeFileSync(KLIA_PENDING_FILE, JSON.stringify(map), 'utf8')
  } catch (e: any) {
    dbg('rememberPending error: ' + (e?.message ?? String(e)))
  }
}

// Texto del prompt del usuario: Kilo entrega las partes del mensaje.
// Kilo dispara el hook como trigger("chat.message", input, output): el input
// trae { sessionID, agent, model, messageID, variant } y el OUTPUT trae
// { message, parts }. Las partes van en el output, no en el input.
function extractPromptText(parts: any): string {
  if (!Array.isArray(parts)) return ''
  return parts
    .filter((p: any) => p && p.type === 'text' && typeof p.text === 'string')
    .map((p: any) => p.text)
    .join('\n')
    .trim()
}

// Localiza el array de partes del mensaje en el output del hook (Kilo/OpenCode
// V1) o, por compatibilidad, en el input.
function resolveParts(input: any, output: any): any {
  if (Array.isArray(output?.parts)) return output.parts
  if (Array.isArray(output?.message?.parts)) return output.message.parts
  if (Array.isArray(input?.parts)) return input.parts
  if (Array.isArray(input?.message?.parts)) return input.message.parts
  return null
}

// Id del mensaje para las partes nuevas que se anaden al prompt.
function resolveMessageId(input: any, output: any): string {
  return String(output?.message?.id ?? input?.messageID ?? input?.message?.id ?? '')
}

// Anade el texto al final del ultimo parte de texto del mensaje; si el
// mensaje no tiene partes de texto, crea una.
function appendToPrompt(parts: any, text: string, sessionID: string, messageID: string): void {
  if (!Array.isArray(parts)) return
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    if (p && p.type === 'text' && typeof p.text === 'string') {
      p.text = p.text + '\n\n' + text
      return
    }
  }
  parts.push({
    id: 'klia-' + Date.now().toString(36),
    sessionID,
    messageID,
    type: 'text',
    text,
  })
}

// Aviso que se inyecta UNA vez por sesion cuando el router no esta
// disponible: sin el, el usuario ve que "el plugin no hace nada" sin
// ninguna explicacion. Es un error real (no una recomendacion), asi que
// delatarlo es correcto aunque cueste unos tokens.
const ROUTER_ERROR_NOTICE =
  '[KLIA] Router no disponible: ' +
  'falta el CLI del router (reinstalar con install_klia_tokens.ps1 o definir KLIA_ROUTER_CLI_PATH). ' +
  'Sin router no se inyectan directivas de optimizador.'

const errorNotifiedSessions = new Set<string>()

export const KliaRouterInject: Plugin = async () => {
  const routerCli = resolveRouterCli()
  dbg(
    'server called; routerCli=' +
      routerCli.path +
      '; exists=' +
      routerCli.exists +
      '; store=' +
      KLIA_STORE_DIR,
  )

  return {
    'chat.message': async (input: any, output: any) => {
      try {
        const parts = resolveParts(input, output)
        const text = extractPromptText(parts)
        if (!text || text.includes(MARKER)) return
        const sessionID = String(input?.sessionID ?? '')
        if (!sessionID) return
        const defaultModel = resolveDefaultModel(input?.model)
        const messageID = resolveMessageId(input, output)

        const [outcome, isRepeatPrompt] = await Promise.all([
          routeRecommendation(text, defaultModel, sessionID),
          checkReprompt(text, sessionID),
        ])

        const extraParts: string[] = []
        if (isRepeatPrompt) extraParts.push(RETRY_NOTICE)

        const rec = outcome.rec
        if (!rec) {
          if (extraParts.length > 0) appendToPrompt(parts, extraParts.join(' '), sessionID, messageID)
          if (outcome.error) {
            if (!errorNotifiedSessions.has(sessionID)) {
              errorNotifiedSessions.add(sessionID)
              appendToPrompt(parts, ROUTER_ERROR_NOTICE, sessionID, messageID)
              dbg('router no disponible: ' + outcome.error + '; sess=' + sessionID)
            }
            return
          }
          dbg('sin recomendacion del router; sess=' + sessionID)
          return
        }

        // Gate refused: tarea pequena/trivial -> resolucion NO nativa pura:
        // si la query parece una peticion real de codigo, pre-computar la
        // busqueda de Semble e inyectar el resultado ya filtrado (0 tool
        // calls del agente). Si no parece codigo, se queda 100% nativa.
        if (rec.refused) {
          rememberPending(sessionID, rec, defaultModel, text.slice(0, 500))
          let pruned = ''
          if (refusedMayBenefitFromSearch(text)) {
            pruned = await computePrunedContext(
              text,
              'SEMBLE',
              'REPOSITORY_SEARCH',
              resolveSessionProjectRoot(input, null),
            )
          }
          if (pruned) {
            const prunedTokens = Math.ceil(pruned.length / 4)
            // El saver realmente aplicado fue Semble (pre-computada): el
            // pending se sobreescribe a SEMBLE para que el registro de la
            // ejecucion sea veraz y el router aprenda del caso real.
            rememberPending(
              sessionID,
              { optimizer: 'SEMBLE', taskType: 'REPOSITORY_SEARCH' },
              defaultModel,
              text.slice(0, 500),
              prunedTokens,
            )
            writeClassState({ optimizer: 'SEMBLE', taskType: 'REPOSITORY_SEARCH' }, sessionID, true)
            if (extraParts.length > 0) appendToPrompt(parts, extraParts.join(' '), sessionID, messageID)
            appendToPrompt(parts, PRUNED_HEADER + pruned, sessionID, messageID)
            dbg('refused+pruned: taskType=' + rec.taskType + ' sess=' + sessionID + ' chars=' + pruned.length)
          } else {
            if (extraParts.length > 0) appendToPrompt(parts, extraParts.join(' '), sessionID, messageID)
            dbg('refused native: taskType=' + rec.taskType + ' sess=' + sessionID)
          }
          return
        }

        // Registrar la decision PARA QUE EL AUTO-RECORD CIERRE EL BUQUE.
        // Debe ir ANTES del check `if (!directive) return`: si no, las
        // tareas BASELINE no pequenas (buildDirective retorna null) nunca
        // registran pending -> el auto-record no encuentra decision -> no
        // escribe eventos -> el router no aprende de las ejecuciones
        // BASELINE. Sin muestras BASELINE en la celda, relativeCost=1 y
        // el gate de rentabilidad fuerza BASELINE siempre (memoria muerta).
        rememberPending(sessionID, rec, defaultModel, text.slice(0, 500))
        const directive = buildDirective(rec.optimizer, rec.taskType)
        if (!directive) {
          if (extraParts.length > 0) appendToPrompt(parts, extraParts.join(' '), sessionID, messageID)
          dbg('no injection taskType=' + rec.taskType + ' optimizer=' + rec.optimizer + ' sess=' + sessionID)
          return
        }

        if (!shouldInject(sessionID, directive)) {
          writeClassState(rec, sessionID, false)
          dbg('dedup skip: taskType=' + rec.taskType + ' optimizer=' + rec.optimizer + ' sess=' + sessionID)
          return
        }
        writeClassState(rec, sessionID, true)
        // Contexto podado: cuando el saver elegido permite pre-computar la
        // busqueda, se ejecuta ANTES de que arranque el agente y se inyecta su
        // resultado. El agente recibe los hallazgos ya filtrados y evita
        // repetir la busqueda con grep/glob.
        const pruned = await computePrunedContext(
          text,
          rec.optimizer,
          rec.taskType,
          resolveSessionProjectRoot(input, null),
        )
        if (pruned) {
          const prunedTokens = Math.ceil(pruned.length / 4)
          rememberPending(sessionID, rec, defaultModel, text.slice(0, 500), prunedTokens)
          extraParts.push(PRUNED_HEADER + pruned)
        }
        const tail = extraParts.length > 0 ? ' ' + extraParts.join(' ') : ''
        appendToPrompt(parts, directive + tail, sessionID, messageID)
        dbg(
          'injected: taskType=' +
            rec.taskType +
            ' optimizer=' +
            rec.optimizer +
            ' sess=' +
            sessionID +
            (pruned ? ' (pruned=' + pruned.length + 'ch)' : '') +
            (isRepeatPrompt ? ' (reprompt)' : ''),
        )
      } catch (e: any) {
        dbg('chat.message hook error: ' + (e?.message ?? String(e)))
      }
    },
  }
}
