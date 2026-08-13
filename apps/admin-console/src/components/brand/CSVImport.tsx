'use client';

/**
 * CSVImport — drag-drop + click-to-browse CSV uploader.
 *
 * Per Wave 8 §S8.2. Emits the selected `File` to `onImport`; the
 * surrounding page is responsible for parsing + posting.
 */

import { useRef, useState, type ChangeEvent, type DragEvent, type ReactElement } from 'react';
import { Upload } from 'lucide-react';
import { clsx } from 'clsx';

export interface CSVImportProps {
  readonly onImport: (file: File) => void;
  readonly dataTestId?: string;
}

export function CSVImport({ onImport, dataTestId = 'csv-import' }: CSVImportProps): ReactElement {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File | undefined | null) {
    if (!file) return;
    onImport(file);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    handleFile(e.target.files?.[0]);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
  }

  return (
    <div data-testid={dataTestId} className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
        CSV bulk import
      </div>
      <div
        data-testid="csv-dropzone"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition',
          dragOver
            ? 'border-brand-400 bg-brand-50 text-brand-700'
            : 'border-slate-300 bg-slate-50 text-slate-600 hover:border-slate-400 hover:bg-slate-100',
        )}
      >
        <Upload className="h-5 w-5" aria-hidden />
        <div className="text-sm font-medium">Drop a CSV here or click to browse</div>
        <div className="text-xs text-slate-500">Columns: deck_id, mode, notes</div>
      </div>
      <input
        ref={fileRef}
        data-testid="csv-file"
        type="file"
        accept=".csv,text/csv"
        onChange={onChange}
        className="hidden"
        aria-label="Upload CSV file"
      />
    </div>
  );
}