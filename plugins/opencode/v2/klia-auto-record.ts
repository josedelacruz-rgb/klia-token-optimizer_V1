/**
 * Plugin de OpenCode v2: klia-auto-record (adaptador OpenCode 2.x)
 *
 * Cierra el bucle del router SIN MCP (modelo plugin-directo, espejo del de
 * Kilo en plugins/kilo/klia-auto-record.ts):
 *   1. Acumula tokens reales por mensaje via el evento "message.updated".
 *   2. En "session.idle" lee la decision pendiente que klia-router-inject
 *      escribe en ~/.klia/data/.router-pending.json (o en memoria si la
 *      tool route_task del MCP OPCIONAL llego a invocarse).
 *   3. Invoca el CLI del router con --record-execution (spawn directo) para
 *      persistir tokens/latencia/calidad/breakdown en events/history.
 *
 * Equivalencias v2 (doc /v2/docs/build/plugins/migrate-v1):
 *   - tool.execute.after -> ctx.tool.hook("execute.after")
 *     (event.tool/input/output; input.tool y sessionID se normalizan).
 *   - event -> ctx.event.subscribe() for-await con AbortController;
 *     el input se normaliza a { event: { type, properties } } para que el
 *     cuerpo (verbatim de Kilo) funcione igual.
 *   - El setup devuelve un dispose que aborta el bucle.
 */
import { Plugin } from '@opencode/plugin'

import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname } from 'node:path'

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
const KLIA_DEBUG_LOG = KLIA_LOG_DIR + '/plugin-debug.log'
const KLIA_ERROR_LOG = KLIA_LOG_DIR + '/plugin-error.log'
const KLIA_PENDING_FILE = KLIA_STORE_DIR + '/.router-pending.json'

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

// Log de errores: el fallo del router NUNCA debe ser silencioso. Aqui un
// error significa que las ejecuciones no se registran y el router deja de
// aprender sin que el usuario se entere. Se escribe aparte para separar el
// diagnostico del trace de ejecucion.
function errDbg(msg: string): void {
  try {
    ensureDir(KLIA_ERROR_LOG)
    appendFileSync(KLIA_ERROR_LOG, new Date().toISOString() + ' ' + msg + '\n')
  } catch {}
  dbg('ERROR ' + msg)
}

// Resultado de buscar el CLI del router: no basta con la ruta, hay que saber
// SI EXISTE. Si el runtime global no esta publicado (falta FASE 13 del
// instalador o lo borro el desinstalador), las ejecuciones se pierden en
// silencio; con exists=false el plugin lo delata en plugin-error.log.
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

interface RouteDecision {
  optimizer: string
  model: string
  query: string
  taskType: string
  timestamp: number
  /** Tokens del contexto pre-computado inyectado en el prompt (si hubo). */
  tokensPruned?: number
}

interface ToolEntry {
  toolName: string
  program?: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  timestamp: string
}

const pendingDecisions = new Map<string, RouteDecision>()
const recordedSessions = new Set<string>()
// Uso por sesion: los tokens se acumulan por mensaje (Kilo publica
// message.updated con tokens ACUMULADOS del mensaje) y se suman entre mensajes.
const sessionUsage = new Map<string, Map<string, { input: number; output: number }>>()
const sessionToolBreakdown = new Map<string, ToolEntry[]>()
// Tools fallidas por sesión: si alguna tool falla, la ejecucion se registra
// con failed=true y quality reducida. Sin esto, el gate de calidad del
// selector (maxFailureRate / minQuality) nunca se puede activar porque el
// plugin siempre manda failed=false / quality=0.95.
const sessionFailedTools = new Map<string, Array<{ toolName: string; error?: string; timestamp: string }>>()

function extractProgramFromToolName(toolName: string): string | undefined {
  if (toolName.includes('semble')) return 'SEMBLE'
  if (toolName.includes('repomix')) return 'REPOMIX'
  if (toolName.includes('context-mode') || toolName.includes('ctx_search')) return 'CONTEXT_MODE'
  if (toolName.includes('serena')) return 'SERENA'
  if (toolName === 'shell' || toolName === 'execute') return 'RTK'
  return undefined
}

function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

