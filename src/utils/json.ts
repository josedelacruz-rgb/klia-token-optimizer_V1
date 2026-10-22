import * as fs from 'fs';
import * as path from 'path';

/**
 * Garantiza que el directorio y el archivo JSON existan.
 *
 * Si el directorio no existe se crea (recursivo). Si el archivo no existe se
 * inicializa con un array vacio. Compartido por los stores de historial.
 */
export function ensureJsonFile(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf-8');
  }
}

/**
 * Elimina el BOM (Byte Order Mark, U+FEFF) del inicio de un string.
 *
 * Algunos editores en Windows (notably PowerShell > Out-File, Notepad)
 * anaden un BOM UTF-8 (EF BB BF) al inicio de los archivos JSON.
 * JSON.parse falla con "Unexpected token '\uFEFF'" si el BOM esta presente.
 */
export function stripBom(text: string): string {
  if (text.length > 0 && text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

/**
 * Lee un archivo JSON de forma sincrona, eliminando BOM si existe.
 */
export function readJsonSync(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(stripBom(raw));
}

/**
 * Lee un archivo JSON de forma asincrona, eliminando BOM si existe.
 */
export async function readJsonAsync(filePath: string): Promise<unknown> {
  const raw = await fs.promises.readFile(filePath, 'utf-8');
  return JSON.parse(stripBom(raw));
}

/**
 * Nombre del fichero temporal para una escritura atomica.
 *
 * Se anade un sufijo con pid + timestamp para que dos escritores concurrentes
 * (plugin spawn CLI vs MCP server) nunca compartan fichero temporal.
 */
function atomicTempPath(filePath: string): string {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const dir = path.dirname(filePath);
  return path.join(dir, `.${base}.tmp.${process.pid}.${Date.now()}${ext}`);
}

function renameWithRetry(tmp: string, target: string, attempts = 5, delayMs = 50): void {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, target);
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      const transient = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
      if (!transient || i >= attempts - 1) throw err;
      // Windows bloquea transitoriamente ficheros recientemente escritos
      // (antivirus/indexador). Reintentos con backoff evita EPERM esporadico.
      const until = Date.now() + delayMs * (i + 1);
      while (Date.now() < until) {
        /* busy-wait deliberado: no usamos timers en codigo sync */
      }
    }
  }
}

/**
 * Escritura atomica sincrona de un string: temp + rename.
 *
 * rename() es atomico en el mismo volumen, asi que un crash a mitad de
 * escritura deja el fichero anterior intacto (o el nuevo completo), nunca
 * un JSON truncado a mitad de linea.
 */
export function writeFileSyncAtomic(filePath: string, content: string): void {
  const tmp = atomicTempPath(filePath);
  try {
    fs.writeFileSync(tmp, content, 'utf-8');
    renameWithRetry(tmp, filePath);
  } finally {
    // Si rename fallo, limpiar el temporal para no acumular basura.
    if (fs.existsSync(tmp)) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* noop */
      }
    }
  }
}

/**
 * Escritura atomica asincrona de un string: temp + rename.
 */
export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tmp = atomicTempPath(filePath);
  try {
    await fs.promises.writeFile(tmp, content, 'utf-8');
    // Reintentos para EPERM/EBUSY transitorio de Windows (antivirus/indexador).
    for (let i = 0; ; i++) {
      try {
        await fs.promises.rename(tmp, filePath);
        return;
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code ?? '';
        const transient = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
        if (!transient || i >= 4) throw err;
        await new Promise((r) => setTimeout(r, 50 * (i + 1)));
      }
    }
  } catch (err) {
    try {
      await fs.promises.unlink(tmp);
    } catch {
      /* noop */
    }
    throw err;
  }
}
