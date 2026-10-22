/**
 * Helpers de metricas agregadas para el panel TUI de KLIA en Kilo Code.
 *
 * Lee el store global (~/.klia/data) y resume el estado del router:
 * - events.json  (v2, RouterEvent): ejecuciones reales + ahorro vs BASELINE
 * - history.json (v1, ExecutionRecord): fallback si no hay events.json
 */
import { readFileSync } from 'node:fs';

export interface HistoryRecord {
  id: string;
  timestamp: string;
  taskType: string;
  optimizer: string;
  metrics: { tokens: number; latencySeconds: number; quality: number; failed: boolean };
}

export interface ExecutionEvent {
  type: string;
  model?: string;
  taskType?: string;
  decision?: { optimizer?: string; taskType?: string };
  execution?: {
    optimizer?: string;
    taskType?: string;
    totalTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    latencySeconds?: number;
    quality?: number;
    failed?: boolean;
  };
}

export interface SystemAggregates {
  executions: number;
  tokensTotal: number;
  tokensAvg: number;
  successRate: number;
  phase: string;
  topOptimizer: string;
  optimizerCounts: Record<string, number>;
  tasksByType: Record<string, number>;
  tokensSaved: number;
  savingsPercent: number | null;
  hasSavings: boolean;
}

/** Presupuestos absolutos por taskType (duplicado minimo para autonomia del TUI). */
export const TASK_BUDGETS: Record<string, number> = {
  TERMINAL: 3000,
  SMALL_CODE: 15000,
  REPOSITORY_SEARCH: 50000,
  REFACTOR: 30000,
  MULTISTEP: 80000,
  LARGE_CONTEXT: 5000,
  DEBUG: 30000,
  UNKNOWN: 25000,
};

export function getPhase(count: number): string {
  if (count < 5) return 'SEED';
  if (count < 15) return 'WARMING';
  return 'LEARNED';
}

export function readHistory(file: string): HistoryRecord[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed as HistoryRecord[];
  } catch {
    return [];
  }
}

export function readEvents(file: string): ExecutionEvent[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed as ExecutionEvent[];
  } catch {
    return [];
  }
}

function emptyAggregates(): SystemAggregates {
  return {
    executions: 0,
    tokensTotal: 0,
    tokensAvg: 0,
    successRate: 0,
    phase: 'SEED',
    topOptimizer: '-',
    optimizerCounts: {},
    tasksByType: {},
    tokensSaved: 0,
    savingsPercent: null,
    hasSavings: false,
  };
}

/**
 * Clave del "caso" al que pertenece una ejecucion: modelo + tipo de tarea.
 * Es la combinacion contra la que se compara con la referencia BASELINE.
 */
function caseKeyOf(event: ExecutionEvent): string {
  const model = event.model ?? 'UNKNOWN';
  const taskType =
    event.taskType ?? event.decision?.taskType ?? event.execution?.taskType ?? 'UNKNOWN';
  return `${model}|${taskType}`;
}

/**
 * Calcula las metricas agregadas del sistema a partir de los eventos v2.
 * El ahorro se calcula comparando cada ejecucion con la referencia BASELINE
 * de su mismo par (modelo + tarea).
 */
export function computeAggregatesFromEvents(events: ExecutionEvent[]): SystemAggregates {
  const executions = events.filter((e) => e.type === 'execution' && e.execution);
  if (executions.length === 0) return emptyAggregates();

  const agg = emptyAggregates();
  agg.executions = executions.length;

  // Referencia BASELINE por caso (modelo + tipo de tarea).
  const baselineByCase = new Map<string, number>();
  for (const e of executions) {
    const x = e.execution!;
    if (x.optimizer !== 'BASELINE') continue;
    const caseKey = caseKeyOf(e);
    const tokens = x.totalTokens ?? (x.inputTokens ?? 0) + (x.outputTokens ?? 0);
    const prev = baselineByCase.get(caseKey);
    if (prev === undefined || tokens > prev) baselineByCase.set(caseKey, tokens);
  }

  let saved = 0;
  let baseSum = 0;
  let compared = 0;

  for (const e of executions) {
    const x = e.execution!;
    const tokens = x.totalTokens ?? (x.inputTokens ?? 0) + (x.outputTokens ?? 0);
    agg.tokensTotal += tokens;
    if (!x.failed) agg.successRate += 1;

    const optimizer = x.optimizer ?? e.decision?.optimizer ?? 'UNKNOWN';
    agg.optimizerCounts[optimizer] = (agg.optimizerCounts[optimizer] ?? 0) + 1;

    const taskType = x.taskType ?? e.decision?.taskType ?? e.taskType ?? 'UNKNOWN';
    agg.tasksByType[taskType] = (agg.tasksByType[taskType] ?? 0) + 1;

    if (optimizer !== 'BASELINE') {
      const base = baselineByCase.get(caseKeyOf(e));
      if (base && base > 0) {
        saved += base - tokens;
        baseSum += base;
        compared += 1;
      }
    }
  }

  agg.successRate = Math.round((agg.successRate / executions.length) * 100);
  agg.tokensAvg = Math.round(agg.tokensTotal / executions.length);
  agg.phase = getPhase(executions.length);
  agg.topOptimizer =
    Object.entries(agg.optimizerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-';
  agg.tokensSaved = saved;
  if (compared > 0 && baseSum > 0) {
    agg.savingsPercent = Math.round((saved / baseSum) * 1000) / 10;
    agg.hasSavings = true;
  }
  return agg;
}

/** Agregados a partir del store legacy v1 (history.json). */
export function computeAggregatesFromHistory(history: HistoryRecord[]): SystemAggregates {
  if (history.length === 0) return emptyAggregates();

  const agg = emptyAggregates();
  agg.executions = history.length;
  let successes = 0;

  for (const r of history) {
    agg.tokensTotal += r.metrics.tokens;
    if (!r.metrics.failed) successes++;
    agg.optimizerCounts[r.optimizer] = (agg.optimizerCounts[r.optimizer] ?? 0) + 1;
    agg.tasksByType[r.taskType] = (agg.tasksByType[r.taskType] ?? 0) + 1;
  }

  agg.successRate = Math.round((successes / history.length) * 100);
  agg.tokensAvg = Math.round(agg.tokensTotal / history.length);
  agg.phase = getPhase(history.length);
  agg.topOptimizer =
    Object.entries(agg.optimizerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-';
  return agg;
}

/** Combina las fuentes disponibles priorizando events.json (v2). */
export function computeAggregates(
  events: ExecutionEvent[],
  history: HistoryRecord[],
): SystemAggregates {
  const fromEvents = computeAggregatesFromEvents(events);
  if (fromEvents.executions > 0) return fromEvents;
  return computeAggregatesFromHistory(history);
}
