/**
 * MCP Tool implementations — one entry per registry capability.
 *
 * Each tool catches RegistryError and maps it to a structured error result.
 * Only successful write operations produce audit rows.
 */

import type { ServiceDeps } from '../deps.js';
import { Errors, RegistryError } from '../errors.js';
import { searchPackages, getPackage, listVersions } from '../catalog/catalog.js';
import { installPackage, uninstallPackage } from '../install/install.js';
import { resolvePinTarget, type PinMode } from '../catalog/pins.js';
import { searchListings, reindexAll } from '../marketplace/search.js';
import { getPublicListing } from '../marketplace/listings.js';
import { issueLicenseGrant, verifyLicense } from '../install/license.js';
import { installTemplate } from '../templates/engine.js';
import { searchIcons } from '../media/icons.js';
import { validateLottie } from '../media/animations.js';
import { applyDefaults, validateProps } from '@domio/schema-prop';
import { withAudit } from '../audit/audit.js';
import { nowMs } from '../deps.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPToolContext {
  agentId: string;
  workspaceId: string;
}

export type MCPToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (
    deps: ServiceDeps,
    input: Record<string, unknown>,
    ctx: MCPToolContext,
  ) => Promise<MCPToolResult>;
}

/** Map a thrown error to an MCPToolResult (never throws). */
function toResult(err: unknown): MCPToolResult {
  if (err instanceof RegistryError) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  return {
    ok: false,
    error: {
      code: 'ERR_VALIDATION',
      message: err instanceof Error ? err.message : 'Unknown error',
    },
  };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const component_list: MCPTool = {
  name: 'component_list',
  description: 'List or search component packages from the catalog.',
  inputSchema: {
    type: 'object',
    properties: {
      catalogId: { type: 'string', description: 'Filter by catalogId (exact match via search).' },
      category: { type: 'string', description: 'Filter by category.' },
      query: {
        type: 'string',
        description: 'Full-text search across name, catalogId, description.',
      },
      kind: { type: 'string', description: 'Filter by component kind.' },
      limit: { type: 'number', description: 'Max results (default 50).' },
    },
  },
  async run(deps, input) {
    try {
      const query = String(input.query ?? input.catalogId ?? '');
      if (query) {
        const results = await searchPackages(deps, query, {
          ...(input.kind ? { kind: String(input.kind) } : {}),
          ...(input.limit ? { limit: Number(input.limit) } : {}),
        });
        const filtered = input.category
          ? results.filter((p) => p.category === String(input.category))
          : results;
        return { ok: true, data: filtered };
      }
      const results = await deps.store.listPackages({
        ...(input.kind ? { kind: String(input.kind) } : {}),
        ...(input.category ? { category: String(input.category) } : {}),
        ...(input.limit ? { limit: Number(input.limit) } : {}),
      });
      return { ok: true, data: results };
    } catch (e) {
      return toResult(e);
    }
  },
};

const component_describe: MCPTool = {
  name: 'component_describe',
  description:
    'Get full manifest including props schema, variants, and deprecation info for a component.',
  inputSchema: {
    type: 'object',
    required: ['catalogId'],
    properties: {
      catalogId: { type: 'string', description: 'The component catalog ID.' },
      version: { type: 'string', description: 'Optional specific version; defaults to latest.' },
    },
  },
  async run(deps, input) {
    try {
      const catalogId = String(input.catalogId);
      const versions = await listVersions(deps, catalogId);
      if (!versions.length) throw Errors.notFound(`component ${catalogId}`);
      const version = input.version ? String(input.version) : versions[0]!.version;
      const pkg = await getPackage(deps, catalogId, version);
      return { ok: true, data: pkg };
    } catch (e) {
      return toResult(e);
    }
  },
};

const component_install: MCPTool = {
  name: 'component_install',
  description:
    'Install or update a component in a workspace library. Returns bundle URLs and license info.',
  inputSchema: {
    type: 'object',
    required: ['catalogId'],
    properties: {
      catalogId: { type: 'string', description: 'Component catalog ID to install.' },
      version: { type: 'string', description: 'Specific version (omit to follow pin).' },
      pinMode: {
        type: 'string',
        enum: ['track-latest', 'pin-version', 'pin-range', 'workspace-managed'],
        description: 'Pin mode.',
      },
      pinValue: { type: 'string', description: 'Pin value for pin-version or pin-range.' },
      workspaceId: {
        type: 'string',
        description: 'Target workspace (falls back to ctx.workspaceId).',
      },
      seats: { type: 'number', description: 'License seats (default 1).' },
    },
  },
  async run(deps, input, ctx) {
    try {
      const catalogId = String(input.catalogId);
      const workspaceId = String(input.workspaceId ?? ctx.workspaceId);
      const result = await withAudit(deps, ctx, 'component.install', 'component', catalogId, () =>
        installPackage(deps, {
          catalogId,
          workspaceId,
          userId: ctx.agentId,
          ...(input.version ? { version: String(input.version) } : {}),
          ...(input.pinMode ? { pinMode: String(input.pinMode) as PinMode } : {}),
          ...(input.pinValue ? { pinValue: String(input.pinValue) } : {}),
          ...(input.seats ? { seats: Number(input.seats) } : {}),
        }),
      );
      return { ok: true, data: result };
    } catch (e) {
      return toResult(e);
    }
  },
};

const component_uninstall: MCPTool = {
  name: 'component_uninstall',
  description: 'Remove a component from a workspace library.',
  inputSchema: {
    type: 'object',
    required: ['catalogId'],
    properties: {
      catalogId: { type: 'string', description: 'Component catalog ID to uninstall.' },
      workspaceId: {
        type: 'string',
        description: 'Target workspace (falls back to ctx.workspaceId).',
      },
    },
  },
  async run(deps, input, ctx) {
    try {
      const catalogId = String(input.catalogId);
      const workspaceId = String(input.workspaceId ?? ctx.workspaceId);
      await withAudit(deps, ctx, 'component.uninstall', 'component', catalogId, () =>
        uninstallPackage(deps, ctx.agentId, workspaceId, catalogId),
      );
      return { ok: true, data: { uninstalled: catalogId } };
    } catch (e) {
      return toResult(e);
    }
  },
};

const component_pin: MCPTool = {
  name: 'component_pin',
  description: 'Update the pin mode for an installed component.',
  inputSchema: {
    type: 'object',
    required: ['catalogId', 'pinMode'],
    properties: {
      catalogId: { type: 'string', description: 'Component catalog ID.' },
      pinMode: {
        type: 'string',
        enum: ['track-latest', 'pin-version', 'pin-range', 'workspace-managed'],
        description: 'New pin mode.',
      },
      pinValue: { type: 'string', description: 'Pin value for pin-version or pin-range.' },
      workspaceId: {
        type: 'string',
        description: 'Target workspace (falls back to ctx.workspaceId).',
      },
    },
  },
  async run(deps, input, ctx) {
    try {
      const catalogId = String(input.catalogId);
      const workspaceId = String(input.workspaceId ?? ctx.workspaceId);
      const pinMode = String(input.pinMode) as PinMode;

      // Verify the item exists
      const existing = await deps.store.getLibraryItem(ctx.agentId, workspaceId, catalogId);
      if (!existing)
        throw Errors.notFound(`installed component ${catalogId} in workspace ${workspaceId}`);

      // Validate pin mode
      const versions = await listVersions(deps, catalogId);
      const available = versions.map((v) => v.version);
      await resolvePinTarget(
        deps,
        { pinMode, ...(input.pinValue ? { pinValue: String(input.pinValue) } : {}) },
        available,
      );

      const updated = {
        ...existing,
        pinMode,
        ...(input.pinValue ? { pinValue: String(input.pinValue) } : {}),
        updatedAt: nowMs(deps),
      };

      await withAudit(deps, ctx, 'component.pin', 'component', catalogId, async () => {
        await deps.store.putLibraryItem(updated);
      });

      return { ok: true, data: updated };
    } catch (e) {
      return toResult(e);
    }
  },
};

const component_get_props_schema: MCPTool = {
  name: 'component_get_props_schema',
  description: 'Get the props schema JSON for a component.',
  inputSchema: {
    type: 'object',
    required: ['catalogId'],
    properties: {
      catalogId: { type: 'string', description: 'Component catalog ID.' },
      version: { type: 'string', description: 'Optional specific version; defaults to latest.' },
    },
  },
  async run(deps, input) {
    try {
      const catalogId = String(input.catalogId);
      const versions = await listVersions(deps, catalogId);
      if (!versions.length) throw Errors.notFound(`component ${catalogId}`);
      const version = input.version ? String(input.version) : versions[0]!.version;
      const pkg = await getPackage(deps, catalogId, version);
      return { ok: true, data: pkg.propsSchema };
    } catch (e) {
      return toResult(e);
    }
  },
};

const component_apply_props: MCPTool = {
  name: 'component_apply_props',
  description:
    'Apply defaults and validate props against a component schema. Returns the merged and validated props.',
  inputSchema: {
    type: 'object',
    required: ['catalogId', 'props'],
    properties: {
      catalogId: { type: 'string', description: 'Component catalog ID.' },
      version: { type: 'string', description: 'Optional specific version; defaults to latest.' },
      props: { type: 'object', description: 'Raw props to validate and merge with defaults.' },
    },
  },
  async run(deps, input) {
    try {
      const catalogId = String(input.catalogId);
      const versions = await listVersions(deps, catalogId);
      if (!versions.length) throw Errors.notFound(`component ${catalogId}`);
      const version = input.version ? String(input.version) : versions[0]!.version;
      const pkg = await getPackage(deps, catalogId, version);
      const schema = pkg.propsSchema;
      if (!schema || typeof schema !== 'object') {
        return { ok: true, data: { props: input.props, errors: [] } };
      }
      const merged = applyDefaults(schema as never, input.props as Record<string, unknown>);
      const result = validateProps(schema as never, merged);
      if (!result.valid) {
        return { ok: true, data: { props: result.value, errors: result.errors } };
      }
      return { ok: true, data: { props: result.value, errors: [] } };
    } catch (e) {
      return toResult(e);
    }
  },
};

const marketplace_search: MCPTool = {
  name: 'marketplace_search',
  description: 'Search marketplace listings by query, category, and price range.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (matches title, description, tags).' },
      category: { type: 'string', description: 'Filter by tag/category.' },
      minPrice: { type: 'number', description: 'Minimum price in cents.' },
      maxPrice: { type: 'number', description: 'Maximum price in cents.' },
      sort: {
        type: 'string',
        enum: ['relevance', 'newest', 'price-asc', 'price-desc', 'rating'],
        description: 'Sort mode.',
      },
      page: { type: 'number', description: 'Page number (default 1).' },
      pageSize: { type: 'number', description: 'Results per page (default 20).' },
    },
  },
  async run(deps, input) {
    try {
      await reindexAll(deps);
      const result = await searchListings(deps, {
        ...(input.query ? { q: String(input.query) } : {}),
        ...(input.category ? { category: String(input.category) } : {}),
        ...(input.minPrice !== undefined ? { minPrice: Number(input.minPrice) } : {}),
        ...(input.maxPrice !== undefined ? { maxPrice: Number(input.maxPrice) } : {}),
        ...(input.sort
          ? {
              sort: String(input.sort) as
                | 'relevance'
                | 'newest'
                | 'price-asc'
                | 'price-desc'
                | 'rating',
            }
          : {}),
        ...(input.page ? { page: Number(input.page) } : {}),
        ...(input.pageSize ? { pageSize: Number(input.pageSize) } : {}),
      });
      return { ok: true, data: result };
    } catch (e) {
      return toResult(e);
    }
  },
};