// Decisiones dejadas por el plugin klia-router-inject: permiten cerrar el
// bucle de metricas aunque el agente no llegue a llamar a route_task.
function readPendingDecision(sessionID: string): RouteDecision | null {
  try {
    if (!existsSync(KLIA_PENDING_FILE)) return null
    const map = JSON.parse(readFileSync(KLIA_PENDING_FILE, 'utf8')) as Record<string, any>
    const e = map?.[sessionID]
    if (!e || !e.optimizer || !e.model) return null
    return {
      optimizer: String(e.optimizer),
      model: String(e.model),
      query: String(e.query ?? ''),
      taskType: String(e.taskType ?? 'UNKNOWN'),
      timestamp: Number(e.timestamp ?? Date.now()),
      ...(e.tokensPruned ? { tokensPruned: Number(e.tokensPruned) } : {}),
    }
  } catch {
    return null
  }
}

function extractText(result: unknown): string {
  if (result == null) return ''
  if (typeof result === 'string') return result
  const r = result as Record<string, unknown>
  if (typeof r.output === 'string') return r.output
  if (typeof r.content === 'string') return r.content
  if (Array.isArray(r.content)) {
    return (r.content as Array<Record<string, unknown>>)
      .map((c) => (typeof c.text === 'string' ? c.text : ''))
      .join('')
  }
  try {
    return JSON.stringify(result)
  } catch {
    return ''
  }
}

function sanitizeQuery(q: string): string {
  return q.slice(0, 2000).replace(/[\x00-\x1f\x7f]/g, ' ')
}

function recordExecution(
  routerCliPath: string,
  decision: RouteDecision,
  input: number,
  output: number,
  latencySeconds: number,
  sessionID: string,
  failed = false,
  toolBreakdown?: ToolEntry[],
  qualityOverride?: number,
): void {
  const total = input + output
  // Delatar el runtime ausente ANTES de spawn: si el CLI no existe, el
  // ejecutable se pierde (y el historico se queda cojo) sin ninguna pista.
  try {
    if (!routerCliPath || !existsSync(routerCliPath)) {
      errDbg(
        'router-cli-missing: ' +
          (routerCliPath || '(ruta vacia)') +
          ' no existe; ejecucion NO registrada (optimizer=' +
          decision.optimizer +
          '). Reinstalar con install_klia_tokens.ps1 (publica el runtime global) o definir KLIA_ROUTER_CLI_PATH.',
      )
      return
    }
  } catch {}
  // Quality: si el caller la pasa (derivada de errores reales de tools),
  // usarla. Si no, 0.5 si failed, 0.95 si no.
  const quality = qualityOverride ?? (failed ? 0.5 : 0.95)
  const args = [
    routerCliPath,
    '--record-execution',
    '--model',
    decision.model,
    '--query',
    sanitizeQuery(decision.query),
    '--optimizer',
    decision.optimizer,
    '--tokens',
    String(total),
    '--input-tokens',
    String(input),
    '--output-tokens',
    String(output),
    '--latency',
    String(latencySeconds),
    '--quality',
    String(quality),
    '--session-id',
    sessionID,
    '--history',
    `${KLIA_STORE_DIR}/history.json`,
    '--events',
    `${KLIA_STORE_DIR}/events.json`,
    '--metrics',
    `${KLIA_STORE_DIR}/mcp-metrics.json`,
  ]
  if (failed) args.push('--failed')
  // Contexto pre-computado inyectado en el prompt (contexto podado): se
  // registra para poder medir el ahorro real frente al gasto teorico.
  if (decision.tokensPruned && decision.tokensPruned > 0) {
    args.push('--tokens-pruned', String(decision.tokensPruned))
  }
  const tmpFile = `${KLIA_STORE_DIR}/.tmp-tool-breakdown-${sessionID}.json`
  if (toolBreakdown && toolBreakdown.length > 0) {
    try {
      ensureDir(tmpFile)
      writeFileSync(tmpFile, JSON.stringify(toolBreakdown), 'utf8')
      args.push('--tool-breakdown-file', tmpFile)
    } catch {}
  }
  try {
    ensureDir(`${KLIA_STORE_DIR}/history.json`)
    const child = spawn(process.env.KLIA_NODE_BIN ?? 'node', args, { stdio: 'ignore', windowsHide: true })
    child.on('error', (e: any) => dbg('spawn error: ' + (e?.message ?? String(e))))
    child.on('exit', (code: any) => {
      dbg('record cli exit=' + code)
      try {
        if (existsSync(tmpFile)) unlinkSync(tmpFile)
      } catch {}
    })
  } catch (e: any) {
    dbg('spawn throw: ' + (e?.message ?? String(e)))
  }
}

