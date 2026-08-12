/**
 * CadImportedModel — viewer-side renderer for CAD-imported 3D meshes.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Wraps `Model3DViewer` for CAD-imported meshes. The CAD job id
 * (resolved by `cad-jobs` service to a baked mesh blob) is included
 * for telemetry. The render path is identical; the only delta is the
 * data-testid and an analytic "CAD" badge in the chrome so viewers
 * know that the model came from a STEP / IGES import.
 */

'use client';

import type { ReactElement } from 'react';
import type { Model3DLayer } from '@domio/schema/generated/scene-graph';
import { Model3DViewer } from './Model3DViewer';

export interface CadImportedModelProps {
  readonly layer: Model3DLayer & { cadJobId?: string };
  readonly reducedMotion: boolean;
  readonly dataTestId?: string;
}

export function CadImportedModel({
  layer,
  reducedMotion,
  dataTestId = 'cad-imported-model',
}: CadImportedModelProps): ReactElement {
  const cadJobId = (layer as Model3DLayer & { cadJobId?: string }).cadJobId;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Model3DViewer layer={layer} reducedMotion={reducedMotion} dataTestId={`${dataTestId}-inner`} />
      {cadJobId ? (
        <div
          data-testid={`${dataTestId}-badge`}
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 10,
            fontFamily: 'monospace',
          }}
        >
          CAD · {cadJobId.slice(0, 8)}
        </div>
      ) : null}
    </div>
  );
}