const marketplace_get_listing: MCPTool = {
  name: 'marketplace_get_listing',
  description: 'Get a public marketplace listing by ID or catalogId.',
  inputSchema: {
    type: 'object',
    properties: {
      listingId: { type: 'string', description: 'Listing ID.' },
      catalogId: { type: 'string', description: 'Or lookup by catalogId.' },
    },
  },
  async run(deps, input) {
    try {
      if (input.listingId) {
        const listing = await getPublicListing(deps, String(input.listingId));
        return { ok: true, data: listing };
      }
      if (input.catalogId) {
        const listing = await deps.store.getListingByCatalogId(String(input.catalogId));
        if (!listing) throw Errors.notFound(`listing for catalogId ${input.catalogId}`);
        if (listing.status === 'removed')
          throw Errors.gone(`listing for ${input.catalogId} was removed`);
        return { ok: true, data: listing };
      }
      throw Errors.validation('Provide either listingId or catalogId');
    } catch (e) {
      return toResult(e);
    }
  },
};

const marketplace_purchase: MCPTool = {
  name: 'marketplace_purchase',
  description: 'Purchase a marketplace listing: issues a license grant and returns a signed token.',
  inputSchema: {
    type: 'object',
    required: ['listingId'],
    properties: {
      listingId: { type: 'string', description: 'Listing ID to purchase.' },
      seats: { type: 'number', description: 'Number of seats (default 1).' },
      workspaceId: {
        type: 'string',
        description: 'Target workspace (falls back to ctx.workspaceId).',
      },
    },
  },
  async run(deps, input, ctx) {
    try {
      const listingId = String(input.listingId);
      const workspaceId = String(input.workspaceId ?? ctx.workspaceId);
      const seats = input.seats ? Number(input.seats) : 1;

      const listing = await getPublicListing(deps, listingId);

      const grant = await withAudit(deps, ctx, 'marketplace.purchase', 'listing', listingId, () =>
        issueLicenseGrant(deps, {
          workspaceId,
          userId: ctx.agentId,
          catalogId: listing.catalogId,
          version: '*', // latest at time of purchase
          listingId,
          seats,
        }),
      );

      // Verify round trip
      const verification = await verifyLicense(deps, { token: grant.signedToken });

      return {
        ok: true,
        data: {
          grant,
          token: grant.signedToken,
          verification: { valid: verification.valid, reason: verification.reason },
        },
      };
    } catch (e) {
      return toResult(e);
    }
  },
};

