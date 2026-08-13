/**
 * LiveAppEmbed — iframe sandbox config UI.
 *
 * Per Wave 2 §S2.10 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * - Origin allowlist.
 * - Allowed permissions (postmessage, clipboard-write, etc.).
 * - JWT generation for the iframe session.
 */

'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

export interface LiveAppEmbedConfig {
  url: string;
  allowedOrigins: readonly string[];
  allowedPermissions: readonly string[];
  /** JWT for the embed session. */
  jwt: string;
}

export interface LiveAppEmbedProps {
  initialUrl: string;
  onChange: (config: LiveAppEmbedConfig) => void;
}

const ALL_PERMISSIONS = [
  'postmessage',
  'clipboard-write',
  'fullscreen',
  'camera',
  'microphone',
] as const;

function generateJwt(): string {
  // Bootstrap JWT-shaped token (real backend will sign properly).
  return `header.${btoa(JSON.stringify({ iat: Date.now() }))}.signature`;
}

export function LiveAppEmbed({ initialUrl, onChange }: LiveAppEmbedProps): ReactElement {
  const [url, setUrl] = useState(initialUrl);
  const [originsText, setOriginsText] = useState('https://example.com');
  const [permissions, setPermissions] = useState<readonly string[]>(['postmessage']);
  const [jwt, setJwt] = useState(generateJwt());

  const cfg = useMemo<LiveAppEmbedConfig>(
    () => ({
      url,
      allowedOrigins: originsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      allowedPermissions: permissions,
      jwt,
    }),
    [url, originsText, permissions, jwt],
  );

  const handleSubmit = useCallback(() => {
    onChange(cfg);
  }, [cfg, onChange]);

  const togglePermission = useCallback((p: string) => {
    setPermissions((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }, []);

  const handleRegenerateJwt = useCallback(() => {
    setJwt(generateJwt());
  }, []);

  return (
    <div className="live-app-embed" data-testid="live-app-embed">
      <label>
        URL
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          data-testid="embed-url"
        />
      </label>
      <label>
        Allowed origins (comma-separated)
        <input
          type="text"
          value={originsText}
          onChange={(e) => setOriginsText(e.target.value)}
          data-testid="embed-origins"
        />
      </label>
      <fieldset>
        <legend>Allowed permissions</legend>
        {ALL_PERMISSIONS.map((p) => (
          <label key={p} className="live-app-embed__permission">
            <input
              type="checkbox"
              checked={permissions.includes(p)}
              onChange={() => togglePermission(p)}
              data-testid={`embed-permission-${p}`}
            />
            {p}
          </label>
        ))}
      </fieldset>
      <div className="live-app-embed__jwt">
        <label>
          JWT
          <input
            type="text"
            value={jwt}
            onChange={(e) => setJwt(e.target.value)}
            data-testid="embed-jwt"
          />
        </label>
        <button type="button" onClick={handleRegenerateJwt} data-testid="embed-regen-jwt">
          Regenerate
        </button>
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        className="live-app-embed__apply"
        data-testid="embed-apply"
      >
        Apply
      </button>
    </div>
  );
}
