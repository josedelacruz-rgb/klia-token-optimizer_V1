#!/usr/bin/env node
/**
 * CLI display para el comando `router autopilot`.
 *
 * Evalua metricas y muestra acciones automaticas recomendadas.
 */

import * as os from 'os';
import * as path from 'path';
import { AutoPilot } from '../autopilot/auto-pilot';
import { readJsonSync } from '../utils/json';
import type { RouterEvent } from '../types';

export async function runAutopilotCli(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  const jsonFlag = args.includes('--json');
  const eventsFlag = args.indexOf('--events');
  const disableFlag = args.includes('--disable');
  const enableFlag = args.includes('--enable');

  const eventsPath =
    eventsFlag !== -1
      ? args[eventsFlag + 1]
      : path.join(
          process.env.KLIA_HOME ??
            (process.env.USERPROFILE ?? process.env.HOME ?? os.homedir()) + '/.klia',
          'data/events.json',
        );

  const autoPilot = new AutoPilot();

  if (disableFlag) {
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    autoPilot.disableUntil(until);
    console.log(`Auto-pilot desactivado hasta ${until}`);
    return;
  }
  if (enableFlag) {
    autoPilot.enable();
    console.log('Auto-pilot reactivado');
    return;
  }

  // Calcular metricas basicas
  const events: RouterEvent[] = (() => {
    try {
      return readJsonSync(eventsPath) as RouterEvent[];
    } catch {
      return [];
    }
  })();

  const executions = events.filter((e: RouterEvent) => e.type === 'execution');
  const recent = executions.filter(
    (e: RouterEvent) => Date.now() - new Date(e.timestamp).getTime() < 60 * 60 * 1000,
  );
  const tokensLastHour = recent.reduce(
    (sum: number, e: RouterEvent) => sum + (e.execution?.totalTokens ?? 0),
    0,
  );
  const failureCount = recent.filter((e: RouterEvent) => e.execution?.failed).length;
  const failureRate = recent.length > 0 ? failureCount / recent.length : 0;

  const metrics = {
    eventsPath,
    tokensLastHour,
    failureRateLastHour: failureRate,
    totalEvents: events.length,
  };

  const actions = autoPilot.checkAndAct(metrics);

  if (jsonFlag) {
    console.log(JSON.stringify({ metrics, actions }, null, 2));
  } else {
    console.log(`Auto-pilot check`);
    console.log(`  Tokens ultima hora: ${tokensLastHour.toLocaleString('es-ES')}`);
    console.log(`  Tasa fallo (1h): ${(failureRate * 100).toFixed(1)}%`);
    console.log(`  Total eventos: ${events.length}`);
    console.log(`\nAcciones recomendadas (${actions.length}):`);
    if (actions.length === 0) {
      console.log('  (ninguna - sistema estable)');
    } else {
      for (const action of actions) {
        console.log(`  [${action.type}] ${action.reason}`);
      }
    }
  }
}
