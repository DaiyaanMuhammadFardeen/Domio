import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps, type ServiceDeps } from '../deps.js';
import { sha256Hex, uuid } from '../crypto/index.js';
import type { ComponentPackage, MarketplaceListing, Template, IconRecord } from '../store/types.js';
import { mcpTools } from './tools.js';
import { findTool, runTool, type MCPToolContext } from './registry.js';
import { createMcpServer, type McpServer } from './server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDeps(): { deps: ServiceDeps; store: InMemoryStore } {
  const store = new InMemoryStore();
  const deps = defaultDeps(store);
  return { deps, store };
}

async function seedPackage(
  store: InMemoryStore,
  catalogId = 'my.button',
  version = '1.0.0',
): Promise<ComponentPackage> {
  // Store a fake blob for each file
  const fileBytes = new TextEncoder().encode('fake-component-code');
  const fileHash = sha256Hex(fileBytes);
  await store.putBlob({ sha256: fileHash, bytes: fileBytes, storedAt: Date.now() });

  const pkg: ComponentPackage = {
    id: `${catalogId}:${version}`,
    catalogId,
    version,
    kind: 'component',
    name: `Test ${catalogId}`,
    description: 'A test component',
    category: 'ui',
    propsSchema: {
      type: 'object',
      properties: {
        label: { type: 'string', default: 'Hello' },
        color: { type: 'string', default: '#000000', 'x-domio-prop': { control: 'color' } },
      },
    },
    variants: [{ id: 'v1', label: 'Default', tokens: {} }],
    files: { 'index.js': fileHash },
    packageHash: '',
    sizeBudgetBytes: 1024,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await store.putPackage(pkg);
  return pkg;
}

async function seedListing(
  store: InMemoryStore,
  catalogId = 'my.button',
): Promise<MarketplaceListing> {
  const listing: MarketplaceListing = {
    id: uuid(),
    catalogId,
    sellerId: 'seller-1',
    title: 'My Button Component',
    description: 'A beautiful button',
    status: 'published',
    isFree: false,
    priceCents: 500,
    currency: 'usd',
    tags: ['ui', 'button'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await store.putListing(listing);
  return listing;
}

async function seedTemplate(store: InMemoryStore): Promise<Template> {
  const template: Template = {
    id: uuid(),
    kind: 'full_deck',
    name: 'Welcome Deck',
    description: 'A welcome presentation',
    deckJson: {
      slides: [
        {
          elements: [{ type: 'text', props: { label: '__PLACEHOLDER__' } }],
        },
      ],
    },
    placeholders: [
      {
        id: uuid(),
        key: 'title',
        label: 'Title',
        kind: 'text',
        required: true,
        binding: 'slides[0].elements[0].props.label',
      },
    ],
    authorId: 'author-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await store.putTemplate(template);
  return template;
}

async function seedIcon(store: InMemoryStore): Promise<IconRecord> {
  const icon: IconRecord = {
    id: uuid(),
    name: 'home',
    synonyms: ['house', 'building'],
    styles: ['outline', 'filled'],
    pathData: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    viewBox: '0 0 24 24',
    vendor: 'test',
    licenseId: '',
    createdAt: Date.now(),
  };
  await store.putIcon(icon);
  return icon;
}

const ctx: MCPToolContext = { agentId: 'agent-1', workspaceId: 'ws-1' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCP tools', () => {
  let store: InMemoryStore;
  let deps: ServiceDeps;

  beforeEach(() => {
    ({ deps, store } = createTestDeps());
  });

  describe('tool registry', () => {
    it('exports 13 tools', () => {
      expect(mcpTools.length).toBe(13);
    });

    it('findTool returns tool by name', () => {
      const tool = findTool('component_list');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('component_list');
    });

    it('findTool returns undefined for unknown', () => {
      expect(findTool('unknown_tool')).toBeUndefined();
    });
  });

  describe('component_list', () => {
    it('lists packages', async () => {
      await seedPackage(store);
      const result = await runTool(deps, 'component_list', {}, ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect((result.data as unknown[]).length).toBe(1);
      }
    });

    it('searches by query', async () => {
      await seedPackage(store);
      const result = await runTool(deps, 'component_list', { query: 'button' }, ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect((result.data as unknown[]).length).toBe(1);
      }
    });

    it('filters by category', async () => {
      await seedPackage(store);
      const result = await runTool(deps, 'component_list', { category: 'ui' }, ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect((result.data as unknown[]).length).toBe(1);
      }
    });
  });

  describe('component_describe', () => {
    it('returns full package', async () => {
      await seedPackage(store);
      const result = await runTool(deps, 'component_describe', { catalogId: 'my.button' }, ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const pkg = result.data as { catalogId: string; version: string };
        expect(pkg.catalogId).toBe('my.button');
        expect(pkg.version).toBe('1.0.0');
      }
    });

    it('returns specific version', async () => {
      await seedPackage(store, 'my.button', '2.0.0');
      const result = await runTool(
        deps,
        'component_describe',
        { catalogId: 'my.button', version: '2.0.0' },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect((result.data as { version: string }).version).toBe('2.0.0');
      }
    });

    it('returns error for missing component', async () => {
      const result = await runTool(deps, 'component_describe', { catalogId: 'no.such' }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ERR_NOT_FOUND');
      }
    });
  });

  describe('component_install round trip', () => {
    it('installs a component', async () => {
      await seedPackage(store);
      const result = await runTool(deps, 'component_install', { catalogId: 'my.button' }, ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { item: { catalogId: string }; version: string };
        expect(data.item.catalogId).toBe('my.button');
        expect(data.version).toBe('1.0.0');
      }
    });

    it('install writes an agent audit row', async () => {
      await seedPackage(store);
      await runTool(deps, 'component_install', { catalogId: 'my.button' }, ctx);

      const rows = await store.listAudit('agent');
      expect(rows.length).toBe(1);
      expect(rows[0]!.action).toBe('component.install');
      expect(rows[0]!.actorKind).toBe('agent');
      expect(rows[0]!.resourceType).toBe('component');
      expect(rows[0]!.resourceId).toBe('my.button');
    });

    it('returns error for missing component', async () => {
      const result = await runTool(deps, 'component_install', { catalogId: 'no.such' }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ERR_NOT_FOUND');
      }
    });
  });

  describe('component_uninstall', () => {
    it('uninstalls and writes audit', async () => {
      await seedPackage(store);
      await runTool(deps, 'component_install', { catalogId: 'my.button' }, ctx);

      const result = await runTool(deps, 'component_uninstall', { catalogId: 'my.button' }, ctx);
      expect(result.ok).toBe(true);

      const rows = await store.listAudit('agent');
      const uninstallRows = rows.filter((r) => r.action === 'component.uninstall');
      expect(uninstallRows.length).toBe(1);
    });
  });

  describe('component_pin', () => {
    it('updates pin mode', async () => {
      await seedPackage(store);
      await runTool(deps, 'component_install', { catalogId: 'my.button' }, ctx);

      const result = await runTool(
        deps,
        'component_pin',
        {
          catalogId: 'my.button',
          pinMode: 'pin-version',
          pinValue: '1.0.0',
        },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        const item = result.data as { pinMode: string; pinValue?: string };
        expect(item.pinMode).toBe('pin-version');
        expect(item.pinValue).toBe('1.0.0');
      }
    });

    it('writes audit for pin', async () => {
      await seedPackage(store);
      await runTool(deps, 'component_install', { catalogId: 'my.button' }, ctx);
      await runTool(
        deps,
        'component_pin',
        { catalogId: 'my.button', pinMode: 'track-latest' },
        ctx,
      );

      const rows = await store.listAudit('agent');
      const pinRows = rows.filter((r) => r.action === 'component.pin');
      expect(pinRows.length).toBe(1);
    });
  });

  describe('component_get_props_schema', () => {
    it('returns props schema', async () => {
      await seedPackage(store);
      const result = await runTool(
        deps,
        'component_get_props_schema',
        { catalogId: 'my.button' },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        const schema = result.data as { type: string; properties: Record<string, unknown> };
        expect(schema.type).toBe('object');
        expect(schema.properties.label).toBeDefined();
      }
    });
  });

  describe('component_apply_props', () => {
    it('validates and applies defaults', async () => {
      await seedPackage(store);
      const result = await runTool(
        deps,
        'component_apply_props',
        {
          catalogId: 'my.button',
          props: {},
        },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { props: { label: string; color: string }; errors: unknown[] };
        expect(data.props.label).toBe('Hello'); // default
        expect(data.props.color).toBe('#000000'); // default
        expect(data.errors.length).toBe(0);
      }
    });

    it('validates invalid props', async () => {
      await seedPackage(store);
      const result = await runTool(
        deps,
        'component_apply_props',
        {
          catalogId: 'my.button',
          props: { label: 123 }, // wrong type
        },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { errors: unknown[] };
        expect(data.errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('marketplace_search', () => {
    it('searches listings', async () => {
      await seedPackage(store);
      await seedListing(store);
      const result = await runTool(deps, 'marketplace_search', { query: 'button' }, ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { items: unknown[]; total: number };
        expect(data.items.length).toBe(1);
        expect(data.total).toBe(1);
      }
    });

    it('filters by category', async () => {
      await seedPackage(store);
      await seedListing(store);
      const result = await runTool(deps, 'marketplace_search', { category: 'ui' }, ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect((result.data as { items: unknown[] }).items.length).toBe(1);
      }
    });
  });

  describe('marketplace_get_listing', () => {
    it('gets listing by id', async () => {
      const listing = await seedListing(store);
      const result = await runTool(deps, 'marketplace_get_listing', { listingId: listing.id }, ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect((result.data as { id: string }).id).toBe(listing.id);
      }
    });

    it('gets listing by catalogId', async () => {
      await seedPackage(store);
      await seedListing(store);
      const result = await runTool(
        deps,
        'marketplace_get_listing',
        { catalogId: 'my.button' },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect((result.data as { catalogId: string }).catalogId).toBe('my.button');
      }
    });
  });

  describe('marketplace_purchase', () => {
    it('issues license and verifies', async () => {
      await seedPackage(store);
      const listing = await seedListing(store);
      const result = await runTool(deps, 'marketplace_purchase', { listingId: listing.id }, ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as {
          grant: unknown;
          token: string;
          verification: { valid: boolean };
        };
        expect(data.token).toBeTruthy();
        expect(data.verification.valid).toBe(true);
      }
    });

    it('writes audit', async () => {
      await seedPackage(store);
      const listing = await seedListing(store);
      await runTool(deps, 'marketplace_purchase', { listingId: listing.id }, ctx);

      const rows = await store.listAudit('agent');
      const purchaseRows = rows.filter((r) => r.action === 'marketplace.purchase');
      expect(purchaseRows.length).toBe(1);
    });
  });

  describe('template_apply', () => {
    it('applies template with values', async () => {
      const template = await seedTemplate(store);
      const result = await runTool(
        deps,
        'template_apply',
        {
          templateId: template.id,
          values: { title: 'Welcome!' },
        },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as {
          deck: { slides: Array<{ elements: Array<{ props: { label: string } }> }> };
          manifest: unknown[];
        };
        expect(data.deck.slides[0]!.elements[0]!.props.label).toBe('Welcome!');
        expect(data.manifest.length).toBe(1);
      }
    });

    it('writes audit', async () => {
      const template = await seedTemplate(store);
      await runTool(
        deps,
        'template_apply',
        {
          templateId: template.id,
          values: { title: 'Test' },
        },
        ctx,
      );

      const rows = await store.listAudit('agent');
      const templateRows = rows.filter((r) => r.action === 'template.apply');
      expect(templateRows.length).toBe(1);
    });
  });

  describe('media_search_icons', () => {
    it('searches icons', async () => {
      await seedIcon(store);
      const result = await runTool(deps, 'media_search_icons', { query: 'home' }, ctx);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { name: string }[];
        expect(data.length).toBe(1);
        expect(data[0]!.name).toBe('home');
      }
    });

    it('includes recolor payload when color specified', async () => {
      await seedIcon(store);
      const result = await runTool(
        deps,
        'media_search_icons',
        { query: 'home', color: '#ff0000' },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { recolorPayload: { props: { color: string } } }[];
        expect(data[0]!.recolorPayload.props.color).toBe('#ff0000');
      }
    });
  });

  describe('media_validate_animation', () => {
    it('validates good lottie', async () => {
      const lottie = { v: '5.7.1', layers: [] };
      const result = await runTool(deps, 'media_validate_animation', { lottieJson: lottie }, ctx);
      expect(result.ok).toBe(true);
    });

    it('rejects lottie with expression', async () => {
      const lottie = { v: '5.7.1', layers: [{ expression: 'alert(1)' }] };
      const result = await runTool(deps, 'media_validate_animation', { lottieJson: lottie }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ERR_VALIDATION');
        expect(result.error.message).toContain('expression');
      }
    });

    it('validates gif size within budget', async () => {
      const result = await runTool(deps, 'media_validate_animation', { gifBytes: 1000 }, ctx);
      expect(result.ok).toBe(true);
    });

    it('rejects gif exceeding budget', async () => {
      const result = await runTool(deps, 'media_validate_animation', { gifBytes: 99999999 }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ERR_VALIDATION');
      }
    });
  });

  describe('error mapping', () => {
    it('missing tool returns ok:false', async () => {
      const result = await runTool(deps, 'nonexistent_tool', {}, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ERR_NOT_FOUND');
      }
    });

    it('missing package returns error code', async () => {
      const result = await runTool(deps, 'component_install', { catalogId: 'no.such.thing' }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ERR_NOT_FOUND');
      }
    });
  });
});

describe('MCP Server', () => {
  let store: InMemoryStore;
  let deps: ServiceDeps;
  let server: McpServer;

  beforeEach(() => {
    ({ deps, store } = createTestDeps());
    server = createMcpServer(deps);
  });

  it('listTools returns all tools', () => {
    const tools = server.listTools();
    expect(tools.length).toBe(13);
    expect(tools[0]!.name).toBe('component_list');
  });

  it('handleRequest executes a tool', async () => {
    await seedPackage(store);
    const result = await server.handleRequest({
      tool: 'component_list',
      agentId: 'agent-1',
    });
    expect(result.ok).toBe(true);
  });

  it('handleRequest rejects missing agentId', async () => {
    const result = await server.handleRequest({ tool: 'component_list' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ERR_UNAUTHORIZED');
    }
  });

  it('handleRequest rejects missing tool name', async () => {
    const result = await server.handleRequest({ tool: '', agentId: 'agent-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ERR_VALIDATION');
    }
  });

  it('handleRequest returns error for unknown tool', async () => {
    const result = await server.handleRequest({ tool: 'unknown', agentId: 'agent-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ERR_NOT_FOUND');
    }
  });
});
