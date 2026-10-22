/**
 * Parser minimo de argumentos de linea de comandos.
 *
 * Distingue entre flags con valor (--events <path>) y flags booleanos
 * (--no-color, --dry-run). Todo token que no empiece por "--" se considera
 * posicional (util para comandos como `import <fichero>`).
 */
export interface ParsedArgs {
  /** Tokens que no son flags (ni valores de flags). */
  positionals: string[];
  /** Valor de cada flag con valor, por nombre exacto del flag. */
  values: Record<string, string>;
  /** Conjunto de flags booleanos presentes (y flags con valor sin su valor). */
  flags: Set<string>;
}

export function parseCliArgs(tokens: string[], valueFlags: string[]): ParsedArgs {
  const positionals: string[] = [];
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  const valueSet = new Set(valueFlags);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith('--')) {
      if (valueSet.has(token) && i + 1 < tokens.length) {
        values[token] = tokens[++i];
      } else {
        flags.add(token);
      }
    } else {
      positionals.push(token);
    }
  }

  return { positionals, values, flags };
}