const template_apply: MCPTool = {
  name: 'template_apply',
  description:
    'Apply a template: deep-copies the deck JSON and replaces placeholders with provided values (or defaults).',
  inputSchema: {
    type: 'object',
    required: ['templateId'],
    properties: {
      templateId: { type: 'string', description: 'Template ID.' },
      values: { type: 'object', description: 'Map of placeholder key → value overrides.' },
      workspaceId: {
        type: 'string',
        description: 'Target workspace (falls back to ctx.workspaceId).',
      },
    },
  },
  async run(deps, input, ctx) {
    try {
      const templateId = String(input.templateId);
      const workspaceId = String(input.workspaceId ?? ctx.workspaceId);

      const result = await withAudit(deps, ctx, 'template.apply', 'template', templateId, () =>
        installTemplate(deps, {
          templateId,
          workspaceId,
          userId: ctx.agentId,
          values: (input.values as Record<string, unknown>) ?? {},
        }),
      );
      return { ok: true, data: result };
    } catch (e) {
      return toResult(e);
    }
  },
};

const media_search_icons: MCPTool = {
  name: 'media_search_icons',
  description: 'Search the icon catalog with synonym expansion. Optionally filter by color/style.',
  inputSchema: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string', description: 'Search term (auto-expanded with synonyms).' },
      color: { type: 'string', description: 'Optional hex color to recolor results.' },
      styles: { type: 'array', items: { type: 'string' }, description: 'Filter by icon styles.' },
      limit: { type: 'number', description: 'Max results (default from limits).' },
    },
  },
  async run(deps, input) {
    try {
      const results = await searchIcons(deps, {
        q: String(input.query),
        ...(input.styles ? { styles: input.styles as string[] } : {}),
        ...(input.limit ? { limit: Number(input.limit) } : {}),
      });

      // If color is specified, attach recolor info to each result
      if (input.color) {
        const color = String(input.color);
        return {
          ok: true,
          data: results.map((icon) => ({
            ...icon,
            recolorPayload: {
              elementId: '',
              catalogId: 'domio.icon',
              props: { iconId: icon.id, color, size: 24 },
            },
          })),
        };
      }

      return { ok: true, data: results };
    } catch (e) {
      return toResult(e);
    }
  },
};

