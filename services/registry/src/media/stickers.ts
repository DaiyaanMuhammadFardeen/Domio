import type { ServiceDeps } from '../deps.js';
import { Errors } from '../errors.js';

// ---------------------------------------------------------------------------
// Sticker pack types
// ---------------------------------------------------------------------------

export interface StickerRecord {
  catalogId: string;
  informalOnly: boolean;
  installed: true;
}

export interface InstallStickerPackInput {
  packId: string;
  workspaceId: string;
  userId: string;
}

export interface ListStickerPacksInput {
  theme?: string;
}

// ---------------------------------------------------------------------------
// Sticker pack service
// ---------------------------------------------------------------------------

/**
 * Install a sticker pack for a user in a workspace.
 * Returns per-sticker installation records.
 */
export async function installStickerPack(
  deps: ServiceDeps,
  input: InstallStickerPackInput,
): Promise<StickerRecord[]> {
  const packs = await deps.store.listStickerPacks();
  const pack = packs.find((p) => p.id === input.packId);
  if (!pack) {
    throw Errors.notFound(`sticker pack ${input.packId}`);
  }

  return pack.stickerComponentIds.map((catalogId) => ({
    catalogId,
    informalOnly: pack.informalOnly,
    installed: true as const,
  }));
}

/**
 * List available sticker packs, optionally filtered by theme.
 */
export async function listAvailableStickerPacks(
  deps: ServiceDeps,
  input: ListStickerPacksInput = {},
) {
  return deps.store.listStickerPacks(input.theme);
}
