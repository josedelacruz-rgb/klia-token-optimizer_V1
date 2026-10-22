import * as fs from 'fs';
import * as path from 'path';
import type { Optimizer, RouterEvent, TaskType } from '../types';
import { ROUTER_EVENT_SCHEMA_VERSION } from '../types';
import { isMigratedToV2, migrateV1ToV2 } from './migrate';
import { writeFileSyncAtomic } from '../utils/json';

/** Dias de vida util de un evento antes de la caducidad por TTL. */
export const DEFAULT_MAX_AGE_DAYS = 90;

/** Dias de gracia antes de purgar un par huerfano (protege sesiones en curso). */
export const DEFAULT_ORPHAN_GRACE_DAYS = 7;

/** Eventos conservados en el fichero activo al rotar. */
export const DEFAULT_KEEP_EVENTS = 5000;

/**
 * Politica de compactacion del store. Ver planCompact() para la semantica.
 */
export interface CompactOptions {
  /** TTL en dias: eventos con timestamp mas viejo caducan. 0 desactiva el TTL. */
  maxAgeDays?: number;
  /** Solo se purga un huerfano si su antiguedad supera estos dias. */
  orphanGraceDays?: number;
  /** Purgar decisiones sin ejecucion pareada (default: true). */
  dropOrphanDecisions?: boolean;
  /**
   * Purgar ejecuciones sin decision pareada (default: false).
   * Las ejecuciones alimentan el aprendizaje de coste por (modelo, tarea,
   * optimizador) aunque el par decision-ejecucion se haya roto, asi que por
   * defecto se conservan y solo expiran por TTL.
   */
  dropOrphanExecutions?: boolean;
  /** El TTL tambien caduca eventos sinteticos (default: false: calibracion). */
  purgeSynthetic?: boolean;
  /** Simulacion: calcula el informe sin escribir nada. */
  dryRun?: boolean;
  /** Archivar el exceso (eventos mas antiguos) a un .rotated-<stamp>.json. */
  rotate?: boolean;
  /** Eventos a conservar en el fichero activo al rotar (default: DEFAULT_KEEP_EVENTS). */
  keepEvents?: number;
  /** Instante de referencia para TTL y gracia (inyectable en tests). */
  now?: Date;
}

/** Conteo de bajas de la compactacion, sin medidas de E/S. */
export interface CompactStats {
  /** Eventos leidos al entrar. */
  examined: number;
  /** Eventos caducados por TTL. */
  removedExpired: number;
  /** Decisiones huerfanas purgadas. */
  removedOrphanDecisions: number;
  /** Ejecuciones huerfanas purgadas. */
  removedOrphanExecutions: number;
  /** Eventos que permanecen tras la compactacion. */
  kept: number;
}

/** Informe completo de compactacion del store. */
export interface CompactReport extends CompactStats {
  /** Tamano del fichero antes de la operacion (bytes). */
  bytesBefore: number;
  /** Tamano estimado tras la compactacion (JSON de los conservados). */
  bytesAfter: number;
  dryRun: boolean;
  /** Se archivo el exceso a un fichero .rotated (solo fuera de dry-run). */
  rotated: boolean;
  /** La rotacion aplicaria (dry-run con --rotate y exceso detectado). */
  wouldRotate: boolean;
  /** Ruta del fichero de archivo creado por la rotacion. */
  rotatedFile?: string;
}

/**
 * Store unificado para RouterEvent (esquema v2).
 *
 * Reemplaza a JsonHistoryStore + McpMetricsStore. Persiste eventos en un único
 * archivo JSON, migrando automáticamente registros v1 si los detecta.
 */
