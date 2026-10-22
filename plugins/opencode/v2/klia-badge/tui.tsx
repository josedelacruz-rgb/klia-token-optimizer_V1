/** @jsxImportSource @opentui/solid */
/**
 * Plugin CLI/TUI de opencode: klia-badge + sidebar panel.
 *
 * Dos slots:
 *  1. prompt.footer.status -> badge naranja "KLIA <tipo>" (existente)
 *  2. sidebar.footer     -> panel con metricas AGREGADAS del sistema (calmado)
 *
 * El estado lo escribe klia-router-inject en ~/.klia/data/.klia-class-state.json;
 * las metricas historicas se leen de ~/.klia/data/history.json. El plugin observa
 * ambos ficheros (poll con watchFile). Defensivo: fuera de la TUI es no-op.
 *
 * Desactivable con KLIA_BADGE_DISABLED=1.
 */
import { readFileSync, unwatchFile, watchFile } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { createMemo, createSignal, Show } from "solid-js"
import { badgeLabel, BADGE_COLOR, readClassState, type ClassState } from "./state"

const KLIA_HOME = process.env.KLIA_HOME ?? homedir() + "/.klia"
const STATE_FILE = path.join(KLIA_HOME, "data", ".klia-class-state.json")
const HISTORY_FILE = path.join(KLIA_HOME, "data", "history.json")
const POLL_INTERVAL_MS = 1500

/** Presupuestos absolutos por taskType (duplicado minimo para autonomia del TUI). */
const TASK_BUDGETS: Record<string, number> = {
  TERMINAL: 3000,
  SMALL_CODE: 15000,
  REPOSITORY_SEARCH: 50000,
  REFACTOR: 30000,
  MULTISTEP: 80000,
  LARGE_CONTEXT: 5000,
  DEBUG: 30000,
  UNKNOWN: 25000,
}

type SlotInput = { readonly append: string; readonly render: () => unknown }
type Ui = {
  slot?: (claim: SlotInput) => (() => void) | void
}

interface HistoryRecord {
  id: string
  timestamp: string
  taskType: string
  optimizer: string
  metrics: { tokens: number; latencySeconds: number; quality: number; failed: boolean }
}

function readHistory(file: string): HistoryRecord[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"))
    if (!Array.isArray(parsed)) return []
    return parsed as HistoryRecord[]
  } catch {
    return []
  }
}

function getPhase(count: number): string {
  if (count < 5) return "SEED"
  if (count < 15) return "WARMING"
  return "LEARNED"
}

interface LineDef {
  text: string
  color?: string
  dim?: boolean
}

/**
 * Calcula metricas agregadas del sistema (calmado, no por consulta individual).
 */
