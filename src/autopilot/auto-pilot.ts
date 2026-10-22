/**
 * Auto-pilot - Acciones automaticas basadas en metricas del router.
 *
 * Monitorea el estado del sistema (burn, tamano de store, tasa de fallos)
 * y ejecuta acciones correctivas sin intervencion humana.
 */

import * as fs from 'fs';
import * as path from 'path';
import { readJsonSync } from '../utils/json';

export interface AutoPilotAction {
  type: 'adjust_confidence' | 'force_baseline' | 'compact_store' | 'alert_burn' | 'retrain_classifier';
  reason: string;
  payload?: Record<string, unknown>;
}

export interface AutoPilotState {
  lastCheckAt: string;
  actionsTaken: AutoPilotAction[];
  disabledUntil?: string;
}

export interface AutoPilotOptions {
  /** Si true, el piloto automatico esta activo. Default true. */
  enabled?: boolean;
  /** Tokens acumulados en la ultima hora para disparar alerta. Default 500000. */
  burnThresholdTokensPerHour?: number;
  /** Tasa de fallo que fuerza fallback a BASELINE. Default 0.4. */
  failureRateThreshold?: number;
  /** Tamano maximo del store (bytes) antes de compactar. Default 50 MB. */
  maxStoreSizeBytes?: number;
  /** Intervalo minimo entre acciones del mismo tipo (minutos). Default 60. */
  cooldownMinutes?: number;
}

export interface AutoPilotMetrics {
  storePath?: string;
  eventsPath?: string;
  tokensLastHour?: number;
  failureRateLastHour?: number;
  totalEvents?: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseTimestamp(ts: string): number {
  return new Date(ts).getTime();
}

export class AutoPilot {
  private readonly opts: Required<AutoPilotOptions>;
  private readonly statePath: string;

  constructor(opts: AutoPilotOptions = {}) {
    const base = process.env.KLIA_HOME ?? path.join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.klia');
    this.statePath = path.join(base, 'data', 'autopilot-state.json');
    this.opts = {
      enabled: opts.enabled ?? true,
      burnThresholdTokensPerHour: opts.burnThresholdTokensPerHour ?? 500_000,
      failureRateThreshold: opts.failureRateThreshold ?? 0.4,
      maxStoreSizeBytes: opts.maxStoreSizeBytes ?? 50 * 1024 * 1024,
      cooldownMinutes: opts.cooldownMinutes ?? 60,
    };
  }

  private loadState(): AutoPilotState {
    if (!fs.existsSync(this.statePath)) {
      return { lastCheckAt: '1970-01-01T00:00:00.000Z', actionsTaken: [] };
    }
    try {
      return readJsonSync(this.statePath) as AutoPilotState;
    } catch {
      return { lastCheckAt: '1970-01-01T00:00:00.000Z', actionsTaken: [] };
    }
  }

  private saveState(state: AutoPilotState): void {
    const dir = path.dirname(this.statePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2));
  }

  private isOnCooldown(state: AutoPilotState, actionType: string): boolean {
    if (state.disabledUntil && new Date().toISOString() < state.disabledUntil) return true;
    const cutoff = Date.now() - this.opts.cooldownMinutes * 60 * 1000;
    const recent = state.actionsTaken.filter(
      a => a.type === actionType && parseTimestamp(state.lastCheckAt) > cutoff,
    );
    return recent.length > 0;
  }

  /**
   * Evalua metricas y devuelve acciones recomendadas (sin ejecutarlas).
   * El caller decide si aplicarlas.
   */
  evaluate(metrics: AutoPilotMetrics): AutoPilotAction[] {
    if (!this.opts.enabled) return [];
    const state = this.loadState();
    const actions: AutoPilotAction[] = [];

    // 1. Alerta de burn alto
    if (
      metrics.tokensLastHour !== undefined &&
      metrics.tokensLastHour > this.opts.burnThresholdTokensPerHour
    ) {
      if (!this.isOnCooldown(state, 'alert_burn')) {
        actions.push({
          type: 'alert_burn',
          reason: `Burn rate ${metrics.tokensLastHour} tokens/h excede umbral ${this.opts.burnThresholdTokensPerHour}`,
          payload: { tokensLastHour: metrics.tokensLastHour },
        });
      }
    }

    // 2. Tasa de fallo elevada -> forzar BASELINE temporalmente
    if (
      metrics.failureRateLastHour !== undefined &&
      metrics.failureRateLastHour > this.opts.failureRateThreshold
    ) {
      if (!this.isOnCooldown(state, 'force_baseline')) {
        actions.push({
          type: 'force_baseline',
          reason: `Tasa de fallo ${(metrics.failureRateLastHour * 100).toFixed(1)}% supera umbral ${(this.opts.failureRateThreshold * 100).toFixed(1)}%`,
          payload: { failureRate: metrics.failureRateLastHour },
        });
      }
    }

    // 3. Store grande -> sugerir compactacion
    if (metrics.eventsPath && fs.existsSync(metrics.eventsPath)) {
      const stats = fs.statSync(metrics.eventsPath);
      if (stats.size > this.opts.maxStoreSizeBytes) {
        if (!this.isOnCooldown(state, 'compact_store')) {
          actions.push({
            type: 'compact_store',
            reason: `Store ${(stats.size / 1024 / 1024).toFixed(1)} MB excede umbral ${(this.opts.maxStoreSizeBytes / 1024 / 1024).toFixed(1)} MB`,
            payload: { storeSizeBytes: stats.size },
          });
        }
      }
    }

    return actions;
  }

  /**
   * Evalua y persiste las acciones tomadas (append al historial de estado).
   */
  checkAndAct(metrics: AutoPilotMetrics): AutoPilotAction[] {
    const actions = this.evaluate(metrics);
    if (actions.length === 0) return actions;
    const state = this.loadState();
    state.lastCheckAt = nowIso();
    for (const action of actions) {
      state.actionsTaken.push(action);
    }
    // Mantener solo ultimas 100 acciones
    if (state.actionsTaken.length > 100) {
      state.actionsTaken = state.actionsTaken.slice(-100);
    }
    this.saveState(state);
    return actions;
  }

  /** Desactiva el piloto automatico hasta una fecha dada (ISO). */
  disableUntil(isoDate: string): void {
    const state = this.loadState();
    state.disabledUntil = isoDate;
    this.saveState(state);
  }

  /** Reactiva inmediatamente. */
  enable(): void {
    const state = this.loadState();
    delete state.disabledUntil;
    this.saveState(state);
  }
}