export class RouterEventStore {
  private filePath: string;
  private lock: Promise<unknown> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.ensureFile();
  }

  private ensureFile(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2), 'utf-8');
    }
  }

  private read(): RouterEvent[] {
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown[];

    // Migración perezosa: si hay registros v1, se migran en memoria.
    // No se persiste aquí para no sorprender al usuario; usar migrateFile().
    if (parsed.length === 0) return [];
    if (isMigratedToV2(parsed)) {
      return parsed as RouterEvent[];
    }
    // Asumimos ExecutionRecord v1
    return migrateV1ToV2(parsed as Parameters<typeof migrateV1ToV2>[0]);
  }

  private write(events: RouterEvent[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify(events, null, 2), 'utf-8');
  }

  async add(event: RouterEvent): Promise<void> {
    this.lock = this.lock.then(async () => {
      const events = this.read();
      events.push(event);
      this.write(events);
    });
    await this.lock;
  }

  list(): RouterEvent[] {
    return this.read();
  }

  /**
   * Persiste la migración v1->v2 en el archivo. Devuelve el número de
   * eventos migrados. Si ya estaba migrado, devuelve 0.
   */
  migrateFile(): number {
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown[];
    if (parsed.length === 0) return 0;
    if (isMigratedToV2(parsed)) return 0;
    const migrated = migrateV1ToV2(parsed as Parameters<typeof migrateV1ToV2>[0]);
    this.write(migrated);
    return migrated.length;
  }

  /**
   * Filtra eventos por tipo, modelo, tarea, optimizador, fuente y no-sintéticos.
   */
  query(filter: {
    type?: 'decision' | 'execution';
    model?: string;
    taskType?: TaskType;
    optimizer?: Optimizer;
    source?: RouterEvent['source'];
    excludeSynthetic?: boolean;
    sessionId?: string;
  }): RouterEvent[] {
    const events = this.read();
    return events.filter((e) => {
      if (filter.type && e.type !== filter.type) return false;
      if (filter.model && e.model !== filter.model) return false;
      if (filter.taskType && e.taskType !== filter.taskType) return false;
      if (filter.sessionId && e.sessionId !== filter.sessionId) return false;
      if (filter.source && e.source !== filter.source) return false;
      if (filter.excludeSynthetic && e.synthetic) return false;
      if (filter.optimizer) {
        if (filter.type === 'decision') {
          if (e.decision?.optimizer !== filter.optimizer) return false;
        } else if (filter.type === 'execution') {
          if (e.execution?.optimizer !== filter.optimizer) return false;
        } else {
          const opt = e.decision?.optimizer ?? e.execution?.optimizer;
          if (opt !== filter.optimizer) return false;
        }
      }
      return true;
    });
  }

  /**
   * Marca todos los eventos existentes como sintéticos (para benchmark).
   * Útil al sembrar datos de calibración.
   */
  markAllAsSynthetic(source: RouterEvent['source'] = 'benchmark'): number {
    const events = this.read();
    for (const e of events) {
      e.synthetic = true;
      if (!e.source || e.source === 'mcp') e.source = source;
    }
    this.write(events);
    return events.length;
  }

  /**
   * Compacta el fichero de eventos: caducidad por TTL, purga de pares
   * huerfanos (decision sin ejecucion y viceversa) y, con `rotate`, archiva
   * el exceso a un fichero .rotated-<stamp>.json conservando los keepEvents
   * mas recientes. En dry-run no escribe nada. Fuera de dry-run deja un
   * backup timestampado del fichero antes de sobreescribir.
   */
  async compact(options: CompactOptions = {}): Promise<CompactReport> {
    const events = this.read();
    let bytesBefore = 0;
    try {
      bytesBefore = fs.statSync(this.filePath).size;
    } catch {
      bytesBefore = 0;
    }

    const { kept, stats } = planCompact(events, options);

    let finalEvents = kept;
    let rotated = false;
    let rotatedFile: string | undefined;
    if (options.rotate && !options.dryRun) {
      const keepEvents = options.keepEvents ?? DEFAULT_KEEP_EVENTS;
      if (finalEvents.length > keepEvents) {
        const dir = path.dirname(this.filePath);
        const ext = path.extname(this.filePath);
        const base = path.basename(this.filePath, ext);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        rotatedFile = path.join(dir, `${base}.rotated-${stamp}${ext}`);
        // El orden del array es cronologico (los add() hacen push al final),
        // asi que la cabeza son los mas antiguos.
        const archive = finalEvents.slice(0, finalEvents.length - keepEvents);
        finalEvents = finalEvents.slice(finalEvents.length - keepEvents);
        writeFileSyncAtomic(rotatedFile, JSON.stringify(archive, null, 2));
        rotated = true;
      }
    }

    const removed =
      stats.removedExpired + stats.removedOrphanDecisions + stats.removedOrphanExecutions;
    if (!options.dryRun && (rotated || removed > 0)) {
      // Backup timestampado antes de sobreescribir (politica del store).
      try {
        const fileStats = fs.statSync(this.filePath);
        if (fileStats.size > 0) {
          const dir = path.dirname(this.filePath);
          const ext = path.extname(this.filePath);
          const base = path.basename(this.filePath, ext);
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          fs.copyFileSync(this.filePath, path.join(dir, `${base}.backup.${stamp}${ext}`));
        }
      } catch {
        // Si no existe el fichero aun, no hay nada que respaldar
      }
      this.write(finalEvents);
    }

    const bytesAfter = Buffer.byteLength(JSON.stringify(finalEvents, null, 2), 'utf8');
    let wouldRotate = false;
    if (options.rotate && options.dryRun) {
      const keepEvents = options.keepEvents ?? DEFAULT_KEEP_EVENTS;
      wouldRotate = kept.length > keepEvents;
    }

    return {
      ...stats,
      bytesBefore,
      bytesAfter,
      dryRun: options.dryRun === true,
      rotated,
      wouldRotate,
      rotatedFile: rotated ? rotatedFile : undefined,
    };
  }
}

