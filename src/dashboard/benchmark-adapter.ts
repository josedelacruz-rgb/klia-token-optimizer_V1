/**
 * Benchmark adapter - Lee los resultados del benchmark y calcula el ahorro real.
 *
 * Formato de entrada (benchmark-results.json): array de ejecuciones con
 * { taskId, taskName, model, optimizer, taskType, estimatedTokens, latencySeconds, quality, failed }
 *
 * El ahorro se calcula agrupando por taskId: la ejecucion con optimizer=BASELINE
 * es la referencia y el resto se compara contra ella.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface BenchmarkRow {
  taskId: string;
  taskName: string;
  model: string;
  optimizer: string;
  taskType: string;
  tokens: number;
  baselineTokens: number;
  savingsTokens: number;
  savingsPercent: number;
  latencySeconds: number;
  quality: number;
  confidence: number;
  failed: boolean;
}

export interface BenchmarkOptimizerAggregate {
  optimizer: string;
  samples: number;
  totalTokens: number;
  totalBaselineTokens: number;
  totalSavedTokens: number;
  weightedSavingsPercent: number;
  avgLatency: number;
  avgQuality: number;
  failures: number;
}

export interface BenchmarkGroupAggregate {
  key: string;
  secondary: string;
  samples: number;
  totalTokens: number;
  totalBaselineTokens: number;
  totalSavedTokens: number;
  weightedSavingsPercent: number;
  avgLatency: number;
  avgQuality: number;
  failures: number;
  bestOptimizer: string | null;
}

export interface BenchmarkCalibration {
  pairsMatched: number;
  avgDeclaredConfidence: number;
  avgActualQuality: number;
  failureRateHighConfidence: number;
  calibrationScore: number;
  verdict: string;
  byOptimizer: {
    optimizer: string;
    samples: number;
    avgDeclaredConfidence: number;
    avgActualQuality: number;
    gap: number;
    failureRate: number;
  }[];
}

export interface BenchmarkReport {
  available: boolean;
  sourcePath: string | null;
  tasks: number;
  rows: BenchmarkRow[];
  byOptimizer: BenchmarkOptimizerAggregate[];
  byModel: BenchmarkGroupAggregate[];
  byModelTask: BenchmarkGroupAggregate[];
  byTaskType: BenchmarkGroupAggregate[];
  calibration: BenchmarkCalibration;
  totalSavedTokens: number;
  weightedSavingsPercent: number;
  totalBaselineTokens: number;
  totalTokens: number;
}

interface RawBenchmarkEntry {
  taskId?: string;
  taskName?: string;
  model?: string;
  optimizer?: string;
  taskType?: string;
  estimatedTokens?: number;
  latencySeconds?: number;
  quality?: number;
  confidence?: number;
  failed?: boolean;
}

const EMPTY_REPORT: BenchmarkReport = {
  available: false,
  sourcePath: null,
  tasks: 0,
  rows: [],
  byOptimizer: [],
  byModel: [],
  byModelTask: [],
  byTaskType: [],
  calibration: {
    pairsMatched: 0,
    avgDeclaredConfidence: 0,
    avgActualQuality: 0,
    failureRateHighConfidence: 0,
    calibrationScore: 0,
    verdict: 'Sin datos',
    byOptimizer: [],
  },
  totalSavedTokens: 0,
  weightedSavingsPercent: 0,
  totalBaselineTokens: 0,
  totalTokens: 0,
};

/**
 * Devuelve las rutas candidatas donde puede vivir el benchmark.
 * Prioriza el store global, luego el directorio de trabajo actual.
 */
export function candidateBenchmarkPaths(): string[] {
  const home = process.env.KLIA_HOME ?? path.join(os.homedir() ?? '.', '.klia');
  return [
    path.join(home, 'data', 'benchmark-results.json'),
    path.join(process.cwd(), '.router-history', 'benchmark-results.json'),
    path.join(process.cwd(), 'benchmark-results.json'),
  ];
}

function readEntries(filePath: string): RawBenchmarkEntry[] | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (!Array.isArray(raw)) return null;
    return raw as RawBenchmarkEntry[];
  } catch {
    return null;
  }
}

function findBenchmarkFile(explicitPath?: string): { path: string; entries: RawBenchmarkEntry[] } | null {
  if (explicitPath) {
    const entries = readEntries(explicitPath);
    if (entries) return { path: explicitPath, entries };
    return null;
  }
  for (const candidate of candidateBenchmarkPaths()) {
    const entries = readEntries(candidate);
    if (entries) return { path: candidate, entries };
  }
  return null;
}

