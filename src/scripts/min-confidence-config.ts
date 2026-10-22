/**
 * Aplicacion de la recomendacion de calibracion sobre el fichero de configuracion
 * global de OpenCode.
 *
 * El router lee `minConfidence` de la variable de entorno `ROUTER_MIN_CONFIDENCE`,
 * declarada en la configuracion GLOBAL de OpenCode dentro del bloque del MCP:
 *   - V2: `mcp.servers['klia-token-optimizer'].environment.ROUTER_MIN_CONFIDENCE`
 *   - V1: `mcp['klia-token-optimizer'].env.ROUTER_MIN_CONFIDENCE`
 *
 * `applyMinConfidence` reescribe SOLO el literal del valor con una regex
 * quirurgica (conserva comentarios y formato del JSONC) y crea una copia de
 * seguridad `<fichero>.bak-<timestamp>` antes de tocar nada.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface MinConfidenceConfigLocation {
  /** Fichero de configuracion detectado (o null si no se encontro). */
  file: string | null;
  /** Valor actual de ROUTER_MIN_CONFIDENCE leido del fichero (o null). */
  current: number | null;
}

export interface MinConfidenceWriteResult {
  file: string;
  previous: number | null;
  updated: number;
  /** Ruta del backup creado (o null si el valor ya estaba aplicado). */
  backup: string | null;
  /** true si el fichero se modifico realmente. */
  changed: boolean;
}

/** Regex que casa el valor literal de ROUTER_MIN_CONFIDENCE como string. */
const KEY_VALUE_RE = /(['"]ROUTER_MIN_CONFIDENCE['"]\s*:\s*)(['"])([^'"]*)\2/;

/**
 * Candidatos de configuracion global de OpenCode, en orden de prioridad.
 * Misma politica que `findOpencodeConfig` de klia-discovery.ts.
 */
function configCandidates(): string[] {
  const candidates: string[] = [];
  const override = process.env.KLIA_OPENCODE_CONFIG;
  if (override) candidates.push(override);

  const homes = [os.homedir(), process.env.USERPROFILE, process.env.HOME].filter(
    (h): h is string => typeof h === 'string' && h.length > 0,
  );
  for (const home of homes) {
    const dir = path.join(home, '.config', 'opencode');
    candidates.push(path.join(dir, 'opencode.json'));
    candidates.push(path.join(dir, 'opencode.jsonc'));
  }
  return candidates;
}

/** Lee el valor actual de ROUTER_MIN_CONFIDENCE de un fichero de configuracion. */
export function readMinConfidence(file: string): number | null {
  const raw = fs.readFileSync(file, 'utf-8');
  const match = raw.match(KEY_VALUE_RE);
  if (!match) return null;
  const parsed = parseFloat(match[3]);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Localiza el fichero de configuracion global de OpenCode que declara el MCP
 * del router y devuelve su ruta junto con el minConfidence actual.
 */
export function resolveMinConfidenceConfig(explicit?: string): MinConfidenceConfigLocation {
  if (explicit) {
    if (!fs.existsSync(explicit)) return { file: explicit, current: null };
    return { file: explicit, current: readMinConfidence(explicit) };
  }

  for (const file of configCandidates()) {
    try {
      if (!fs.existsSync(file)) continue;
      // Solo nos interesa el fichero que realmente declara el MCP del router.
      if (readMinConfidence(file) === null) continue;
      return { file, current: readMinConfidence(file) };
    } catch {
      // candidato inaccesible; probar el siguiente
    }
  }
  return { file: null, current: null };
}

/**
 * Persiste el nuevo `minConfidence` en el fichero de configuracion global.
 * Conserva comentarios y formato (solo sustituye el literal del valor) y crea
 * un backup `.bak-<timestamp>` antes de escribir.
 */
export function applyMinConfidence(file: string, value: number): MinConfidenceWriteResult {
  const raw = fs.readFileSync(file, 'utf-8');
  const previous = readMinConfidence(file);

  if (!KEY_VALUE_RE.test(raw)) {
    throw new Error(
      `No se encontro ROUTER_MIN_CONFIDENCE en ${file}. ` +
        "Anade la clave en mcp.servers['klia-token-optimizer'].environment (V2) " +
        "o mcp['klia-token-optimizer'].env (V1) para habilitar la recalibracion automatica.",
    );
  }

  const literal = value.toFixed(2);
  const updatedRaw = raw.replace(
    KEY_VALUE_RE,
    (_m, prefix: string, quote: string) => `${prefix}${quote}${literal}${quote}`,
  );
  const changed = updatedRaw !== raw;

  let backup: string | null = null;
  if (changed) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backup = `${file}.bak-${stamp}`;
    fs.copyFileSync(file, backup);
    fs.writeFileSync(file, updatedRaw, 'utf-8');
  }

  return { file, previous, updated: value, backup, changed };
}
