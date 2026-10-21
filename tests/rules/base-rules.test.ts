import { describe, expect, it } from 'vitest';
import { candidatesForTask, defaultOptimizerForTask } from '../../src/rules/base-rules';

describe('base-rules', () => {
  it('SMALL_CODE → BASELINE', () => {
    expect(candidatesForTask('SMALL_CODE')).toEqual(['BASELINE']);
    expect(defaultOptimizerForTask('SMALL_CODE')).toBe('BASELINE');
  });

  it('TERMINAL → RTK (DCP prohibido: no hay contexto que podar en 1 comando)', () => {
    expect(candidatesForTask('TERMINAL')).toEqual(['RTK']);
    expect(defaultOptimizerForTask('TERMINAL')).toBe('RTK');
  });

  it('REPOSITORY_SEARCH → SEMBLE (REPOMIX prohibido: empaquetar el repo gasto +17k en busquedas)', () => {
    expect(candidatesForTask('REPOSITORY_SEARCH')).toEqual(['SEMBLE']);
    expect(defaultOptimizerForTask('REPOSITORY_SEARCH')).toBe('SEMBLE');
  });

  it('REPO_PACKAGING → REPOMIX primero (territorio propio: ~64%% tabla AGENTS.md, -89%% Q05)', () => {
    expect(candidatesForTask('REPO_PACKAGING')).toEqual(['REPOMIX', 'SEMBLE', 'CONTEXT_MODE']);
    expect(defaultOptimizerForTask('REPO_PACKAGING')).toBe('REPOMIX');
  });

  it('LARGE_CONTEXT → SEMBLE, CONTEXT_MODE, REPOMIX', () => {
    expect(candidatesForTask('LARGE_CONTEXT')).toEqual(['SEMBLE', 'CONTEXT_MODE', 'REPOMIX']);
  });

  it('MULTISTEP → DCP', () => {
    expect(candidatesForTask('MULTISTEP')).toEqual(['DCP']);
  });

  it('REFACTOR → RTK', () => {
    expect(candidatesForTask('REFACTOR')).toEqual(['RTK']);
  });

  it('UNKNOWN cae a BASELINE', () => {
    expect(candidatesForTask('UNKNOWN')).toEqual(['BASELINE']);
    expect(defaultOptimizerForTask('UNKNOWN')).toBe('BASELINE');
  });
});