// Extrae los tokens de un evento de Kilo. Kilo publica "message.updated" con
// properties { sessionID, info } y info.tokens = { input, output, reasoning,
// cache }. Se aceptan varias formas por si el evento cambia de forma.
function extractUsage(properties: any): { sessionID: string; messageID: string; input: number; output: number } | null {
  if (!properties || typeof properties !== 'object') return null
  const sessionID = String(properties.sessionID ?? properties.sessionId ?? '')
  if (!sessionID) return null
  const info = properties.info ?? {}
  const tokens = info.tokens ?? properties.tokens ?? properties.usage ?? properties
  const input = Number(tokens?.input ?? tokens?.inputTokens ?? 0)
  const output = Number(tokens?.output ?? tokens?.outputTokens ?? 0)
  const messageID = String(info.id ?? properties.messageID ?? properties.messageId ?? 'msg')
  return {
    sessionID,
    messageID,
    input: Number.isFinite(input) ? input : 0,
    output: Number.isFinite(output) ? output : 0,
  }
}

// Guarda el uso de un mensaje. Kilo actualiza los tokens del mismo mensaje
// varias veces (streaming), asi que se guarda el MAXIMO por mensaje y el total
// de la sesion es la suma de los mensajes.
function recordUsage(usage: { sessionID: string; messageID: string; input: number; output: number }): void {
  let perMessage = sessionUsage.get(usage.sessionID)
  if (!perMessage) {
    perMessage = new Map()
    sessionUsage.set(usage.sessionID, perMessage)
  }
  const prev = perMessage.get(usage.messageID)
  perMessage.set(usage.messageID, {
    input: Math.max(prev?.input ?? 0, usage.input),
    output: Math.max(prev?.output ?? 0, usage.output),
  })
}

// Total de tokens de la sesion (suma de todos sus mensajes).
function totalUsage(sessionID: string): { input: number; output: number } {
  const perMessage = sessionUsage.get(sessionID)
  if (!perMessage) return { input: 0, output: 0 }
  let input = 0
  let output = 0
  for (const value of perMessage.values()) {
    input += value.input
    output += value.output
  }
  return { input, output }
}

