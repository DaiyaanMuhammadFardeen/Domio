import { describe, it, expect } from 'vitest';
import { createAutosaveFacade } from '../src/lib/autosave.js';

describe('autosave facade', () => {
  it('starts in the synced state', () => {
    const facade = createAutosaveFacade();
    const state = facade.state();
    expect(state.status).toBe('synced');
    expect(state.pending).toBe(0);
  });

  it('enqueue moves to pending', async () => {
    const facade = createAutosaveFacade({ debounceMs: 0 });
    facade.enqueue('a', { foo: 1 });
    expect(facade.state().pending).toBe(1);
    expect(['pending', 'syncing']).toContain(facade.state().status);
  });

  it('flush returns to synced', async () => {
    const facade = createAutosaveFacade({ debounceMs: 0 });
    facade.enqueue('a', { foo: 1 });
    await facade.flush();
    expect(facade.state().status).toBe('synced');
    expect(facade.state().pending).toBe(0);
  });

  it('subscribe delivers state changes', () => {
    const facade = createAutosaveFacade({ debounceMs: 0 });
    const seen: string[] = [];
    const unsubscribe = facade.subscribe((s) => seen.push(s.status));
    facade.enqueue('a', { foo: 1 });
    unsubscribe();
    expect(seen[0]).toBe('synced');
  });

  it('offline mode reports offline without persisting', async () => {
    const facade = createAutosaveFacade({ offline: true });
    facade.enqueue('a', { foo: 1 });
    await facade.flush();
    expect(facade.state().status).toBe('offline');
  });
});
