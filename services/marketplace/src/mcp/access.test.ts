/**
 * MCP module tests (Phase 19 Wave 5 — WS-MKT-9).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MarketplaceService } from '../service.js';
import { InMemoryMarketplaceStore } from '../store/mem_store.js';
import { checkMcpCapability, validateMcpToolInput } from './access.js';
import { executeMcpTool, MCP_TOOL_DEFINITIONS, CAPABILITY_TOOLS } from './tools.js';
import { McpPermissionDeniedError } from '../types.js';

describe('MCP Access', () => {
  describe('checkMcpCapability', () => {
    it('does not throw when capability is granted', () => {
      expect(() =>
        checkMcpCapability('ws-1', 'marketplace:read', ['marketplace:read']),
      ).not.toThrow();
    });

    it('throws McpPermissionDeniedError when capability is not granted', () => {
      expect(() =>
        checkMcpCapability('ws-1', 'marketplace:purchase', ['marketplace:read']),
      ).toThrow(McpPermissionDeniedError);
    });

    it('throws McpPermissionDeniedError for empty granted list', () => {
      expect(() => checkMcpCapability('ws-1', 'marketplace:read', [])).toThrow(
        McpPermissionDeniedError,
      );
    });
  });

  describe('validateMcpToolInput', () => {
    it('returns empty array for valid input', () => {
      const errors = validateMcpToolInput({
        workspaceId: 'ws-1',
        actorId: 'user-1',
        tool: 'get_listing',
        params: { listing_id: 'l1' },
        grantedCapabilities: ['marketplace:read'],
      });
      expect(errors).toHaveLength(0);
    });

    it('returns error for missing workspaceId', () => {
      const errors = validateMcpToolInput({
        workspaceId: '',
        actorId: 'user-1',
        tool: 'get_listing',
        params: { listing_id: 'l1' },
        grantedCapabilities: ['marketplace:read'],
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe('MISSING_WORKSPACE_ID');
    });

    it('returns error for missing tool', () => {
      const errors = validateMcpToolInput({
        workspaceId: 'ws-1',
        actorId: 'user-1',
        tool: '' as never,
        params: { listing_id: 'l1' },
        grantedCapabilities: ['marketplace:read'],
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe('MISSING_TOOL');
    });
  });
});

describe('MCP Tools', () => {
  describe('MCP_TOOL_DEFINITIONS', () => {
    it('has all 6 tool definitions', () => {
      expect(Object.keys(MCP_TOOL_DEFINITIONS)).toHaveLength(6);
    });

    it('each tool has name, requiredCapability, description', () => {
      for (const [key, def] of Object.entries(MCP_TOOL_DEFINITIONS)) {
        expect(def.name).toBe(key);
        expect(def.requiredCapability).toBeTruthy();
        expect(def.description).toBeTruthy();
      }
    });
  });

  describe('CAPABILITY_TOOLS', () => {
    it('marketplace:read maps to 4 tools', () => {
      expect(CAPABILITY_TOOLS['marketplace:read']).toHaveLength(4);
    });

    it('marketplace:install maps to install_listing', () => {
      expect(CAPABILITY_TOOLS['marketplace:install']).toContain('install_listing');
    });

    it('marketplace:purchase maps to purchase_marketplace', () => {
      expect(CAPABILITY_TOOLS['marketplace:purchase']).toContain('purchase_marketplace');
    });
  });

  describe('executeMcpTool', () => {
    let store: InMemoryMarketplaceStore;
    let service: MarketplaceService;

    beforeEach(() => {
      store = new InMemoryMarketplaceStore();
      service = new MarketplaceService({ store });
    });

    it('returns error for missing tool', async () => {
      const result = await executeMcpTool(
        {
          workspaceId: 'ws-1',
          actorId: 'user-1',
          tool: '' as never,
          params: {},
          grantedCapabilities: [],
        },
        service,
      );
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('returns error for unknown tool', async () => {
      const result = await executeMcpTool(
        {
          workspaceId: 'ws-1',
          actorId: 'user-1',
          tool: 'unknown_tool' as never,
          params: {},
          grantedCapabilities: [],
        },
        service,
      );
      expect(result.ok).toBe(false);
      expect(result.errors![0]!.code).toBe('UNKNOWN_TOOL');
    });

    it('returns error when capability not granted', async () => {
      const result = await executeMcpTool(
        {
          workspaceId: 'ws-1',
          actorId: 'user-1',
          tool: 'purchase_marketplace',
          params: { listing_id: 'l1' },
          grantedCapabilities: ['marketplace:read'],
        },
        service,
      );
      expect(result.ok).toBe(false);
      expect(result.errors![0]!.code).toBe('ERR_PERMISSION_DENIED');
    });

    it('executes get_listing tool', async () => {
      // Create a listing first
      await service.createListing({
        catalogId: 'comp-1',
        sellerId: 'seller-1',
        title: 'Test Component',
      });
      const listings = await service.listListings();
      const listingId = listings[0]!.id;

      const result = await executeMcpTool(
        {
          workspaceId: 'ws-1',
          actorId: 'user-1',
          tool: 'get_listing',
          params: { listing_id: listingId },
          grantedCapabilities: ['marketplace:read'],
        },
        service,
      );

      expect(result.ok).toBe(true);
      expect(result.data).toBeTruthy();
    });

    it('executes search_listings tool', async () => {
      await service.createListing({
        catalogId: 'comp-1',
        sellerId: 'seller-1',
        title: 'Test Component',
      });

      const result = await executeMcpTool(
        {
          workspaceId: 'ws-1',
          actorId: 'user-1',
          tool: 'search_listings',
          params: {},
          grantedCapabilities: ['marketplace:read'],
        },
        service,
      );

      expect(result.ok).toBe(true);
      expect((result.data as { items: unknown[] }).items).toHaveLength(1);
    });

    it('executes get_reviews tool', async () => {
      const result = await executeMcpTool(
        {
          workspaceId: 'ws-1',
          actorId: 'user-1',
          tool: 'get_reviews',
          params: { listing_id: 'nonexistent' },
          grantedCapabilities: ['marketplace:read'],
        },
        service,
      );

      expect(result.ok).toBe(true);
    });

    it('executes install_listing tool (scaffold)', async () => {
      const result = await executeMcpTool(
        {
          workspaceId: 'ws-1',
          actorId: 'user-1',
          tool: 'install_listing',
          params: { listing_id: 'l1' },
          grantedCapabilities: ['marketplace:install'],
        },
        service,
      );

      expect(result.ok).toBe(true);
      expect((result.data as { status: string }).status).toBe('installing');
    });

    it('executes purchase_marketplace tool (scaffold)', async () => {
      const result = await executeMcpTool(
        {
          workspaceId: 'ws-1',
          actorId: 'user-1',
          tool: 'purchase_marketplace',
          params: { listing_id: 'l1' },
          grantedCapabilities: ['marketplace:purchase'],
        },
        service,
      );

      expect(result.ok).toBe(true);
      expect((result.data as { status: string }).status).toBe('pending');
    });
  });
});
