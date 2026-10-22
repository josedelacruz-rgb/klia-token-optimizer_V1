/**
 * CLI para compactar el almacen de eventos (events.json): caducidad por TTL,
 * purga de pares huerfanos (decision sin ejecucion y viceversa) y rotacion
 * del exceso a ficheros .rotated-<stamp>.json.
 *
 * Uso:
 *   router compact [--events <path>] [--write] [--max-age-days n]
 *                  [--orphan-grace-days n] [--drop-orphan-executions]
 *                  [--purge-synthetic] [--rotate] [--keep-events n]
 *                  [--no-color] [--help]
 *
 * Sin --write solo muestra el informe (dry-run). Con --write persiste los
 * cambios: el store deja un backup timestampado automatico (events.backup-*).
 */
import * as path from 'path';
import { RouterEventStore } from '../history/router-event-store';
import type { CompactReport } from '../history/router-event-store';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightCyan: '\x1b[96m',
};

let colorEnabled = true;

function wrap(code: string, text: string): string {
  return colorEnabled ? `${code}${text}${C.reset}` : text;
}

const bold = (t: string) => wrap(C.bold, t);
const dim = (t: string) => wrap(C.dim, t);
const bCyan = (t: string) => wrap(C.brightCyan, t);
const bGreen = (t: string) => wrap(C.brightGreen, t);

