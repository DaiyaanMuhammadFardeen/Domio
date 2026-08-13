import { describe, expect, it } from 'vitest';
import {
  adminConsole,
  creatorConsole,
  dashboard,
  deckShare,
  editor,
  joinFeedback,
  joinHandout,
  joinWeb,
  landing,
  localUrl,
  marketplaceWeb,
  presenter,
  presenterWithToken,
  viewer,
} from './routing.js';

describe('routing — editor', () => {
  it('builds the editor path with no options', () => {
    expect(editor('deck-1')).toBe('/editor/deck-1');
  });
  it('encodes deck id and adds panel + slide params', () => {
    expect(editor('d/with spaces', { panel: 'layers', slide: 2 })).toBe(
      '/editor/d%2Fwith%20spaces?panel=layers&slide=2',
    );
  });
});

describe('routing — viewer', () => {
  it('omits default stage mode', () => {
    expect(viewer('deck-1')).toBe('/deck-1');
  });
  it('includes slide segment when given', () => {
    expect(viewer('deck-1', { slide: 3 })).toBe('/deck-1/3');
  });
  it('adds scroll mode + token', () => {
    const url = viewer('deck-1', { mode: 'scroll', token: 'abc' });
    expect(url).toContain('mode=scroll');
    expect(url).toContain('token=abc');
  });
});

describe('routing — presenter', () => {
  it('builds session path', () => {
    expect(presenter('sess-1')).toBe('/session/sess-1');
  });
  it('with token adds query', () => {
    expect(presenterWithToken('sess-1', 'tok')).toBe('/session/sess-1?token=tok');
  });
});

describe('routing — dashboard', () => {
  it('builds simple routes', () => {
    expect(dashboard('overview')).toBe('/overview');
    expect(dashboard('alerts')).toBe('/alerts');
    expect(dashboard('graph')).toBe('/graph');
  });
  it('builds deck detail with id', () => {
    expect(dashboard('deck-detail', { id: 'd-1' })).toBe('/deck/d-1');
  });
});

describe('routing — join-web', () => {
  it('builds join, feedback, handout paths', () => {
    expect(joinWeb('ABCD')).toBe('/j/ABCD');
    expect(joinFeedback('sess-1')).toBe('/feedback/sess-1');
    expect(joinHandout('tok-1')).toBe('/h/tok-1');
  });
});

describe('routing — admin-console', () => {
  it('builds known routes', () => {
    expect(adminConsole('sso')).toBe('/sso');
    expect(adminConsole('audit')).toBe('/audit');
    expect(adminConsole('usage')).toBe('/billing/usage');
  });
  it('builds plugin detail with id', () => {
    expect(adminConsole('plugin-detail', { id: 'plug-1' })).toBe('/plugins/plug-1');
  });
  it('builds takedown detail with id', () => {
    expect(adminConsole('takedown-detail', { id: 'tk-1' })).toBe('/takedowns/tk-1');
  });
});

describe('routing — creator-console', () => {
  it('builds known routes', () => {
    expect(creatorConsole('listings')).toBe('/listings');
    expect(creatorConsole('listings-create')).toBe('/listings/create');
  });
});

describe('routing — marketplace-web', () => {
  it('builds listing detail', () => {
    expect(marketplaceWeb('listing', { slug: 's/1' })).toBe('/listing/s%2F1');
  });
  it('builds search with query', () => {
    expect(marketplaceWeb('search', { q: 'hello world' })).toBe('/search?q=hello%20world');
  });
});

describe('routing — landing', () => {
  it('builds known routes', () => {
    expect(landing('home')).toBe('/');
    expect(landing('pricing')).toBe('/pricing');
    expect(landing('feature', { slug: 'editor' })).toBe('/features/editor');
    expect(landing('docs', { slug: 'editor/getting-started' })).toBe(
      '/docs/editor/getting-started',
    );
  });
});

describe('routing — localUrl + deckShare', () => {
  it('emits an http://localhost URL when called server-side', () => {
    const url = localUrl('editor', '/editor/demo');
    expect(url).toMatch(/^http:\/\/localhost:3100\/editor\/demo$/);
  });
  it('deckShare is an alias for viewer', () => {
    expect(deckShare('d', { slide: 0 })).toBe(viewer('d', { slide: 0 }));
  });
});
