/**
 * Calibracion de confianza del router adaptativo.
 *
 * Reutiliza el calculo ya existente en `buildStatsReport` (seccion 8 del informe
 * de estadisticas) pero lo presenta de forma enfocada y anade una recomendacion
 * accionable sobre `minConfidence`: el router declara una confianza por decision
 * y esta se compara con la calidad real de la ejecucion emparejada por sessionId.
 *
 *   - Si sobreestima su certeza (conf > calidad) conviene SUBIR minConfidence.
 *   - Si infravalora su certeza (calidad > conf) conviene BAJAR minConfidence
 *     para no descartar decisiones que en realidad son validas.
 *   - Si estan alineadas, mantener.
 *
 * Uso:
 *   router calibrate [--no-color] [--json] [--events <path>]
 *                    [--min-confidence <0..1>] [--no-model-breakdown]
 *                    [--write] [--config <path>]
 *
 * Con `--write` se aplica el umbral sugerido al fichero de configuracion global
 * de OpenCode (ROUTER_MIN_CONFIDENCE del MCP), creando un backup .bak-<ts>.
 * Sin `--write` solo se muestra la recomendacion y la ruta del fichero.
 */
import * as fs from 'fs';
import { parseCliArgs } from '../utils/cli-args';
import { RouterEventStore } from '../history/router-event-store';
import { buildStatsReport } from '../scorer/stats-report';
import { DEFAULT_ROUTER_OPTIONS } from '../types';
import type { RouterEvent } from '../types';
import type { RouterStatsReport } from '../scorer/stats-report';
import { resolveEventsPath } from './stats-display';
import {
  resolveMinConfidenceConfig,
  applyMinConfidence,
  type MinConfidenceWriteResult,
} from './min-confidence-config';

export interface CalibrateOptions {
  noColor: boolean;
  json: boolean;
  eventsPath?: string;
  /** Umbral de confianza a evaluar. Por defecto ROUTER_MIN_CONFIDENCE o 0.6. */
  minConfidence?: number;
  /** Incluir el desglose de calibracion por modelo (por defecto true). */
  byModel: boolean;
  /** Aplicar el umbral sugerido al fichero de configuracion global. */
  write: boolean;
  /** Ruta explicita del fichero de configuracion global (por defecto autodetectado). */
  configPath?: string;
}

export interface CalibrationRecommendation {
  current: number;
  suggested: number | null;
  action: 'subir' | 'bajar' | 'mantener' | 'sin-datos';
  /** Diferencia confianza declarada - calidad real (positiva = sobreconfianza). */
  overconfidence: number;
  message: string;
}

interface ModelCalibrationRow {
  model: string;
  pairsMatched: number;
  avgDeclaredConfidence: number;
  avgActualQuality: number;
  failureRateHighConfidence: number;
  calibrationScore: number;
}

