/**
 * MCP tool implementations (Phase 19 Wave 5 — WS-MKT-9).
 *
 * Scaffold for MCP marketplace tools. Real purchase_marketplace logic
 * requires the purchase_marketplace capability to be granted.
 *
 * Tool list:
 *   - get_listing: Read-only listing lookup (marketplace:read)
 *   - search_listings: Read-only listing search (marketplace:read)
 *   - install_listing: Trigger listing install (marketplace:install)
 *   - purchase_marketplace: Initiate purchase (marketplace:purchase)
 *   - get_reviews: Read-only review lookup (marketplace:read)
 *   - get_creator_profile: Read-only creator profile lookup (marketplace:read)
 */

import type { McpCapability, McpToolInput, McpToolResult } from '../types.js';
import type { MarketplaceService } from '../service.js';
import { checkMcpCapability } from './access.js';

// ---------------------------------------------------------------------------
// MCP Tool Definitions
// ---------------------------------------------------------------------------

export const MCP_TOOL_DEFINITIONS: Record<
  string,
  {
    name: string;
    requiredCapability: McpCapability;
    description: string;
  }
> = {
  get_listing: {
    name: 'get_listing',
    requiredCapability: 'marketplace:read',
    description: 'Get a marketplace listing by ID',
  },
  search_listings: {
    name: 'search_listings',
    requiredCapability: 'marketplace:read',
    description: 'Search marketplace listings by status, seller, or tags',
  },
  install_listing: {
    name: 'install_listing',
    requiredCapability: 'marketplace:install',
    description: 'Trigger installation of a marketplace listing',
  },
  purchase_marketplace: {
    name: 'purchase_marketplace',
    requiredCapability: 'marketplace:purchase',
    description: 'Initiate purchase of a marketplace listing',
  },
  get_reviews: {
    name: 'get_reviews',
    requiredCapability: 'marketplace:read',
    description: 'Get reviews for a marketplace listing',
  },
  get_creator_profile: {
    name: 'get_creator_profile',
    requiredCapability: 'marketplace:read',
    description: 'Get a creator profile by user ID',
  },
};

// ---------------------------------------------------------------------------
// Capability → Tool mapping
// ---------------------------------------------------------------------------

export const CAPABILITY_TOOLS: Record<string, readonly string[]> = {
  'marketplace:read': ['get_listing', 'search_listings', 'get_reviews', 'get_creator_profile'],
  'marketplace:install': ['install_listing'],
  'marketplace:purchase': ['purchase_marketplace'],
};

// ---------------------------------------------------------------------------
// Tool executor (scaffold)
// ---------------------------------------------------------------------------

export type ToolExecutor = (input: McpToolInput) => Promise<McpToolResult>;

/**
 * Execute an MCP tool with capability checking.
 * The actual tool logic is injected via the service dependency.
 */
export function executeMcpTool(
  input: McpToolInput,
  service: MarketplaceService,
  extraCapabilityCheck?: (capability: string) => void,
): Promise<McpToolResult> {
  // Validate input
  if (!input.tool) {
    return Promise.resolve({
      ok: false,
      errors: [{ level: 'error', code: 'MISSING_TOOL', message: 'tool name is required' }],
    });
  }

  const toolDef = MCP_TOOL_DEFINITIONS[input.tool];
  if (!toolDef) {
    return Promise.resolve({
      ok: false,
      errors: [{ level: 'error', code: 'UNKNOWN_TOOL', message: `Unknown tool: ${input.tool}` }],
    });
  }

  // Check capability
  try {
    checkMcpCapability(
      input.workspaceId,
      toolDef.requiredCapability,
      input.grantedCapabilities,
    );
    extraCapabilityCheck?.(toolDef.requiredCapability);
  } catch (e) {
    if (e instanceof Error) {
      return Promise.resolve({
        ok: false,
        errors: [{ level: 'error', code: 'ERR_PERMISSION_DENIED', message: e.message }],
      });
    }
    throw e;
  }

  // Dispatch to tool handler (scaffold — returns placeholder)
  return dispatchTool(input, service);
}

async function dispatchTool(
  input: McpToolInput,
  _service: MarketplaceService,
): Promise<McpToolResult> {
  switch (input.tool) {
    case 'get_listing': {
      const listing = await _service.getListing(input.params.listing_id as string);
      return { ok: true, data: listing as unknown as Record<string, unknown> };
    }
    case 'search_listings': {
      const listings = await _service.listListings(
        input.params as { status?: string; sellerId?: string; limit?: number },
      );
      return { ok: true, data: { items: listings, total: listings.length } };
    }
    case 'install_listing': {
      // Scaffold: install_listing requires marketplace:install capability
      // Real implementation would trigger install flow
      return { ok: true, data: { listing_id: input.params.listing_id, status: 'installing' } };
    }
    case 'purchase_marketplace': {
      // Scaffold: purchase_marketplace requires marketplace:purchase capability
      // Real implementation would call createPurchase
      return { ok: true, data: { listing_id: input.params.listing_id, status: 'pending' } };
    }
    case 'get_reviews': {
      const reviews = await _service.listReviews(input.params.listing_id as string);
      return { ok: true, data: { items: reviews, total: reviews.length } };
    }
    case 'get_creator_profile': {
      const profile = await _service.getCreatorProfile(input.params.user_id as string);
      return { ok: true, data: profile as unknown as Record<string, unknown> };
    }
    default:
      return {
        ok: false,
        errors: [{ level: 'error', code: 'UNKNOWN_TOOL', message: `Unknown tool: ${input.tool}` }],
      };
  }
}