const media_validate_animation: MCPTool = {
  name: 'media_validate_animation',
  description:
    'Validate a Lottie JSON or GIF bytes for safety (expressions, prototype pollution, layer limits).',
  inputSchema: {
    type: 'object',
    properties: {
      lottieJson: { type: 'object', description: 'Lottie JSON object to validate.' },
      gifBytes: { type: 'number', description: 'GIF file size in bytes for budget check.' },
    },
  },
  async run(deps, input) {
    try {
      if (input.lottieJson) {
        const result = validateLottie(input.lottieJson, {
          maxBytes: deps.limits.maxPackageBytes,
        });
        if (result.valid) {
          return { ok: true as const, data: result };
        }
        return {
          ok: false as const,
          error: { code: 'ERR_VALIDATION', message: result.errors.join('; ') },
        };
      }
      if (input.gifBytes !== undefined) {
        const budgetBytes = deps.limits.gifBudgetKb * 1024;
        const size = Number(input.gifBytes);
        if (size > budgetBytes) {
          return {
            ok: false,
            error: {
              code: 'ERR_VALIDATION',
              message: `GIF size ${size} bytes exceeds budget ${budgetBytes} bytes`,
            },
          };
        }
        return { ok: true, data: { size, budget: budgetBytes, valid: true } };
      }
      throw Errors.validation('Provide either lottieJson or gifBytes');
    } catch (e) {
      return toResult(e);
    }
  },
};

// ---------------------------------------------------------------------------
// Export the full tool list
// ---------------------------------------------------------------------------

export const mcpTools: MCPTool[] = [
  component_list,
  component_describe,
  component_install,
  component_uninstall,
  component_pin,
  component_get_props_schema,
  component_apply_props,
  marketplace_search,
  marketplace_get_listing,
  marketplace_purchase,
  template_apply,
  media_search_icons,
  media_validate_animation,
];