export function buildBenchmarkReport(explicitPath?: string): BenchmarkReport {
  const found = findBenchmarkFile(explicitPath);
  if (!found) return { ...EMPTY_REPORT };

  const { path: sourcePath, entries } = found;

  // Agrupar por taskId para obtener la referencia BASELINE.
  const groups = new Map<string, RawBenchmarkEntry[]>();
  for (const entry of entries) {
    const key = entry.taskId ?? 'unknown';
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }

  const rows: BenchmarkRow[] = [];
  for (const [, group] of groups) {
    const baseline = group.find((e) => e.optimizer === 'BASELINE');
    const baselineTokens = baseline?.estimatedTokens ?? 0;
    for (const entry of group) {
      const tokens = entry.estimatedTokens ?? 0;
      const savingsTokens = baselineTokens - tokens;
      const savingsPercent = baselineTokens > 0 ? (savingsTokens / baselineTokens) * 100 : 0;
      rows.push({
        taskId: entry.taskId ?? 'unknown',
        taskName: entry.taskName ?? '',
        model: entry.model ?? 'desconocido',
        optimizer: entry.optimizer ?? 'UNKNOWN',
        taskType: entry.taskType ?? 'UNKNOWN',
        tokens,
        baselineTokens,
        savingsTokens,
        savingsPercent: Math.round(savingsPercent * 10) / 10,
        latencySeconds: entry.latencySeconds ?? 0,
        quality: entry.quality ?? 0,
        confidence: entry.confidence ?? 0,
        failed: entry.failed ?? false,
      });
    }
  }

  // Agregado por optimizador (solo ejecuciones distintas de BASELINE).
  const agg = new Map<string, BenchmarkOptimizerAggregate>();
  let totalSaved = 0;
  let totalBase = 0;
  let totalTokens = 0;

  for (const row of rows) {
    if (row.optimizer === 'BASELINE') continue;
    totalSaved += row.savingsTokens;
    totalBase += row.baselineTokens;
    totalTokens += row.tokens;

    const cur = agg.get(row.optimizer);
    if (cur) {
      cur.samples += 1;
      cur.totalTokens += row.tokens;
      cur.totalBaselineTokens += row.baselineTokens;
      cur.totalSavedTokens += row.savingsTokens;
      cur.avgLatency += row.latencySeconds;
      cur.avgQuality += row.quality;
      if (row.failed) cur.failures += 1;
    } else {
      agg.set(row.optimizer, {
        optimizer: row.optimizer,
        samples: 1,
        totalTokens: row.tokens,
        totalBaselineTokens: row.baselineTokens,
        totalSavedTokens: row.savingsTokens,
        weightedSavingsPercent: 0,
        avgLatency: row.latencySeconds,
        avgQuality: row.quality,
        failures: row.failed ? 1 : 0,
      });
    }
  }

  const byOptimizer = [...agg.values()]
    .map((o) => ({
      ...o,
      weightedSavingsPercent:
        o.totalBaselineTokens > 0
          ? Math.round((o.totalSavedTokens / o.totalBaselineTokens) * 1000) / 10
          : 0,
      avgLatency: Math.round((o.avgLatency / o.samples) * 10) / 10,
      avgQuality: Math.round((o.avgQuality / o.samples) * 100) / 100,
    }))
    .sort((a, b) => b.weightedSavingsPercent - a.weightedSavingsPercent);

  const byModel = groupAggregates(rows, (r) => r.model, (r) => r.model);
  const byModelTask = groupAggregates(rows, (r) => `${r.model} :: ${r.taskType}`, (r) => r.taskType);
  const byTaskType = groupAggregates(rows, (r) => r.taskType, (r) => r.taskType);
  const calibration = computeCalibration(rows);

  return {
    available: rows.length > 0,
    sourcePath,
    tasks: groups.size,
    rows: rows.sort((a, b) => b.savingsPercent - a.savingsPercent),
    byOptimizer,
    byModel,
    byModelTask,
    byTaskType,
    calibration,
    totalSavedTokens: totalSaved,
    weightedSavingsPercent: totalBase > 0 ? Math.round((totalSaved / totalBase) * 1000) / 10 : 0,
    totalBaselineTokens: totalBase,
    totalTokens,
  };
}

/**
 * Calibracion de confianza a partir del benchmark: compara la confianza declarada
 * por el router con la calidad realmente obtenida en cada ejecucion.
 */
