#!/usr/bin/env node
/**
 * CLI display para el comando `router dashboard`.
 *
 * Inicia el servidor HTTP del dashboard web.
 *
 * Modos:
 *   - Normal: arranca el servidor y el proceso queda bloqueado (Ctrl+C para parar).
 *   - `--detach`: arranca el servidor en un proceso desacoplado, imprime la URL y
 *     termina. Es el modo que usa el comando slash `/klia_dashboard`, porque un
 *     proceso bloqueante haria que la captura de salida del comando nunca
 *     retornase y el usuario no veria nada.
 */

import * as os from 'os';
import * as path from 'path';
import * as net from 'net';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { startWebDashboard } from '../dashboard/web-dashboard';

const DEFAULT_PORT = 6283;
const DEFAULT_HOST = '127.0.0.1';

function resolveKliaHome(): string {
  return (
    process.env.KLIA_HOME ??
    path.join(process.env.USERPROFILE ?? process.env.HOME ?? os.homedir(), '.klia')
  );
}

function dashboardLogPath(): string {
  return path.join(resolveKliaHome(), 'logs', 'dashboard.log');
}

function isPortInUse(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const finish = (inUse: boolean) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/**
 * Lanza el CLI en un proceso desacoplado que se queda sirviendo.
 * Devuelve el PID del hijo. Equivalente a Start-Process en Windows y a
 * `nohup ... &` en Unix, pero multiplataforma desde el propio CLI.
 */
function spawnDetached(cliArgs: string[]): number {
  const script = process.argv[1];
  if (!script) {
    throw new Error('No se pudo localizar el script del CLI (process.argv[1])');
  }
  const execArgs = script.endsWith('.ts')
    ? ['--import', 'tsx', script, ...cliArgs]
    : [script, ...cliArgs];

  const logPath = dashboardLogPath();
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const fd = fs.openSync(logPath, 'a');
  try {
    const child = spawn(process.execPath, execArgs, {
      detached: true,
      stdio: ['ignore', fd, fd],
    });
    child.unref();
    return child.pid ?? 0;
  } finally {
    fs.closeSync(fd);
  }
}

export async function runDashboardCli(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  const portFlag = args.indexOf('--port');
  const hostFlag = args.indexOf('--host');
  const eventsFlag = args.indexOf('--events');
  const benchmarkFlag = args.indexOf('--benchmark');
  const detachFlag = args.indexOf('--detach') !== -1;
  const childFlag = args.indexOf('--child') !== -1;

  const eventsPath =
    eventsFlag !== -1
      ? args[eventsFlag + 1]
      : path.join(resolveKliaHome(), 'data/events.json');

  const benchmarkPath = benchmarkFlag !== -1 ? args[benchmarkFlag + 1] : undefined;

  const port = portFlag !== -1 ? parseInt(args[portFlag + 1], 10) : DEFAULT_PORT;
  const host = hostFlag !== -1 ? args[hostFlag + 1] : DEFAULT_HOST;

  if (detachFlag && !childFlag) {
    if (await isPortInUse(port, host)) {
      console.log(`Ya hay un dashboard KLIA escuchando en http://${host}:${port}`);
      console.log('No se lanza otro servidor. Usa --port <n> para otro puerto.');
      return;
    }
    try {
      const pid = spawnDetached([...args, '--child']);
      console.log(`[Klia Dashboard] http://${host}:${port}`);
      console.log(`  Servidor en segundo plano (PID ${pid}).`);
      console.log(`  Events: ${eventsPath}`);
      if (benchmarkPath) console.log(`  Benchmark: ${benchmarkPath}`);
      console.log(`  Log: ${dashboardLogPath()}`);
      console.log(`  Detener: taskkill /PID ${pid} /F   (Windows)  |  kill ${pid}   (Unix)`);
    } catch (err) {
      console.error(`No se pudo lanzar el dashboard en segundo plano: ${(err as Error).message}`);
      process.exitCode = 1;
    }
    return;
  }

  console.log(`Iniciando dashboard...`);
  console.log(`  http://${host}:${port}`);
  console.log(`  Events: ${eventsPath}`);
  if (benchmarkPath) console.log(`  Benchmark: ${benchmarkPath}`);
  console.log('Presiona Ctrl+C para detener.\n');

  startWebDashboard({ port, host, eventsPath, benchmarkPath });

  // Mantener el proceso vivo
  await new Promise(() => {});
}
