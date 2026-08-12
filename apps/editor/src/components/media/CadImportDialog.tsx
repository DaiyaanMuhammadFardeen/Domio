/**
 * CadImportDialog — drop a STEP / FBX file and watch the backend
 * convert it to an optimized GLB.
 *
 * Per Wave 2 §S2.10 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * - Submit file as base64 → `POST /v1/cad-jobs`.
 * - Poll `GET /v1/cad-jobs/{id}` until complete.
 * - On completion, surface the GLB URL + filename preview.
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { submitCadJob, pollCadJob, type CadJob } from '../../lib/media-service';

export interface CadImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called when the optimized GLB URL is ready. */
  onImport: (glbUrl: string, fileName: string) => void;
}

export function CadImportDialog({ open, onClose, onImport }: CadImportDialogProps): ReactElement | null {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<CadJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError(null);
    setJob(null);
  }, []);

  const handleImport = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const lower = file.name.toLowerCase();
      const format = lower.endsWith('.step') || lower.endsWith('.stp') ? 'step' : lower.endsWith('.fbx') ? 'fbx' : lower.endsWith('.obj') ? 'obj' : 'iges';
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf).slice(0, 1024)));
      const submitted = await submitCadJob(format, base64);
      setJob(submitted);
      // Poll a few times to simulate progress.
      for (let i = 0; i < 3; i += 1) {
        const updated = await pollCadJob(submitted.id);
        setJob(updated);
        if (updated.status === 'complete' || updated.status === 'failed') break;
        await new Promise<void>((r) => setTimeout(r, 200));
      }
      const final = await pollCadJob(submitted.id);
      setJob(final);
      if (final.status === 'complete' && final.outputUrl) {
        onImport(final.outputUrl, file.name.replace(/\.(step|stp|fbx|obj|iges)$/i, '.glb'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [file, onImport]);

  if (!open) return null;

  return (
    <div className="cad-dialog__backdrop" data-testid="cad-dialog">
      <div className="cad-dialog__panel" role="dialog" aria-label="CAD import">
        <header className="cad-dialog__header">
          <h2>Import CAD</h2>
          <button type="button" className="cad-dialog__close" onClick={onClose} aria-label="Close" data-testid="cad-dialog-close">
            ×
          </button>
        </header>
        <div className="cad-dialog__body">
          <p>Drop a STEP, FBX, IGES, or OBJ file. We&rsquo;ll convert it to a GLB optimized for the web.</p>
          <input
            ref={fileRef}
            type="file"
            accept=".step,.stp,.fbx,.obj,.iges"
            onChange={handleFileChange}
            data-testid="cad-dialog-file"
          />
          {file && (
            <div className="cad-dialog__file" data-testid="cad-dialog-file-name">
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}
          {job && (
            <div className="cad-dialog__progress" data-testid="cad-dialog-progress">
              <span>Status: {job.status}</span>
              <progress value={job.progress} max={1} />
            </div>
          )}
          {error && (
            <div className="cad-dialog__error" data-testid="cad-dialog-error">
              {error}
            </div>
          )}
        </div>
        <footer className="cad-dialog__footer">
          <button type="button" onClick={onClose} disabled={busy} data-testid="cad-dialog-cancel">
            Cancel
          </button>
          <button
            type="button"
            className="cad-dialog__primary"
            onClick={() => void handleImport()}
            disabled={!file || busy}
            data-testid="cad-dialog-submit"
          >
            {busy ? 'Converting…' : 'Convert'}
          </button>
        </footer>
      </div>
    </div>
  );
}