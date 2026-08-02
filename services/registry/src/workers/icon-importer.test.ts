import { describe, it, expect } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps, type ServiceDeps } from '../deps.js';
import { run } from './icon-importer.js';

function makeDeps(overrides: Partial<ServiceDeps> = {}): ServiceDeps {
  return defaultDeps(new InMemoryStore(), overrides);
}

const SAMPLE_PATH =
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z';

describe('icon-importer worker', () => {
  it('batch ingests new icons', async () => {
    const deps = makeDeps();
    const source = [
      { name: 'icon-a', pathData: SAMPLE_PATH },
      { name: 'icon-b', pathData: SAMPLE_PATH },
      { name: 'icon-c', pathData: SAMPLE_PATH },
    ];

    const result = await run(deps, { source });

    expect(result.ingested).toBe(3);
    expect(result.skipped).toBe(0);

    const count = await deps.store.countIcons();
    expect(count).toBe(3);
  });

  it('skips icons with duplicate names', async () => {
    const deps = makeDeps();
    const source = [
      { name: 'unique-icon', pathData: SAMPLE_PATH },
      { name: 'unique-icon', pathData: SAMPLE_PATH }, // duplicate
    ];

    const result = await run(deps, { source });

    expect(result.ingested).toBe(1);
    expect(result.skipped).toBe(1);

    const count = await deps.store.countIcons();
    expect(count).toBe(1);
  });

  it('respects batchSize', async () => {
    const deps = makeDeps();
    const source = [
      { name: 'batch-1', pathData: SAMPLE_PATH },
      { name: 'batch-2', pathData: SAMPLE_PATH },
      { name: 'batch-3', pathData: SAMPLE_PATH },
    ];

    const result = await run(deps, { source, batchSize: 2 });

    expect(result.ingested).toBe(2);
    expect(result.skipped).toBe(0);

    const count = await deps.store.countIcons();
    expect(count).toBe(2);
  });

  it('handles empty source', async () => {
    const deps = makeDeps();
    const result = await run(deps, { source: [] });

    expect(result.ingested).toBe(0);
    expect(result.skipped).toBe(0);
  });
});
