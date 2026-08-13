/**
 * Viewer-identity — no-op mirror for tests + dev mode without ClickHouse.
 */

import type { ConsentEvent, ViewerRecord } from '../types.js';
import type { IdentityMirror } from './clickhouse.js';

export class NullIdentityMirror implements IdentityMirror {
  writeViewer(_viewer: ViewerRecord): Promise<void> {
    return Promise.resolve();
  }
  writeConsent(_event: ConsentEvent): Promise<void> {
    return Promise.resolve();
  }
  eraseViewer(_workspaceId: string, _viewerIdKey: string): Promise<void> {
    return Promise.resolve();
  }
}

export {
  buildIdentityMirror,
  type IdentityMirror,
  type IdentityMirrorClient,
} from './clickhouse.js';
