/** @jsxImportSource @opentui/solid */
/**
 * Plugin TUI de KLIA para Kilo Code y OpenCode v1 (misma API heredada).
 *
 * Kilo y OpenCode 1.x comparten la API de plugins TUI (`{ id, tui }` +
 * `api.slots.register` con slots en snake_case): el TUI de Kilo es herencia
 * del de OpenCode v1 y ambos llevan @opentui embebido. Este fichero sirve a
 * los dos; el instalador lo copia a ~/.config/kilo/tui/klia-badge/ y a
 * ~/.config/opencode/tui/klia-badge/ y registra la ruta absoluta en el
 * tui.json correspondiente (clave plugin).
 *
 * Dos slots:
 *   1. session_prompt_right  -> badge naranja "KLIA <tipo>"
 *   2. sidebar_content       -> panel con metricas agregadas del router
 *
 * El estado lo escribe klia-router-inject en ~/.klia/data/.klia-class-state.json;
 * las metricas se leen de ~/.klia/data/events.json (v2) con fallback a
 * history.json (v1). Se observan ambos ficheros con watchFile.
 *
 * Desactivable con KLIA_BADGE_DISABLED=1.
 */
import { unwatchFile, watchFile } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createMemo, createSignal, Show } from 'solid-js';
import { badgeLabel, BADGE_COLOR, readClassState, type ClassState } from './state';
import {
  computeAggregates,
  readEvents,
  readHistory,
  type ExecutionEvent,
  type HistoryRecord,
  type SystemAggregates,
} from './metrics';

const KLIA_HOME = process.env.KLIA_HOME ?? homedir() + '/.klia';
const STATE_FILE = path.join(KLIA_HOME, 'data', '.klia-class-state.json');
const HISTORY_FILE = path.join(KLIA_HOME, 'data', 'history.json');
const EVENTS_FILE = path.join(KLIA_HOME, 'data', 'events.json');
const POLL_INTERVAL_MS = 1500;

interface LineDef {
  text: string;
  color?: string;
  dim?: boolean;
}

/**
 * Lineas del panel lateral: metricas agregadas del router (calmado).
 */
function sidebarLines(agg: SystemAggregates): LineDef[] {
  const lines: LineDef[] = [{ text: 'KLIA System Status', color: BADGE_COLOR }];

  if (agg.executions === 0) {
    lines.push({ text: 'Sin datos aun', dim: true });
    lines.push({ text: 'Dashboard: /klia_dashboard', dim: true });
    return lines;
  }

  lines.push({ text: `${agg.executions} ejecuciones | Fase: ${agg.phase}` });

  const tokTotalK = (agg.tokensTotal / 1000).toFixed(1);
  const tokAvgK = (agg.tokensAvg / 1000).toFixed(1);
  lines.push({ text: `${tokTotalK}k tot | ~${tokAvgK}k avg` });

  const statusColor = agg.successRate >= 80 ? '#00CC66' : agg.successRate >= 50 ? '#FFCC00' : '#FF4444';
  lines.push({ text: `${agg.successRate}% exito | Top: ${agg.topOptimizer}`, color: statusColor });

  if (agg.hasSavings) {
    lines.push({
      text: `Ahorro: ${(agg.tokensSaved / 1000).toFixed(1)}k tok (${agg.savingsPercent}%)`,
      color: agg.tokensSaved >= 0 ? '#00CC66' : '#FF4444',
    });
  }

  const budgetAlerts = countBudgetAlerts(agg);
  if (budgetAlerts > 0) {
    lines.push({ text: `${budgetAlerts} ejec. recientes con burn`, color: '#FF4444' });
  } else {
    lines.push({ text: 'Burn: OK', dim: true });
  }

  return lines;
}

function countBudgetAlerts(agg: SystemAggregates): number {
  void agg;
  return 0;
}

/** Badge naranja con la ultima clasificacion del router. */
function Badge(props: { label: () => string | undefined }) {
  return (
    <Show when={props.label()}>
      <text fg={BADGE_COLOR}>{props.label()}</text>
    </Show>
  );
}

/** Panel lateral con las metricas agregadas del router. */
function SidebarPanel(props: { lines: () => LineDef[] }) {
  return (
    <Show when={props.lines().length > 0}>
      <box flexDirection="column" gap={0} flexShrink={0}>
        {props.lines().map((line, i) => (
          <text key={String(i)} fg={line.color} dim={line.dim}>
            {line.text}
          </text>
        ))}
      </box>
    </Show>
  );
}

const tui = async (api: {
  slots: { register: (plugin: unknown) => string };
  lifecycle?: { onDispose: (fn: () => void) => void };
}) => {
  const [state, setState] = createSignal<ClassState | null>(readClassState(STATE_FILE));
  const [history, setHistory] = createSignal<HistoryRecord[]>(readHistory(HISTORY_FILE));
  const [events, setEvents] = createSignal<ExecutionEvent[]>(readEvents(EVENTS_FILE));

  const label = createMemo(() => badgeLabel(state()));
  const lines = createMemo(() => sidebarLines(computeAggregates(events(), history())));
  let lastTs = state()?.ts ?? null;

  try {
    watchFile(STATE_FILE, { interval: POLL_INTERVAL_MS }, () => {
      try {
        const next = readClassState(STATE_FILE);
        if (next && next.ts !== lastTs) {
          lastTs = next.ts;
          setState(next);
        }
      } catch {
        /* noop */
      }
    });
  } catch {
    /* noop */
  }

  try {
    watchFile(HISTORY_FILE, { interval: POLL_INTERVAL_MS }, () => {
      try {
        setHistory(readHistory(HISTORY_FILE));
      } catch {
        /* noop */
      }
    });
  } catch {
    /* noop */
  }

  try {
    watchFile(EVENTS_FILE, { interval: POLL_INTERVAL_MS }, () => {
      try {
        setEvents(readEvents(EVENTS_FILE));
      } catch {
        /* noop */
      }
    });
  } catch {
    /* noop */
  }

  api.slots.register({
    order: 250,
    slots: {
      session_prompt_right() {
        return (
          <box flexDirection="row" gap={1} flexShrink={0}>
            <Badge label={label} />
          </box>
        );
      },
      sidebar_content() {
        return <SidebarPanel lines={lines} />;
      },
    },
  });

  api.lifecycle?.onDispose(() => {
    try {
      unwatchFile(STATE_FILE);
    } catch {
      /* noop */
    }
    try {
      unwatchFile(HISTORY_FILE);
    } catch {
      /* noop */
    }
    try {
      unwatchFile(EVENTS_FILE);
    } catch {
      /* noop */
    }
  });
};

export default {
  id: 'klia-badge',
  tui,
};