function makePalette(noColor: boolean) {
  const wrap = (code: string, s: string) => (noColor ? s : `\x1b[${code}m${s}\x1b[0m`);
  return {
    bold: (s: string) => wrap('1', s),
    dim: (s: string) => wrap('2', s),
    green: (s: string) => wrap('32', s),
    yellow: (s: string) => wrap('33', s),
    red: (s: string) => wrap('31', s),
    cyan: (s: string) => wrap('36', s),
  };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function padLeft(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function roundToStep(n: number, step: number): number {
  // Redondeo a la rejilla + limpieza de ruido de coma flotante (0.9500000000000001).
  return Number((Math.round(n / step) * step).toFixed(4));
}

function verdictShort(score: number): 'OK' | 'MEDIA' | 'BAJA' {
  if (score >= 0.7) return 'OK';
  if (score >= 0.4) return 'MEDIA';
  return 'BAJA';
}

/**
 * Resuelve el umbral de confianza a evaluar.
 * Prioridad: opcion explicita > variable de entorno > fichero de configuracion
 * global > default del router.
 *
 * El fallback al valor del fichero es clave: sin el, el CLI (que se ejecuta sin
 * la env del MCP) partia siempre del default 0.6 y la recomendacion no
 * convergia. Tras aplicar --write, el informe seguia proponiendo "bajar de 0.60"
 * aunque el fichero ya declarase 0.30, de modo que el comando parecia no
 * recalibrar nunca.
 */
function resolveMinConfidence(explicit?: number, fromConfigFile?: number | null): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
  const env = process.env.ROUTER_MIN_CONFIDENCE;
  const parsed = env ? parseFloat(env) : NaN;
  if (Number.isFinite(parsed)) return parsed;
  if (typeof fromConfigFile === 'number' && Number.isFinite(fromConfigFile)) {
    return fromConfigFile;
  }
  return DEFAULT_ROUTER_OPTIONS.minConfidence;
}

/**
 * Deriva una recomendacion accionable a partir de la calibracion global.
 * El objetivo es que minConfidence se acerque a la calidad real observada.
 */
function computeRecommendation(
  cal: RouterStatsReport['confidenceCalibration'],
  current: number,
): CalibrationRecommendation {
  if (cal.pairsMatched === 0) {
    return {
      current,
      suggested: null,
      action: 'sin-datos',
      overconfidence: 0,
      message:
        'No hay pares decision+ejecucion emparejados. Registra ejecuciones reales ' +
        'con sessionId (record_execution) para habilitar la calibracion.',
    };
  }

  const overconfidence = cal.avgDeclaredConfidence - cal.avgActualQuality;
  // Ajustamos el umbral en la misma direccion que la desviacion observada:
  //   - sobreconfianza (declara > entrega): subir el liston.
  //   - infraconfianza (entrega > declara): bajar el liston para no descartar
  //     decisiones que en realidad son validas.
  const suggested = roundToStep(clamp(current + overconfidence, 0.3, 0.95), 0.05);
  const delta = suggested - current;
  const failureNote =
    cal.failureRateHighConfidence > 0.1
      ? ` Atencion: la tasa de fallo en alta confianza es ${cal.failureRateHighConfidence.toFixed(3)}.`
      : '';

  if (Math.abs(delta) < 0.05) {
    return {
      current,
      suggested,
      action: 'mantener',
      overconfidence,
      message:
        `El umbral actual (${current.toFixed(2)}) ya esta alineado con la evidencia ` +
        `(desviacion ${overconfidence.toFixed(3)}). Mantener.` +
        failureNote,
    };
  }

  if (delta > 0) {
    return {
      current,
      suggested,
      action: 'subir',
      overconfidence,
      message:
        `El router declara mas certeza de la que entrega (conf. ` +
        `${cal.avgDeclaredConfidence.toFixed(3)} vs calidad ${cal.avgActualQuality.toFixed(3)}). ` +
        `Subir minConfidence de ${current.toFixed(2)} a ${suggested.toFixed(2)}.` +
        failureNote,
    };
  }

  return {
    current,
    suggested,
    action: 'bajar',
    overconfidence,
    message:
      `El router es mas fiable de lo que declara (calidad ` +
      `${cal.avgActualQuality.toFixed(3)} vs conf. ${cal.avgDeclaredConfidence.toFixed(3)}). ` +
      `Bajar minConfidence de ${current.toFixed(2)} a ${suggested.toFixed(2)} para no ` +
      'descartar decisiones validas.' +
      failureNote,
  };
}

/**
 * Calibracion desglosada por modelo (solo modelos con pares emparejados).
 */
function perModelCalibration(events: RouterEvent[], minConfidence: number): ModelCalibrationRow[] {
  const byModel = new Map<string, RouterEvent[]>();
  for (const e of events) {
    const list = byModel.get(e.model);
    if (list) list.push(e);
    else byModel.set(e.model, [e]);
  }

  const rows: ModelCalibrationRow[] = [];
  for (const [model, evs] of byModel) {
    const report = buildStatsReport(evs, { minConfidence });
    const cal = report.confidenceCalibration;
    if (cal.pairsMatched > 0) {
      rows.push({
        model,
        pairsMatched: cal.pairsMatched,
        avgDeclaredConfidence: cal.avgDeclaredConfidence,
        avgActualQuality: cal.avgActualQuality,
        failureRateHighConfidence: cal.failureRateHighConfidence,
        calibrationScore: cal.calibrationScore,
      });
    }
  }

  return rows.sort((a, b) => b.pairsMatched - a.pairsMatched);
}

/**
 * Genera el informe de calibracion. Devuelve texto (o JSON si opts.json).
 */
export async function runCalibrate(opts?: Partial<CalibrateOptions>): Promise<string> {
  const options: CalibrateOptions = {
    noColor: opts?.noColor ?? false,
    json: opts?.json ?? false,
    eventsPath: opts?.eventsPath,
    minConfidence: opts?.minConfidence,
    byModel: opts?.byModel ?? true,
    write: opts?.write ?? false,
    configPath: opts?.configPath,
  };

  const eventsPath = resolveEventsPath(options.eventsPath);
  const storeFound = fs.existsSync(eventsPath);
  const events: RouterEvent[] = storeFound ? await new RouterEventStore(eventsPath).list() : [];

  // Localiza el fichero de configuracion global donde vive ROUTER_MIN_CONFIDENCE.
  // Se resuelve ANTES de calcular el informe para que el umbral vigente salga del
  // propio fichero (y no del default), y la recomendacion converja tras --write.
  const config = resolveMinConfidenceConfig(options.configPath);

  const minConfidence = resolveMinConfidence(options.minConfidence, config.current);
  const report = buildStatsReport(events, { minConfidence });
  const cal = report.confidenceCalibration;
  const recommendation = computeRecommendation(cal, minConfidence);
  const modelRows = options.byModel ? perModelCalibration(events, minConfidence) : [];

  // Si se pidio `--write`, aplica el umbral sugerido (con backup).
  let writeResult: MinConfidenceWriteResult | null = null;
  let writeError: string | null = null;
  const canWrite =
    options.write && recommendation.suggested !== null && recommendation.action !== 'sin-datos';
  if (canWrite && config.file) {
    try {
      writeResult = applyMinConfidence(config.file, recommendation.suggested as number);
    } catch (err) {
      writeError = (err as Error).message;
    }
  }

  if (options.json) {
    return JSON.stringify(
      {
        eventsPath,
        storeFound,
        minConfidence,
        calibration: cal,
        recommendation,
        byModel: modelRows,
        config: {
          file: config.file,
          current: config.current,
          requestedWrite: options.write,
          writeResult,
          writeError,
        },
        summary: {
          totalEvents: events.length,
          decisions: report.summary.totalDecisions,
          executions: report.summary.totalExecutions,
          matchedDecisions: report.summary.matchedDecisions,
          orphanDecisions: report.summary.orphanDecisions,
        },
      },
      null,
      2,
    );
  }

  const p = makePalette(options.noColor);
  const out: string[] = [];
  const sep = '='.repeat(80);

  out.push(p.bold(p.cyan('  CALIBRACION DE CONFIANZA - KLIA Token Optimizer')));
  out.push(sep);
  out.push(p.dim(`  Store: ${eventsPath}${storeFound ? '' : '  (no encontrado)'}`));
  out.push(p.dim(`  Umbral evaluado (minConfidence): ${minConfidence.toFixed(2)}`));
  out.push('');

  // --- Metricas globales ---
  out.push(p.bold('  METRICAS GLOBALES'));
  out.push('-'.repeat(80));
  out.push(
    `  ${pad('Pares decision+ejecucion emparejados', 44)} ${p.bold(String(cal.pairsMatched))}`,
  );
  out.push(
    `  ${pad('Decisiones huerfanas (sin ejecucion)', 44)} ${String(report.summary.orphanDecisions)}`,
  );
  out.push(`  ${pad('Confianza media declarada', 44)} ${cal.avgDeclaredConfidence.toFixed(3)}`);
  out.push(`  ${pad('Calidad real media', 44)} ${cal.avgActualQuality.toFixed(3)}`);
  out.push(
    `  ${pad('Tasa de fallo en alta confianza', 44)} ${cal.failureRateHighConfidence.toFixed(3)}`,
  );
  const scoreColor =
    cal.calibrationScore >= 0.7 ? p.green : cal.calibrationScore >= 0.4 ? p.yellow : p.red;
  out.push(
    `  ${pad('Score de calibracion (0..1)', 44)} ${scoreColor(p.bold(cal.calibrationScore.toFixed(3)))}`,
  );
  out.push(`  ${pad('Veredicto', 44)} ${cal.verdict}`);
  out.push('');

  // --- Recomendacion de umbral ---
  out.push(p.bold('  RECOMENDACION DE UMBRAL (minConfidence)'));
  out.push('-'.repeat(80));
  const actionColor =
    recommendation.action === 'mantener'
      ? p.green
      : recommendation.action === 'sin-datos'
        ? p.yellow
        : p.yellow;
  out.push(`  ${pad('Umbral actual', 44)} ${recommendation.current.toFixed(2)}`);
  out.push(
    `  ${pad('Umbral sugerido', 44)} ${
      recommendation.suggested === null ? p.dim('-') : recommendation.suggested.toFixed(2)
    }`,
  );
  out.push(
    `  ${pad('Sobreconfianza (conf - calidad)', 44)} ${recommendation.overconfidence.toFixed(3)}`,
  );
  out.push(`  ${pad('Accion', 44)} ${actionColor(p.bold(recommendation.action.toUpperCase()))}`);
  out.push('');
  out.push(`  ${recommendation.message}`);
  out.push('');

  // --- Fichero de configuracion (donde vive minConfidence) ---
  out.push(p.bold('  CONFIGURACION (minConfidence)'));
  out.push('-'.repeat(80));
  out.push(
    `  ${pad('Fichero de configuracion global', 44)} ${
      config.file ? config.file : p.yellow('no encontrado (declara ROUTER_MIN_CONFIDENCE)')
    }`,
  );
  out.push(
    `  ${pad('Clave', 44)} ${p.dim("mcp.servers['klia-token-optimizer'].environment.ROUTER_MIN_CONFIDENCE")}`,
  );
  out.push(
    `  ${pad('Valor en fichero', 44)} ${config.current === null ? p.dim('-') : config.current.toFixed(2)}`,
  );
  if (!options.write) {
    const hint = recommendation.suggested !== null ? recommendation.suggested.toFixed(2) : '-';
    out.push(
      `  ${pad('Recalibracion automatica', 44)} ${p.yellow('OMITIDA')} ${p.dim(
        `(usa --write para aplicar ${hint})`,
      )}`,
    );
  } else if (writeError) {
    out.push(`  ${pad('Recalibracion automatica', 44)} ${p.red('ERROR')} ${p.dim(writeError)}`);
  } else if (writeResult) {
    const detail = writeResult.changed
      ? `ROUTER_MIN_CONFIDENCE = ${writeResult.updated.toFixed(2)} (backup: ${writeResult.backup})`
      : `ROUTER_MIN_CONFIDENCE ya era ${writeResult.updated.toFixed(2)} (sin cambios)`;
    out.push(`  ${pad('Recalibracion automatica', 44)} ${p.green('APLICADA')} ${p.dim(detail)}`);
    out.push(
      `  ${pad('', 44)} ${p.dim('Reinicia OpenCode para que el MCP recargue la variable.')}`,
    );
  } else {
    out.push(
      `  ${pad('Recalibracion automatica', 44)} ${p.yellow('OMITIDA')} ${p.dim(
        '(sin umbral sugerido o sin datos)',
      )}`,
    );
  }
  out.push('');

  // --- Calibracion por modelo ---
  if (modelRows.length > 0) {
    out.push(p.bold('  CALIBRACION POR MODELO'));
    out.push('-'.repeat(80));
    out.push(
      '  ' +
        pad('MODELO', 30) +
        padLeft('PARES', 7) +
        padLeft('CONF', 8) +
        padLeft('CALIDAD', 9) +
        padLeft('FALLOS-AC', 11) +
        padLeft('SCORE', 8) +
        '  VEREDICTO',
    );
    for (const r of modelRows) {
      const v = verdictShort(r.calibrationScore);
      const vColor = v === 'OK' ? p.green : v === 'MEDIA' ? p.yellow : p.red;
      out.push(
        '  ' +
          pad(r.model, 30) +
          padLeft(String(r.pairsMatched), 7) +
          padLeft(r.avgDeclaredConfidence.toFixed(3), 8) +
          padLeft(r.avgActualQuality.toFixed(3), 9) +
          padLeft(r.failureRateHighConfidence.toFixed(3), 11) +
          padLeft(r.calibrationScore.toFixed(3), 8) +
          '  ' +
          vColor(v),
      );
    }
    out.push('');
  }

  // --- Veredicto final ---
  out.push(sep);
  const overall =
    cal.pairsMatched === 0
      ? p.yellow('SIN DATOS SUFICIENTES')
      : cal.calibrationScore >= 0.7
        ? p.green('CALIBRACION SALUDABLE')
        : p.yellow('CALIBRACION A REVISAR');
  out.push(`  Veredicto: ${overall}`);
  out.push(sep);

  return out.join('\n');
}

/**
 * Punto de entrada CLI: `router calibrate [--no-color] [--json] [--events <p>]
 * [--min-confidence <n>] [--no-model-breakdown]`.
 */
export async function runCalibrateCli(argv: string[]): Promise<void> {
  const parsed = parseCliArgs(argv.slice(2), ['--events', '--min-confidence', '--config']);
  const minConfidenceRaw = parsed.values['--min-confidence'];
  const opts: CalibrateOptions = {
    noColor: parsed.flags.has('--no-color') || !!process.env.NO_COLOR,
    json: parsed.flags.has('--json'),
    eventsPath: parsed.values['--events'],
    minConfidence: minConfidenceRaw !== undefined ? parseFloat(minConfidenceRaw) : undefined,
    byModel: !parsed.flags.has('--no-model-breakdown'),
    write: parsed.flags.has('--write') && !parsed.flags.has('--dry-run'),
    configPath: parsed.values['--config'],
  };

  const output = await runCalibrate(opts);
  process.stdout.write(output.endsWith('\n') ? output : output + '\n');
}
