import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  decidePopup,
  formatPopupMessage,
  hasMcpEntry,
  isWithinInterval,
  loadHealthState,
  parsePopupPolicy,
  resolveEventsCandidates,
  resolveRuntimeCli,
  saveHealthState,
  severityOf,
  stripJsonComments,
  summarize,
} from '../src/scripts/health-check';

const tmpDir = path.join(__dirname, '.tmp-health-check');

describe('severityOf y summarize', () => {
  it('fail gana sobre warn y ok', () => {
    expect(severityOf([
      { id: 'a', label: 'a', status: 'ok', detail: '' },
      { id: 'b', label: 'b', status: 'warn', detail: '' },
      { id: 'c', label: 'c', status: 'fail', detail: '' },
    ])).toBe('fail');
    expect(severityOf([
      { id: 'a', label: 'a', status: 'ok', detail: '' },
      { id: 'b', label: 'b', status: 'warn', detail: '' },
    ])).toBe('warn');
    expect(severityOf([{ id: 'a', label: 'a', status: 'ok', detail: '' }])).toBe('ok');
  });

  it('cuenta por estado', () => {
    expect(summarize([
      { id: 'a', label: 'a', status: 'ok', detail: '' },
      { id: 'b', label: 'b', status: 'ok', detail: '' },
      { id: 'c', label: 'c', status: 'warn', detail: '' },
      { id: 'd', label: 'd', status: 'fail', detail: '' },
    ])).toEqual({ ok: 2, warn: 1, fail: 1 });
  });
});

describe('parsePopupPolicy y decidePopup', () => {
  it('mapea la politica de entorno', () => {
    expect(parsePopupPolicy(undefined)).toBe('always');
    expect(parsePopupPolicy('ALWAYS')).toBe('always');
    expect(parsePopupPolicy('fail-only')).toBe('fail-only');
    expect(parsePopupPolicy('off')).toBe('off');
    expect(parsePopupPolicy('otra-cosa')).toBe('always');
  });

  it('run completo con politica always abre popup', () => {
    expect(decidePopup({ policy: 'always', status: 'ok', cached: false, popupFlag: false, noPopupFlag: false, disabled: false })).toBe(true);
  });

  it('run cacheado no abre popup salvo --popup', () => {
    expect(decidePopup({ policy: 'always', status: 'ok', cached: true, popupFlag: false, noPopupFlag: false, disabled: false })).toBe(false);
    expect(decidePopup({ policy: 'always', status: 'ok', cached: true, popupFlag: true, noPopupFlag: false, disabled: false })).toBe(true);
  });

  it('fail-only solo abre con fallos', () => {
    expect(decidePopup({ policy: 'fail-only', status: 'warn', cached: false, popupFlag: false, noPopupFlag: false, disabled: false })).toBe(false);
    expect(decidePopup({ policy: 'fail-only', status: 'fail', cached: false, popupFlag: false, noPopupFlag: false, disabled: false })).toBe(true);
  });

  it('off, --no-popup y disable silencian', () => {
    expect(decidePopup({ policy: 'off', status: 'fail', cached: false, popupFlag: false, noPopupFlag: false, disabled: false })).toBe(false);
    expect(decidePopup({ policy: 'always', status: 'fail', cached: false, popupFlag: false, noPopupFlag: true, disabled: false })).toBe(false);
    expect(decidePopup({ policy: 'always', status: 'fail', cached: false, popupFlag: false, noPopupFlag: false, disabled: true })).toBe(false);
  });
});

describe('formatPopupMessage', () => {
  it('mensaje positivo sin problemas', () => {
    const message = formatPopupMessage('ok', [
      { id: 'a', label: 'Node.js', status: 'ok', detail: 'v22.12.0' },
    ]);
    expect(message).toContain('todo funciona bien');
    expect(message).toContain('1 verificaciones correctas');
  });

  it('lista fallos y avisos con etiquetas', () => {
    const message = formatPopupMessage('fail', [
      { id: 'a', label: 'Node.js', status: 'fail', detail: 'v20' },
      { id: 'b', label: 'Binario rtk', status: 'warn', detail: 'no responde' },
    ]);
    expect(message).toContain('problemas detectados');
    expect(message).toContain('[FALLO] Node.js: v20');
    expect(message).toContain('[AVISO] Binario rtk: no responde');
  });

  it('recorta la lista al maximo indicado', () => {
    const checks = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, label: `c${i}`, status: 'warn' as const, detail: 'x' }));
    const message = formatPopupMessage('warn', checks, 3);
    expect(message).toContain('y 5 mas');
  });
});

describe('stripJsonComments y hasMcpEntry', () => {
  it('elimina comentarios preservando URLs en cadenas', () => {
    const text = `{
      // linea
      "baseUrl": "https://api.klia.tech/v1", /* bloque */ "mcp": { "repomix": { "type": "local" } }
    }`;
    const clean = stripJsonComments(text);
    expect(clean).toContain('"https://api.klia.tech/v1"');
    expect(clean).not.toContain('// linea');
    expect(clean).not.toContain('/* bloque */');
    expect(hasMcpEntry(clean, 'repomix')).toBe(true);
    expect(hasMcpEntry(clean, 'semble')).toBe(false);
  });
});

describe('resolveRuntimeCli y resolveEventsCandidates', () => {
  it('respeta el orden de candidatos del runtime', () => {
    const runtime = resolveRuntimeCli({
      LOCALAPPDATA: '',
      KLIA_PROJECT_ROOT: 'C:/inexistenteparahealthcheck',
    } as unknown as NodeJS.ProcessEnv);
    expect(runtime.candidates).toEqual(['C:/inexistenteparahealthcheck/dist/router-cli.js']);
    expect(runtime.exists).toBe(false);
  });

  it('candidatos de eventos en orden', () => {
    const candidates = resolveEventsCandidates({
      KLIA_HOME: 'C:/khome',
      KLIA_STORE_DIR: 'C:/kstore',
    } as NodeJS.ProcessEnv);
    expect(candidates[0]).toBe('C:/kstore/events.json');
    expect(candidates[1]).toBe('C:/khome/data/events.json');
    expect(candidates.some((c) => c.includes('/data/events.json'))).toBe(true);
  });
});

describe('estado de health-check', () => {
  it('roundtrip y ventana de intervalo', () => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    const statePath = path.join(tmpDir, 'health-state.json');

    expect(loadHealthState(statePath)).toBeNull();
    expect(isWithinInterval(null, 24)).toBe(false);
    expect(isWithinInterval({ lastRunAt: 'not-a-date', status: 'ok', okCount: 0, failedCount: 0, warnCount: 0, lastMessage: '', runs: 0 }, 24)).toBe(false);

    const state = {
      lastRunAt: new Date(Date.now() - 60_000).toISOString(),
      status: 'ok' as const,
      okCount: 9,
      failedCount: 0,
      warnCount: 0,
      lastMessage: 'todo bien',
      runs: 1,
    };
    saveHealthState(statePath, state);
    const loaded = loadHealthState(statePath);
    expect(loaded).not.toBeNull();
    expect(loaded?.lastMessage).toBe('todo bien');
    expect(isWithinInterval(loaded, 24)).toBe(true);
    expect(isWithinInterval(loaded, 0.0005)).toBe(false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});