function computeAggregates(history: HistoryRecord[]) {
  const total = history.length
  if (total === 0) {
    return {
      total,
      tokensTotal: 0,
      tokensAvg: 0,
      successRate: 0,
      phase: "SEED",
      topOptimizer: "-",
      alertsCount: 0,
    }
  }

  let tokensTotal = 0
  let successes = 0
  const optimizerCounts: Record<string, number> = {}

  for (const r of history) {
    tokensTotal += r.metrics.tokens
    if (!r.metrics.failed) successes++
    optimizerCounts[r.optimizer] = (optimizerCounts[r.optimizer] ?? 0) + 1
  }

  const topOptimizer = Object.entries(optimizerCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-"

  const successRate = Math.round((successes / total) * 100)
  const tokensAvg = Math.round(tokensTotal / total)
  const phase = getPhase(total)

  // Alertas: cuantas ejecuciones en las ultimas 10 excedieron presupuesto
  const recent = history.slice(-10)
  let alertsCount = 0
  for (const r of recent) {
    const budget = TASK_BUDGETS[r.taskType] ?? TASK_BUDGETS.UNKNOWN
    if (r.metrics.tokens > budget) alertsCount++
  }

  return { total, tokensTotal, tokensAvg, successRate, phase, topOptimizer, alertsCount }
}

function sidebarLines(state: ClassState | null, history: HistoryRecord[]): LineDef[] {
  const agg = computeAggregates(history)

  const lines: LineDef[] = [
    { text: "KLIA System Status", color: BADGE_COLOR },
  ]

  if (agg.total === 0) {
    lines.push({ text: "Sin datos aun", dim: true })
    return lines
  }

  // Linea 2: ejecuciones + fase
  lines.push({ text: `${agg.total} ejecuciones | Fase: ${agg.phase}` })

  // Linea 3: tokens totales + promedio
  const tokTotalK = (agg.tokensTotal / 1000).toFixed(1)
  const tokAvgK = (agg.tokensAvg / 1000).toFixed(1)
  lines.push({ text: `${tokTotalK}k tot | ~${tokAvgK}k avg` })

  // Linea 4: tasa de exito + optimizer principal
  // Umbrales mas permisivos para no alarmar: >=80% verde, >=50% amarillo, <50% rojo
  const statusColor = agg.successRate >= 80 ? "#00CC66" : agg.successRate >= 50 ? "#FFCC00" : "#FF4444"
  lines.push({ text: `${agg.successRate}% exito | Top: ${agg.topOptimizer}`, color: statusColor })

  // Linea 5: alertas (solo si hay)
  if (agg.alertsCount > 0) {
    lines.push({ text: `${agg.alertsCount}/10 ejec. recientes con burn`, color: "#FF4444" })
  } else {
    lines.push({ text: "Burn: OK", dim: true })
  }

  return lines
}

/** Componente reactivo: texto naranja solo mientras haya clasificacion. */
function Badge(props: { label: () => string | undefined }) {
  return (
    <Show when={props.label()}>
      <text fg={BADGE_COLOR}>{props.label()}</text>
    </Show>
  )
}

/** Panel lateral con metricas agregadas del sistema (calmado, no por consulta). */
function SidebarPanel(props: { lines: () => LineDef[] }) {
  return (
    <Show when={props.lines().length > 0}>
      <box flexDirection="column" gap={0}>
        {props.lines().map((line, i) => (
          <text key={String(i)} fg={line.color} dim={line.dim}>
            {line.text}
          </text>
        ))}
      </box>
    </Show>
  )
}

export default {
  id: "klia-badge",
  setup(context: unknown): (() => void) | void {
    if (process.env.KLIA_BADGE_DISABLED === "1") return
    const ui = (context as { ui?: Ui } | undefined)?.ui
    if (!ui || typeof ui.slot !== "function") return // fuera de la TUI: no-op

    const [state, setState] = createSignal<ClassState | null>(readClassState(STATE_FILE))
    const [history, setHistory] = createSignal<HistoryRecord[]>(readHistory(HISTORY_FILE))
    const label = createMemo(() => badgeLabel(state()))
    const lines = createMemo(() => sidebarLines(state(), history()))
    let lastTs = state()?.ts ?? null

    try {
      watchFile(STATE_FILE, { interval: POLL_INTERVAL_MS }, () => {
        try {
          const next = readClassState(STATE_FILE)
          if (next && next.ts !== lastTs) {
            lastTs = next.ts
            setState(next)
          }
        } catch { /* noop */ }
      })
    } catch { /* noop */ }

    try {
      watchFile(HISTORY_FILE, { interval: POLL_INTERVAL_MS }, () => {
        try {
          setHistory(readHistory(HISTORY_FILE))
        } catch { /* noop */ }
      })
    } catch { /* noop */ }

    const unregisterBadge = ui.slot({
      append: "prompt.footer.status",
      render: () => <Badge label={label} />,
    })

    const unregisterSidebar = ui.slot({
      append: "sidebar.content",
      render: () => <SidebarPanel lines={lines} />,
    })

    return () => {
      if (typeof unregisterBadge === "function") unregisterBadge()
      if (typeof unregisterSidebar === "function") unregisterSidebar()
      try { unwatchFile(STATE_FILE) } catch { /* noop */ }
      try { unwatchFile(HISTORY_FILE) } catch { /* noop */ }
    }
  },
}
