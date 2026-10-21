import type { Optimizer, TaskType } from '../types';

// Politica V2.1 "savers baratos en tareas pequenas" (evidencia del benchmark
// optimizer del 2026-10-21):
//  - DCP SOLO en MULTISTEP: en tareas cortas no hay contexto acumulado que
//    podar, y su overhead fijo (~+1.6k tokens/request medido) sale a perder
//    (Q git status -> in=16034 con DCP).
//  - REPOMIX SOLO en LARGE_CONTEXT: empaquetar el repo entero para una
//    busqueda puntual gasto +17k tokens (Q01 37118 vs 20741, Q03 29491 vs 14512).
//  - REPOSITORY_SEARCH -> SEMBLE: una unica busqueda devulve archivo:linea,
//    y el plugin puede pre-inyectar el resultado podado sin tool calls.
//  - TERMINAL/REFACTOR -> RTK: comprime la salida de comandos sin coste.
//  - REPO_PACKAGING -> REPOMIX: territorio propio del empaquetado. Evidencia
//    combinada: benchmark interno Q05 (repomix pack 20003 vs baseline 180990,
//    -89%) y tabla AGENTS.md (--compress ~64% vs baseline). "Vision global" y
//    "resumen" NO son empaquetado: quedan en REPOSITORY_SEARCH (SEMBLE ~98%).
export const BASE_RULES: Record<TaskType, Optimizer[]> = {
  SMALL_CODE: ['BASELINE'],
  TERMINAL: ['RTK'],
  LARGE_CONTEXT: ['SEMBLE', 'CONTEXT_MODE', 'REPOMIX'],
  REPOSITORY_SEARCH: ['SEMBLE'],
  REPO_PACKAGING: ['REPOMIX', 'SEMBLE', 'CONTEXT_MODE'],
  MULTISTEP: ['DCP'],
  REFACTOR: ['RTK'],
  UNKNOWN: ['BASELINE'],
};

/**
 * Devuelve la lista de optimizadores candidatos para un tipo de tarea
 * según las reglas generales V0.
 */
export function candidatesForTask(taskType: TaskType): Optimizer[] {
  return BASE_RULES[taskType] ?? ['BASELINE'];
}

/**
 * Devuelve el optimizador por defecto (primera opción) de las reglas base.
 */
export function defaultOptimizerForTask(taskType: TaskType): Optimizer {
  return candidatesForTask(taskType)[0] ?? 'BASELINE';
}
