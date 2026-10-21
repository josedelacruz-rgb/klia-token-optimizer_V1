import { describe, expect, it } from 'vitest';
import { selectOptimizer, evaluateOptimizer } from '../../src/selector/optimizer-selector';
import { JsonHistoryStore, createExecutionRecord } from '../../src/history/history-store';
import type { ExecutionRecord, Optimizer, TaskType } from '../../src/types';
import * as path from 'path';
import * as fs from 'fs';

const tmpDir = path.join(__dirname, '.tmp-selector');
const tmpFile = path.join(tmpDir, 'history.json');

function makeRecord(
  model: string,
  taskType: TaskType,
  optimizer: Optimizer,
  tokens: number,
): ExecutionRecord {
  return createExecutionRecord(
    model,
    model.split('-')[0],
    taskType,
    optimizer,
    {
      tokens,
      latencySeconds: 100,
      toolingCost: optimizer === 'BASELINE' ? 0 : 0.5,
      quality: 0.98,
      failed: false,
    },
    { fileCount: 5, contextSizeBytes: 50_000 },
  );
}

describe('selectOptimizer', () => {
  it('sin historial usa V0 y baseline', async () => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    const history = new JsonHistoryStore({ filePath: tmpFile });
    const decision = await selectOptimizer('glm-5.2', 'MULTISTEP', { history });
    expect(decision.optimizer).toBe('DCP');
    expect(decision.version).toBe('V0');
    expect(decision.confidence).toBe(0);
  });

  it('con evidencia a favor de DCP en GLM/MULTISTEP elige DCP', async () => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    const history = new JsonHistoryStore({ filePath: tmpFile });
    for (let i = 0; i < 5; i++) {
      await history.add(makeRecord('glm-5.2', 'MULTISTEP', 'BASELINE', 10000));
      await history.add(makeRecord('glm-5.2', 'MULTISTEP', 'DCP', 5800));
    }
    const decision = await selectOptimizer('glm-5.2', 'MULTISTEP', { history });
    expect(decision.optimizer).toBe('DCP');
    expect(decision.version).toBe('V2');
    expect(decision.confidence).toBeGreaterThan(0.6);
  });

  it('con evidencia negativa de DCP en DeepSeek/MULTISTEP fallback a baseline', async () => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    const history = new JsonHistoryStore({ filePath: tmpFile });
    for (let i = 0; i < 5; i++) {
      await history.add(makeRecord('deepseek-v4', 'MULTISTEP', 'BASELINE', 10000));
      await history.add(makeRecord('deepseek-v4', 'MULTISTEP', 'DCP', 12100));
    }
    const decision = await selectOptimizer('deepseek-v4', 'MULTISTEP', { history });
    expect(decision.optimizer).toBe('BASELINE');
    expect(decision.confidence).toBeGreaterThan(0.6);
  });

  it('cold-start: entrega el default de la regla base si nunca tiene muestras, e ignora optimizadores fuera de la regla base', async () => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    const history = new JsonHistoryStore({ filePath: tmpFile });
    for (let i = 0; i < 5; i++) {
      await history.add(makeRecord('glm-5.2', 'MULTISTEP', 'BASELINE', 10000));
      // RTK no es candidato para MULTISTEP, por tanto se ignora.
      await history.add(makeRecord('glm-5.2', 'MULTISTEP', 'RTK', 2000));
    }
    // Sin muestras del default (DCP), el cold-start entrega la regla base V0:
    // si se devolviera BASELINE, DCP nunca ganaria muestras (bucle infinito).
    const decision = await selectOptimizer('glm-5.2', 'MULTISTEP', { history });
    expect(decision.optimizer).toBe('DCP');
    expect(decision.version).toBe('V0');
    // RTK no debe aparecer entre las alternativas mostradas.
    const optimizers = decision.alternatives?.map((a) => a.optimizer) ?? [];
    expect(optimizers).not.toContain('RTK');
  });

  it('con muestras del default, la evidencia aprendida manda sobre el cold-start', async () => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    const history = new JsonHistoryStore({ filePath: tmpFile });
    for (let i = 0; i < 5; i++) {
      await history.add(makeRecord('glm-5.2', 'MULTISTEP', 'BASELINE', 10000));
      await history.add(makeRecord('glm-5.2', 'MULTISTEP', 'DCP', 5000));
    }
    const decision = await selectOptimizer('glm-5.2', 'MULTISTEP', { history });
    expect(decision.optimizer).toBe('DCP');
    expect(decision.version).toBe('V2');
  });
});

describe('evaluateOptimizer', () => {
  it('calcula coste relativo', () => {
    const records: ExecutionRecord[] = [
      makeRecord('glm-5.2', 'REFACTOR', 'BASELINE', 10000),
      makeRecord('glm-5.2', 'REFACTOR', 'RTK', 5800),
    ];
    const score = evaluateOptimizer(records, 'RTK');
    expect(score.relativeCost).toBeLessThan(1);
  });
});
