/**
 * Dashboard stats adapter - Reutiliza la lógica de stats-report.ts para el dashboard web.
 *
 * Genera un RouterStatsReport completo a partir de los eventos v2.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readJsonSync } from '../utils/json';
import type { RouterEvent } from '../types';
import { buildStatsReport } from '../scorer/stats-report';
import { buildBenchmarkReport } from './benchmark-adapter';

export function getDefaultEventsPath(): string {
  const base =
    process.env.KLIA_HOME ?? path.join(process.env.HOME ?? process.env.USERPROFILE ?? os.homedir() ?? '.', '.klia');
  return path.join(base, 'data', 'events.json');
}

/**
 * Rutas candidatas del store de eventos, en orden de prioridad.
 * Permite que el dashboard funcione tanto con el store global de KLIA
 * como con el store local del proyecto (.router-history/events.json).
 */
export function candidateEventsPaths(): string[] {
  const home = process.env.KLIA_HOME ?? path.join(os.homedir() ?? '.', '.klia');
  return [
    path.join(home, 'data', 'events.json'),
    path.join(process.cwd(), '.router-history', 'events.json'),
    path.join(process.cwd(), 'events.json'),
  ];
}

/**
 * Resuelve el store de eventos: usa el path explicito si existe y tiene datos,
 * si no recurre a las rutas candidatas.
 */
export function resolveEventsPath(explicitPath?: string): string {
  if (explicitPath && fs.existsSync(explicitPath)) return explicitPath;
  for (const candidate of candidateEventsPaths()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return explicitPath ?? getDefaultEventsPath();
}

function loadEvents(eventsPath: string): RouterEvent[] {
  if (!fs.existsSync(eventsPath)) return [];
  try {
    const data = readJsonSync(eventsPath) as RouterEvent[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export interface DashboardSummary {
  totalEvents: number;
  totalDecisions: number;
  totalExecutions: number;
  totalTokens: number;
  avgQuality: number;
  failureCount: number;
  avgLatencySeconds: number;
  optimizerCounts: Record<string, number>;
  generatedAt: string;
  // Ahorro
  totalTokensSaved: number;
  totalUsdSaved: number;
  weightedSavingsPercent: number;
  savingsVerdict: string;
  // Datos enriquecidos
  hasRealData: boolean;
  realCount: number;
  syntheticCount: number;
}

export function buildDashboardReport(eventsPath: string, benchmarkPath?: string) {
  const resolvedEventsPath = resolveEventsPath(eventsPath);
  const events = loadEvents(resolvedEventsPath);
  const report = buildStatsReport(events);
  const benchmark = buildBenchmarkReport(benchmarkPath);

  const executions = events.filter((e) => e.type === 'execution');
  const decisions = events.filter((e) => e.type === 'decision');

  const totalTokens = executions.reduce((sum, e) => sum + (e.execution?.totalTokens ?? 0), 0);
  const avgQuality =
    executions.length > 0
      ? executions.reduce((sum, e) => sum + (e.execution?.quality ?? 0), 0) / executions.length
      : 0;
  const failureCount = executions.filter((e) => e.execution?.failed).length;
  const latencySum = executions.reduce((sum, e) => sum + (e.execution?.latencySeconds ?? 0), 0);

  const optimizerCounts: Record<string, number> = {};
  for (const d of decisions) {
    const opt = d.decision?.optimizer ?? 'UNKNOWN';
    optimizerCounts[opt] = (optimizerCounts[opt] ?? 0) + 1;
  }

  // Si el store de eventos aun no tiene ejecuciones, el benchmark aporta los
  // datos de ahorro reales; se usa como fuente primaria en ese caso.
  const useBenchmarkSavings = executions.length === 0 && benchmark.available;

  const summary: DashboardSummary = {
    totalEvents: events.length,
    totalDecisions: decisions.length,
    totalExecutions: executions.length,
    totalTokens,
    avgQuality,
    failureCount,
    avgLatencySeconds: executions.length > 0 ? latencySum / executions.length : 0,
    optimizerCounts,
    generatedAt: new Date().toISOString(),
    totalTokensSaved: useBenchmarkSavings
      ? benchmark.totalSavedTokens
      : report.globalSavings.totalTokensSaved,
    totalUsdSaved: report.globalSavings.totalUsdSaved,
    weightedSavingsPercent: useBenchmarkSavings
      ? benchmark.weightedSavingsPercent
      : report.globalSavings.weightedSavingsPercent,
    savingsVerdict: useBenchmarkSavings
      ? benchmark.weightedSavingsPercent > 0
        ? 'AHORRO'
        : benchmark.weightedSavingsPercent < 0
          ? 'PERDIDA'
          : 'NEUTRO'
      : report.globalSavings.verdict,
    hasRealData: report.summary.realCount > 0,
    realCount: report.summary.realCount,
    syntheticCount: report.summary.syntheticCount,
  };

  return {
    report,
    summary,
    benchmark,
    eventsPath: resolvedEventsPath,
    events,
  };
}