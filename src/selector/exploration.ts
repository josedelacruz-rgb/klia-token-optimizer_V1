import type { Optimizer, RouterDecision, RouterOptions, TaskType } from '../types';
import { DEFAULT_ROUTER_OPTIONS } from '../types';
import { candidatesForTask, defaultOptimizerForTask } from '../rules/base-rules';
import { selectOptimizer } from './optimizer-selector';
import type { HistoryStore } from '../history/history-store';

export interface ExplorationResult {
  /** Decisión final. */
  decision: RouterDecision;
  /** Indica si la decisión fue resultado de exploración forzada. */
  explored: boolean;
  /** Optimizador que habría elegido la política pura de explotación. */
  exploitedOptimizer: Optimizer;
}

export async function selectOptimizerWithExploration(
  model: string,
  taskType: TaskType,
  deps: { history: HistoryStore },
  options: RouterOptions = {},
  random: () => number = Math.random,
  forcedDefault?: Optimizer,
): Promise<ExplorationResult> {
  const opts = { ...DEFAULT_ROUTER_OPTIONS, ...options };

  const baseDecision = await selectOptimizer(model, taskType, deps, opts, forcedDefault);

  // Si ya hay confianza suficiente, explotar directamente... salvo que exista
  // un candidato con muestras insuficientes: sin esto, un saver recomendado
  // por regla base en una celda madura (BASELINE con confianza >= minConfidence)
  // nunca alcanza minSamples y queda en deadlock (no se elige "hasta tener
  // muestras" y no consigue muestras porque no se elige). Se le da su
  // oportunidad con la misma tasa de exploracion controlada (V3).
  if (baseDecision.confidence >= opts.minConfidence) {
    const saverCandidates = candidatesForTask(taskType).filter((o) => o !== 'BASELINE');
    if (saverCandidates.length > 0) {
      const sampleCountByOptimizer = new Map(
        (baseDecision.alternatives ?? []).map((a) => [a.optimizer, a.sampleCount] as const),
      );
      const underSampled = saverCandidates.filter(
        (o) => (sampleCountByOptimizer.get(o) ?? 0) < opts.minSamples,
      );
      if (underSampled.length > 0 && random() <= opts.explorationRate) {
        const chosen = underSampled[Math.floor(random() * underSampled.length)];
        return {
          decision: {
            optimizer: chosen,
            version: 'V3',
            reason: `Exploración controlada para ${model}/${taskType}: se prueba ${chosen} (muestras insuficientes en una celda madura) para acumular evidencia.`,
            confidence: 0,
            taskType,
            explored: true,
            exploitedOptimizer: baseDecision.optimizer,
            alternatives: baseDecision.alternatives,
          },
          explored: true,
          exploitedOptimizer: baseDecision.optimizer,
        };
      }
    }
    return {
      decision: baseDecision,
      explored: false,
      exploitedOptimizer: baseDecision.optimizer,
    };
  }

  // Sin exploración permitida: fallback seguro a baseline.
  if (random() > opts.explorationRate) {
    const fallback = defaultOptimizerForTask(taskType);
    return {
      decision: {
        optimizer: fallback,
        version: 'V3',
        reason: `Confianza insuficiente para ${model}/${taskType}. Se usa fallback seguro ${fallback} mientras se acumula evidencia.`,
        confidence: baseDecision.confidence,
        taskType,
        explored: false,
        exploitedOptimizer: baseDecision.optimizer,
        alternatives: baseDecision.alternatives,
      },
      explored: false,
      exploitedOptimizer: baseDecision.optimizer,
    };
  }

  // Explorar una alternativa entre los candidatos que no sean el baseline ni el elegido.
  const candidates = candidatesForTask(taskType);
  const triedOptimizers = new Set(
    baseDecision.alternatives?.map((a) => a.optimizer) ?? [],
  );

  const unexplored = candidates.filter(
    (opt) => opt !== 'BASELINE' && !triedOptimizers.has(opt),
  );

  if (unexplored.length === 0) {
    // No hay nada nuevo que explorar; seguir con la decisión base (normalmente baseline).
    return {
      decision: {
        ...baseDecision,
        version: 'V3',
        reason: `${baseDecision.reason} (sin alternativas sin explorar)`,
        explored: false,
        exploitedOptimizer: baseDecision.optimizer,
      },
      explored: false,
      exploitedOptimizer: baseDecision.optimizer,
    };
  }

  const chosen = unexplored[Math.floor(random() * unexplored.length)];
  return {
    decision: {
      optimizer: chosen,
      version: 'V3',
      reason: `Exploración controlada para ${model}/${taskType}: se prueba ${chosen} para acumular evidencia.`,
      confidence: 0,
      taskType,
      explored: true,
      exploitedOptimizer: baseDecision.optimizer,
      alternatives: baseDecision.alternatives,
    },
    explored: true,
    exploitedOptimizer: baseDecision.optimizer,
  };
}