function computeCalibration(rows: BenchmarkRow[]): BenchmarkCalibration {
  const scored = rows.filter((r) => r.optimizer !== 'BASELINE' && r.confidence > 0);
  if (scored.length === 0) {
    return {
      pairsMatched: 0,
      avgDeclaredConfidence: 0,
      avgActualQuality: 0,
      failureRateHighConfidence: 0,
      calibrationScore: 0,
      verdict: 'Sin datos de confianza en el benchmark',
      byOptimizer: [],
    };
  }

  const avgDeclared = scored.reduce((s, r) => s + r.confidence, 0) / scored.length;
  const avgActual = scored.reduce((s, r) => s + r.quality, 0) / scored.length;
  const highConf = scored.filter((r) => r.confidence >= 0.8);
  const failureRate =
    highConf.length > 0 ? highConf.filter((r) => r.failed).length / highConf.length : 0;
  const gap = Math.abs(avgDeclared - avgActual);
  const calibrationScore = Math.max(0, Math.min(1, 1 - gap));

  const byOptimizerMap = new Map<
    string,
    { samples: number; conf: number; quality: number; failures: number }
  >();
  for (const r of scored) {
    const cur = byOptimizerMap.get(r.optimizer);
    if (cur) {
      cur.samples += 1;
      cur.conf += r.confidence;
      cur.quality += r.quality;
      if (r.failed) cur.failures += 1;
    } else {
      byOptimizerMap.set(r.optimizer, {
        samples: 1,
        conf: r.confidence,
        quality: r.quality,
        failures: r.failed ? 1 : 0,
      });
    }
  }

  const byOptimizer = [...byOptimizerMap.entries()].map(([optimizer, v]) => {
    const c = v.conf / v.samples;
    const q = v.quality / v.samples;
    return {
      optimizer,
      samples: v.samples,
      avgDeclaredConfidence: Math.round(c * 1000) / 1000,
      avgActualQuality: Math.round(q * 1000) / 1000,
      gap: Math.round((c - q) * 1000) / 1000,
      failureRate: Math.round((v.failures / v.samples) * 1000) / 1000,
    };
  });

  const verdict =
    calibrationScore >= 0.9
      ? 'Muy bien calibrado'
      : calibrationScore >= 0.7
        ? 'Bien calibrado'
        : calibrationScore >= 0.5
          ? 'Calibracion moderada'
          : 'Sobreconfianza detectada';

  return {
    pairsMatched: scored.length,
    avgDeclaredConfidence: Math.round(avgDeclared * 1000) / 1000,
    avgActualQuality: Math.round(avgActual * 1000) / 1000,
    failureRateHighConfidence: Math.round(failureRate * 1000) / 1000,
    calibrationScore: Math.round(calibrationScore * 1000) / 1000,
    verdict,
    byOptimizer,
  };
}

/**
 * Agrupa las filas del benchmark por una clave, calculando ahorro ponderado,
 * latencia/calidad medias y el mejor optimizador de cada grupo.
 */
function groupAggregates(
  rows: BenchmarkRow[],
  keyFn: (r: BenchmarkRow) => string,
  secondaryFn: (r: BenchmarkRow) => string,
): BenchmarkGroupAggregate[] {
  const groups = new Map<string, BenchmarkGroupAggregate>();
  const perGroupOpt = new Map<string, Map<string, number>>();

  for (const row of rows) {
    if (row.optimizer === 'BASELINE') continue;
    const key = keyFn(row);
    const cur = groups.get(key);
    if (cur) {
      cur.samples += 1;
      cur.totalTokens += row.tokens;
      cur.totalBaselineTokens += row.baselineTokens;
      cur.totalSavedTokens += row.savingsTokens;
      cur.avgLatency += row.latencySeconds;
      cur.avgQuality += row.quality;
      if (row.failed) cur.failures += 1;
    } else {
      groups.set(key, {
        key,
        secondary: secondaryFn(row),
        samples: 1,
        totalTokens: row.tokens,
        totalBaselineTokens: row.baselineTokens,
        totalSavedTokens: row.savingsTokens,
        weightedSavingsPercent: 0,
        avgLatency: row.latencySeconds,
        avgQuality: row.quality,
        failures: row.failed ? 1 : 0,
        bestOptimizer: null,
      });
    }

    const optMap = perGroupOpt.get(key) ?? new Map<string, number>();
    optMap.set(row.optimizer, (optMap.get(row.optimizer) ?? 0) + row.savingsTokens);
    perGroupOpt.set(key, optMap);
  }

  return [...groups.values()]
    .map((g) => {
      const optMap = perGroupOpt.get(g.key);
      let best: string | null = null;
      let bestSaved = -Infinity;
      if (optMap) {
        for (const [opt, saved] of optMap) {
          if (saved > bestSaved) {
            bestSaved = saved;
            best = opt;
          }
        }
      }
      return {
        ...g,
        weightedSavingsPercent:
          g.totalBaselineTokens > 0
            ? Math.round((g.totalSavedTokens / g.totalBaselineTokens) * 1000) / 10
            : 0,
        avgLatency: Math.round((g.avgLatency / g.samples) * 10) / 10,
        avgQuality: Math.round((g.avgQuality / g.samples) * 100) / 100,
        bestOptimizer: best,
      };
    })
    .sort((a, b) => b.weightedSavingsPercent - a.weightedSavingsPercent);
}