/**
 * Calcula que eventos sobreviven a la compactacion. Funcion pura: no toca
 * ningun fichero, lo que permite testear la politica de purga de forma aislada.
 *
 * Doble filtro:
 * 1. Caducidad por TTL: eventos con timestamp anterior a maxAgeDays salen.
 *    Los sinteticos se conservan salvo que se active purgeSynthetic (los datos
 *    de calibracion/benchmark no deberian desaparecer por edad). Los eventos
 *    con timestamp ausente o invalido se consideran caducados.
 * 2. Pares huerfanos: se calculan SOLO entre los supervivientes de la fase 1,
 *    de modo que si la ejecucion de una decision caduco por TTL, la decision
 *    queda huerfana en cascada. Un evento esta pareado si comparte sessionId
 *    con al menos un evento del tipo contrario (semantica de pertenencia,
 *    mas conservadora que balancear conteos). Las sesiones sin sessionId no
 *    pueden emparejarse nunca. Para no machacar sesiones en curso, un huerfano
 *    solo se purga si su antiguedad supera orphanGraceDays.
 */
export function planCompact(
  events: RouterEvent[],
  options: CompactOptions = {},
): { kept: RouterEvent[]; stats: CompactStats } {
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const orphanGraceDays = options.orphanGraceDays ?? DEFAULT_ORPHAN_GRACE_DAYS;
  const dropOrphanDecisions = options.dropOrphanDecisions ?? true;
  const dropOrphanExecutions = options.dropOrphanExecutions ?? false;
  const purgeSynthetic = options.purgeSynthetic ?? false;
  const now = (options.now ?? new Date()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const ttlCutoff = maxAgeDays > 0 ? now - maxAgeDays * dayMs : Number.NEGATIVE_INFINITY;
  const orphanCutoff = now - orphanGraceDays * dayMs;

  // Fase 1: caducidad por TTL.
  const survivors: RouterEvent[] = [];
  let removedExpired = 0;
  for (const e of events) {
    if (e.synthetic && !purgeSynthetic) {
      survivors.push(e);
      continue;
    }
    const ts = Date.parse(e.timestamp ?? '');
    if (Number.isNaN(ts) || ts < ttlCutoff) {
      removedExpired++;
    } else {
      survivors.push(e);
    }
  }

  // Fase 2: huerfanos entre supervivientes.
  const execSessions = new Set<string>();
  const decisionSessions = new Set<string>();
  for (const e of survivors) {
    if (!e.sessionId) continue;
    if (e.type === 'execution') {
      execSessions.add(e.sessionId);
    } else {
      decisionSessions.add(e.sessionId);
    }
  }

  const kept: RouterEvent[] = [];
  let removedOrphanDecisions = 0;
  let removedOrphanExecutions = 0;
  for (const e of survivors) {
    // Emparejamiento cruzado: una decision necesita una execution con el mismo
    // sessionId (y viceversa); comparar contra el propio tipo autovalidaria al
    // ultimo evento superviviente de una sesion rota.
    const siblingSessions = e.type === 'execution' ? decisionSessions : execSessions;
    const isOrphan = !e.sessionId || !siblingSessions.has(e.sessionId);
    // Los eventos sin timestamp ya hubieran caducado (o son sinteticos sin
    // fecha): en ese caso no se purgan como huerfanos, solo expiran por TTL.
    const ts = Date.parse(e.timestamp ?? '');
    const isStale = !Number.isNaN(ts) && ts < orphanCutoff;
    if (isOrphan && isStale) {
      if (e.type === 'decision' ? dropOrphanDecisions : dropOrphanExecutions) {
        if (e.type === 'decision') removedOrphanDecisions++;
        else removedOrphanExecutions++;
        continue;
      }
    }
    kept.push(e);
  }

  return {
    kept,
    stats: {
      examined: events.length,
      removedExpired,
      removedOrphanDecisions,
      removedOrphanExecutions,
      kept: kept.length,
    },
  };
}

/**
 * Crea un RouterEvent de tipo 'decision'.
 */
export function createDecisionEvent(params: {
  sessionId?: string;
  projectId?: string;
  query: string;
  model: string;
  modelFamily: string;
  taskType: TaskType;
  signals: RouterEvent['signals'];
  decision: RouterEvent['decision'];
  source: RouterEvent['source'];
  synthetic?: boolean;
}): RouterEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    schemaVersion: ROUTER_EVENT_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    type: 'decision',
    sessionId: params.sessionId,
    projectId: params.projectId,
    query: params.query,
    model: params.model,
    modelFamily: params.modelFamily,
    taskType: params.taskType,
    signals: params.signals,
    decision: params.decision,
    source: params.source,
    synthetic: params.synthetic,
  };
}

/**
 * Crea un RouterEvent de tipo 'execution'.
 */
export function createExecutionEvent(params: {
  sessionId?: string;
  projectId?: string;
  query: string;
  model: string;
  modelFamily: string;
  taskType: TaskType;
  signals: RouterEvent['signals'];
  execution: RouterEvent['execution'];
  source: RouterEvent['source'];
  synthetic?: boolean;
}): RouterEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    schemaVersion: ROUTER_EVENT_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    type: 'execution',
    sessionId: params.sessionId,
    projectId: params.projectId,
    query: params.query,
    model: params.model,
    modelFamily: params.modelFamily,
    taskType: params.taskType,
    signals: params.signals,
    execution: params.execution,
    source: params.source,
    synthetic: params.synthetic,
  };
}
