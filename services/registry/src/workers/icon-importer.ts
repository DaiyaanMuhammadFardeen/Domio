import type { ServiceDeps } from '../deps.js';
import { ingestIcon, searchIcons } from '../media/icons.js';

// ---------------------------------------------------------------------------
// Icon importer worker
// ---------------------------------------------------------------------------

export interface IconImportSource {
  name: string;
  synonyms?: string[];
  styles?: string[];
  pathData: string;
  viewBox?: string;
  vendor?: string;
  licenseId?: string;
}

export interface IconImporterResult {
  ingested: number;
  skipped: number;
}

/**
 * Ingest a batch of icon records. Skips icons whose name already exists
 * in the catalog (exact match via searchIcons).
 */
export async function run(
  deps: ServiceDeps,
  { source, batchSize }: { source: IconImportSource[]; batchSize?: number },
): Promise<IconImporterResult> {
  const limit = batchSize ?? source.length;
  let ingested = 0;
  let skipped = 0;

  for (const item of source.slice(0, limit)) {
    // Check if an icon with this exact name already exists
    const existing = await searchIcons(deps, { q: item.name, limit: 10 });
    const nameMatch = existing.find(
      (icon) => icon.name.toLowerCase() === item.name.toLowerCase(),
    );

    if (nameMatch) {
      skipped++;
      continue;
    }

    await ingestIcon(deps, {
      name: item.name,
      pathData: item.pathData,
      ...(item.synonyms ? { synonyms: item.synonyms } : {}),
      ...(item.styles ? { styles: item.styles } : {}),
      ...(item.viewBox ? { viewBox: item.viewBox } : {}),
      ...(item.vendor ? { vendor: item.vendor } : {}),
      ...(item.licenseId ? { licenseId: item.licenseId } : {}),
    });
    ingested++;
  }

  return { ingested, skipped };
}
