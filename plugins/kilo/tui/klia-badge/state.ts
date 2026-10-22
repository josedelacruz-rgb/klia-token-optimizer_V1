/**
 * Helpers puros para el badge TUI de KLIA en Kilo Code.
 *
 * Klio-router-inject escribe el estado de la ultima clasificacion en
 * ~/.klia/data/.klia-class-state.json ({ ts, sessionID, taskType, optimizer,
 * saver, injected }). Este modulo lo parsea de forma tolerante y deriva el
 * texto del badge. Sin dependencias: se ejecuta igual en Node (tests) y en
 * el runtime de la TUI de Kilo.
 */
import { readFileSync } from 'node:fs';

export interface ClassState {
  ts: number;
  sessionID?: string;
  taskType?: string;
  optimizer?: string;
  saver?: string | null;
  injected?: boolean;
}

/** Naranja del badge (tema agnostico; el plan aprobado fija este valor). */
export const BADGE_COLOR = '#FF8C00';

/**
 * Lee y valida el fichero de estado. Devuelve null si falta, esta corrupto
 * o no tiene la forma esperada: el badge es observador y nunca lanza.
 */
export function readClassState(file: string): ClassState | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    const state = parsed as ClassState;
    if (typeof state.ts !== 'number') return null;
    return state;
  } catch {
    return null;
  }
}

/**
 * Texto del badge: "KLIA <tipo de tarea>", o undefined si no hay una
 * clasificacion utilizable (el slot no renderiza nada en ese caso).
 */
export function badgeLabel(state: ClassState | null | undefined): string | undefined {
  if (!state || !state.taskType) return undefined;
  return 'KLIA ' + state.taskType;
}