function pad(str: string, len: number): string {
  const s = String(str);
  const visibleLen = s.replace(/\x1b\[[0-9;]*m/g, '').length;
  return s + ' '.repeat(Math.max(0, len - visibleLen));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface CompactDisplayOptions {
  noColor?: boolean;
}

/** Informe legible de la compactacion (dry-run o tras aplicarla). */
export function renderCompactReport(
  report: CompactReport,
  eventsPath: string,
  opts: CompactDisplayOptions = {},
): string {
  colorEnabled = !opts.noColor;
  const out: string[] = [];

  out.push('');
  out.push(bCyan('='.repeat(80)));
  out.push(bold(bCyan('  COMPACTACION DEL STORE DE EVENTOS')));
  out.push(bCyan('='.repeat(80)));
  out.push('');
  out.push(`  ${pad('Fichero', 28)} ${dim(eventsPath)}`);
  out.push(`  ${pad("Eventos examinados", 28)} ${bold(String(report.examined))}`);
  out.push(
    `  ${pad('Caducados por TTL', 28)} ${
      report.removedExpired > 0 ? wrap(C.yellow, String(report.removedExpired)) : dim('0')
    }`,
  );
  out.push(
    `  ${pad('Decisiones huerfanas', 28)} ${
      report.removedOrphanDecisions > 0 ? wrap(C.yellow, String(report.removedOrphanDecisions)) : dim('0')
    }`,
  );
  out.push(
    `  ${pad('Ejecuciones huerfanas', 28)} ${
      report.removedOrphanExecutions > 0 ? wrap(C.yellow, String(report.removedOrphanExecutions)) : dim('0')
    }`,
  );
  out.push(`  ${pad('Eventos conservados', 28)} ${bold(String(report.kept))}`);
  out.push(
    `  ${pad('Tamano antes -> despues', 28)} ${formatBytes(report.bytesBefore)} -> ${formatBytes(report.bytesAfter)}`,
  );

  if (report.rotated && report.rotatedFile) {
    out.push(`  ${pad('Rotacion', 28)} ${bGreen('archivado')} ${dim(report.rotatedFile)}`);
  } else if (report.wouldRotate) {
    out.push(
      `  ${pad('Rotacion', 28)} ${wrap(C.yellow, 'pendiente')} ${dim('(exceso detectado; aplica con --write)')}`,
    );
  } else {
    out.push(`  ${pad('Rotacion', 28)} ${dim('no aplicable')}`);
  }

  const removed = report.removedExpired + report.removedOrphanDecisions + report.removedOrphanExecutions;
  out.push('');
  if (!report.dryRun && (removed > 0 || report.rotated)) {
    out.push(
      `  ${bGreen('APLICADO')}: ${removed} eventos eliminados` +
        `${report.rotated ? ' y exceso archivado' : ''} (backup timestampado creado por el store).`,
    );
  } else if (report.dryRun) {
    out.push(
      removed > 0 || report.wouldRotate
        ? `  ${wrap(C.yellow, 'DRY-RUN')}: nada modificado. Usa --write para aplicar.`
        : `  ${wrap(C.yellow, 'DRY-RUN')}: nada que purgar; el store esta compacto.`,
    );
  } else {
    out.push(`  ${bGreen('APLICADO')}: no habia nada que purgar.`);
  }
  out.push('');
  out.push(dim('  Nota: por defecto las ejecuciones huerfanas se conservan (alimentan el'));
  out.push(dim('  aprendizaje de coste); usalas con --drop-orphan-executions para purgarlas.'));
  out.push('');

  return out.join('\n');
}

const HELP = `Uso: router compact [opciones]

Purga el almacen de eventos (events.json): caducidad por TTL, eliminacion de
pares huerfanos (decision sin ejecucion pareada y viceversa) y rotacion del
exceso a ficheros .rotated-<stamp>.json.

Politica por defecto: TTL 90 dias, gracia de huerfanos 7 dias, decisiones
huerfanas se purgan, ejecuciones huerfanas se conservan y los eventos
sinteticos (benchmark/calibracion) no expiran por edad.

Opciones:
  --events <path>            Ruta al events.json (default: .router-history/events.json)
  --write                    Aplicar la purga (por defecto dry-run)
  --dry-run                  Forzar simulacion (por defecto)
  --max-age-days <n>         TTL en dias (default: 90; 0 desactiva el TTL)
  --orphan-grace-days <n>    Gracia para huerfanos en dias (default: 7)
  --drop-orphan-executions   Purgar tambien ejecuciones sin decision pareada
  --purge-synthetic          El TTL tambien expira eventos sinteticos
  --rotate                   Archivar el exceso a <base>.rotated-<stamp>.json
  --keep-events <n>          Eventos a conservar al rotar (default: 5000)
  --no-color                 Desactivar colores ANSI
  --help, -h                 Mostrar esta ayuda

Ejemplos:
  router compact                      # dry-run con la politica por defecto
  router compact --write              # aplicar purga y crear backup
  router compact --write --rotate --keep-events 20000
  router compact --max-age-days 30 --purge-synthetic --drop-orphan-executions
`;

export interface RunCompactOptions {
  eventsPath?: string;
  write?: boolean;
  maxAgeDays?: number;
  orphanGraceDays?: number;
  dropOrphanExecutions?: boolean;
  purgeSynthetic?: boolean;
  rotate?: boolean;
  keepEvents?: number;
}

/** Ejecuta la compactacion (dry-run salvo write=true) y devuelve el informe. */
export async function runCompact(opts: RunCompactOptions = {}): Promise<CompactReport> {
  const eventsPath = opts.eventsPath ?? path.join(process.cwd(), '.router-history', 'events.json');
  const store = new RouterEventStore(eventsPath);
  return store.compact({
    maxAgeDays: opts.maxAgeDays,
    orphanGraceDays: opts.orphanGraceDays,
    dropOrphanExecutions: opts.dropOrphanExecutions,
    purgeSynthetic: opts.purgeSynthetic,
    rotate: opts.rotate,
    keepEvents: opts.keepEvents,
    dryRun: !opts.write,
  });
}

/** Entry point CLI. */
export async function runCompactCli(argv: string[]): Promise<void> {
  const args = argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const numberFlag = (flag: string, fallback: number): number => {
    const idx = args.indexOf(flag);
    if (idx === -1 || !args[idx + 1]) return fallback;
    const value = Number(args[idx + 1]);
    return Number.isFinite(value) ? value : fallback;
  };

  const eventsFlag = args.indexOf('--events');
  const eventsPath =
    eventsFlag !== -1 && args[eventsFlag + 1]
      ? args[eventsFlag + 1]
      : path.join(process.cwd(), '.router-history', 'events.json');

  const write = args.includes('--write') && !args.includes('--dry-run');
  const noColor = args.includes('--no-color');

  const report = await runCompact({
    eventsPath,
    write,
    maxAgeDays: numberFlag('--max-age-days', 90),
    orphanGraceDays: numberFlag('--orphan-grace-days', 7),
    dropOrphanExecutions: args.includes('--drop-orphan-executions'),
    purgeSynthetic: args.includes('--purge-synthetic'),
    rotate: args.includes('--rotate'),
    keepEvents: numberFlag('--keep-events', 5000),
  });

  console.log(renderCompactReport(report, eventsPath, { noColor }));
}

// Ejecutar si es el entry point.
if (require.main === module) {
  runCompactCli(process.argv).catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}