export default Plugin.define({
  id: 'klia-auto-record',
  async setup(ctx: any) {
    const routerCli = resolveRouterCli()
    dbg('setup v2; routerCli=' + routerCli.path + '; exists=' + routerCli.exists)

    await ctx.tool.hook('execute.after', async (event: any) => {
      const input: any = {
        ...((event?.input ?? {}) as object),
        tool: event?.tool ?? event?.input?.tool ?? '',
        sessionID: event?.sessionID ?? event?.input?.sessionID ?? '',
      }
      const output: any = event?.output ?? {}

      try {
        const toolName = String(input?.tool ?? '')
        const sessionID = String(input?.sessionID ?? '')
        if (!sessionID) return

        if (toolName.includes('route_task')) {
          const args = (input?.args ?? {}) as Record<string, unknown>
          const model = String(args.model ?? '')
          const query = String(args.query ?? '')
          if (!model || !query) return

          let optimizer = 'BASELINE'
          let taskType = 'SMALL_CODE'
          const text = extractText(output?.output)
          try {
            const parsed = JSON.parse(text)
            optimizer = parsed.optimizer ?? optimizer
            taskType = parsed.taskType ?? taskType
          } catch {
            const optMatch = text.match(/"optimizer"\s*:\s*"([^"]+)"/)
            if (optMatch) optimizer = optMatch[1]
            const ttMatch = text.match(/"taskType"\s*:\s*"([^"]+)"/)
            if (ttMatch) taskType = ttMatch[1]
          }

          pendingDecisions.set(sessionID, { optimizer, model, query, taskType, timestamp: Date.now() })
          recordedSessions.delete(sessionID)
          return
        }

        // Para el resto de tools se acumula el breakdown de tokens por sesion.
        // Trackear tools fallidas: si alguna tool falla, la ejecucion se
        // registra con failed=true. Sin esto, el gate de calidad del
        // selector nunca se puede activar.
        const toolStatus = String(output?.metadata?.status ?? output?.status ?? '')
        const toolError = output?.error
        if (toolStatus === 'error' || toolError) {
          const failed = sessionFailedTools.get(sessionID) ?? []
          failed.push({
            toolName,
            error: typeof toolError === 'string' ? toolError : undefined,
            timestamp: new Date().toISOString(),
          })
          sessionFailedTools.set(sessionID, failed)
          return
        }
        const resultText = extractText(output?.output)
        const inputText = extractText(input?.args)
        const entry: ToolEntry = {
          toolName,
          program: extractProgramFromToolName(toolName),
          inputTokens: estimateTokens(inputText),
          outputTokens: estimateTokens(resultText),
          latencyMs: Number(output?.metadata?.latencyMs ?? 0),
          timestamp: new Date().toISOString(),
        }
        const arr = sessionToolBreakdown.get(sessionID) ?? []
        arr.push(entry)
        sessionToolBreakdown.set(sessionID, arr)
      } catch {
        /* el registro de metricas nunca debe romper la sesion */
      }

    })

    const controller = new AbortController()
    void (async () => {
      try {
        for await (const evt of ctx.event.subscribe({ signal: controller.signal })) {
          const input: any = { event: { type: evt?.type ?? '', properties: evt?.properties ?? evt?.attributes ?? evt } }

          try {
            const event = input?.event ?? {}
            const type = String(event.type ?? '')
            const properties = event.properties ?? event.data ?? {}

            // Log de diagnostico: confirma que el handler se invoca y con que
            // tipo de evento. Sin este log no podemos saber si Kilo no emite
            // session.idle o si el handler se registra mal.
            if (type) {
              dbg('event: type=' + type + ' sess=' + String(properties?.sessionID ?? properties?.sessionId ?? ''))
            }

            // Tokens: Kilo los publica en "message.updated" (properties.info.tokens).
            const usage = extractUsage(properties)
            if (usage && (usage.input > 0 || usage.output > 0)) {
              recordUsage(usage)
              return
            }

            // Cierre de turno: Kilo emite "session.idle" cuando la sesion queda
            // inactiva. "message.completed" NO sirve: fires por mensaje y
            // registraria la ejecucion con el uso incompleto.
            if (!type.includes('idle') && !type.includes('session.execution.succeeded')) return

            const sessionID = String(properties?.sessionID ?? properties?.sessionId ?? '')
            if (!sessionID) {
              dbg('event idle sin sessionID; abortando')
              return
            }
            const decision = pendingDecisions.get(sessionID) ?? readPendingDecision(sessionID)
            if (!decision) {
              dbg('event idle sin decision pendiente; sess=' + sessionID + ' (el router-inject no llamo a rememberPending, o el plugin V1 no registra el hook chat.message)')
              return
            }
            if (recordedSessions.has(sessionID)) {
              dbg('event idle sesion ya registrada; sess=' + sessionID)
              return
            }

            const totals = totalUsage(sessionID)
            if (totals.input === 0 && totals.output === 0) {
              dbg('event idle sin usage (message.updated no llego o no trajo tokens); sess=' + sessionID)
              return
            }

            const latencySeconds = Math.max(1, Math.round((Date.now() - decision.timestamp) / 1000))

            recordedSessions.add(sessionID)
            pendingDecisions.delete(sessionID)
            sessionUsage.delete(sessionID)
            const breakdown = sessionToolBreakdown.get(sessionID)
            sessionToolBreakdown.delete(sessionID)
            const failedTools = sessionFailedTools.get(sessionID) ?? []
            sessionFailedTools.delete(sessionID)
            // Si alguna tool fallo, la ejecucion se registra como fallida con
            // quality reducida. El selector usa estos datos para activar el
            // gate de calidad (maxFailureRate / minQuality) y descartar
            // optimizadores que fallen sistemáticamente.
            const failed = failedTools.length > 0
            const quality = failed ? Math.max(0, 0.5 - 0.1 * failedTools.length) : 0.95

            dbg(
              'record execution; sess=' +
                sessionID +
                ' in=' +
                totals.input +
                ' out=' +
                totals.output +
                ' opt=' +
                decision.optimizer +
                ' tools=' +
                (breakdown?.length ?? 0) +
                ' failed=' +
                failedTools.length,
            )
            recordExecution(routerCli.path, decision, totals.input, totals.output, latencySeconds, sessionID, failed, breakdown, quality)
          } catch {
            /* nunca debe romper la sesion */
          }

        }
      } catch {
        // El abort del controller corta el for-await: no es un error
      }
    })()

    // Dispose del setup: corta el bucle de eventos
    return () => {
      controller.abort()
    }
  },
})
