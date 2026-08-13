'use client';

import { useRef, useState } from 'react';
import { FileUp, Check } from 'lucide-react';

export interface MetadataImportProps {
  onImport: (parsed: { entity_id: string; acs_url: string; raw_xml: string }) => void;
}

interface ParsedMetadata {
  entity_id: string;
  acs_url: string;
  raw_xml: string;
}

/**
 * Minimal SAML metadata XML parser — looks for `entityID="..."` and an
 * `AssertionConsumerService` URL via regex. We deliberately avoid a
 * full DOMParser dependency to keep the bundle small.
 */
function parseMetadata(xml: string): ParsedMetadata | null {
  const entityMatch = xml.match(/entityID\s*=\s*"([^"]+)"/i);
  const acsMatch = xml.match(/<[\w:]*AssertionConsumerService[^>]*Location\s*=\s*"([^"]+)"/i);
  if (!entityMatch || !acsMatch) return null;
  return {
    entity_id: entityMatch[1] ?? '',
    acs_url: acsMatch[1] ?? '',
    raw_xml: xml,
  };
}

/**
 * File-input driven SAML metadata importer. Previews parsed
 * `entityID` + ACS URL; confirms by calling `onImport`.
 *
 * Per Wave 8 §S8.1 of docs/frontend-roadmap/08-wave-enterprise.md.
 */
export function MetadataImport({ onImport }: MetadataImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setParsed(null);
    const text = await file.text();
    const result = parseMetadata(text);
    if (!result) {
      setError('Could not find entityID or AssertionConsumerService in the file.');
      return;
    }
    setParsed(result);
  }

  function reset() {
    setParsed(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="metadata-import"
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Import SAML metadata</h3>
          <p className="text-xs text-slate-500">
            Upload the IdP&apos;s <code className="text-[11px]">metadata.xml</code> to populate
            entityID and ACS URL.
          </p>
        </div>
      </div>

      <label
        htmlFor="metadata-file"
        className="flex cursor-pointer items-center justify-between rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 transition hover:border-brand-400 hover:bg-brand-50"
      >
        <span className="inline-flex items-center gap-2">
          <FileUp className="h-4 w-4 text-slate-400" aria-hidden />
          {parsed ? 'Replace file' : 'Choose .xml file'}
        </span>
        <span className="text-slate-400">click to browse</span>
        <input
          ref={inputRef}
          id="metadata-file"
          data-testid="metadata-file"
          type="file"
          accept=".xml,text/xml,application/xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </label>

      {error && (
        <div
          className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {parsed && (
        <div
          className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3"
          data-testid="metadata-parse-preview"
        >
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            Parsed
          </div>
          <dl className="mt-2 space-y-1 text-xs text-emerald-900">
            <div className="flex gap-2">
              <dt className="font-medium text-emerald-700">entity_id</dt>
              <dd className="font-mono break-all">{parsed.entity_id}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-emerald-700">acs_url</dt>
              <dd className="font-mono break-all">{parsed.acs_url}</dd>
            </div>
          </dl>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onImport(parsed)}
              data-testid="metadata-confirm"
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              <Check className="h-3 w-3" aria-hidden />
              Use these values
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
