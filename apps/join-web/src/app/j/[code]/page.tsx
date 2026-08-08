'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MobileShell } from '@/components/layout/MobileShell';
import { JoinForm } from '@/components/join/JoinForm';
import { WidgetRenderer } from '@/components/widgets/WidgetRenderer';
import { getOrCreateParticipantId } from '@/runtime/device-id';
import { connect, type WSClient } from '@/runtime/ws-client';
import type { AudienceWidgetDescriptor, SessionCode } from '@domio/audience-service';
import { isAudienceEnvelope, type AudienceEnvelope } from '@domio/protocol';

interface JoinState {
  readonly code: string;
  readonly displayName: string;
}

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = (params?.code ?? '').toUpperCase();
  const [stage, setStage] = useState<'collect' | 'connected'>('collect');
  const [form, setForm] = useState<JoinState>({ code, displayName: '' });
  const [error, setError] = useState<string | null>(null);
  const [conn, setConn] = useState<'connecting' | 'open' | 'closed'>('closed');
  const [widgets, setWidgets] = useState<ReadonlyArray<AudienceWidgetDescriptor>>([]);

  const apiBase = useMemo(() => (typeof window !== 'undefined' ? window.location.origin : ''), []);
  const wsUrl = useMemo(() => (typeof window !== 'undefined' ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/v1/audience/ws` : ''), []);

  useEffect(() => {
    setForm((f) => ({ ...f, code }));
  }, [code]);

  const onSubmit = (next: string, name: string): void => {
    setError(null);
    setForm({ code: next, displayName: name });
    setStage('connected');
  };

  useEffect(() => {
    if (stage !== 'connected') return;
    let client: WSClient | null = null;
    let cancelled = false;
    (async () => {
      const participantId = await getOrCreateParticipantId();
      if (cancelled) return;
      setConn('connecting');
      client = connect({
        url: wsUrl,
        sessionCode: form.code,
        workspaceId: 'default',
        participantId,
        locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
        onOpen: () => setConn('open'),
        onClose: () => setConn('closed'),
        onMessage: (msg) => onEnvelope(msg),
      });
    })();
    return () => {
      cancelled = true;
      client?.close();
    };
    void apiBase; // currently unused but keeps apiBase in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, form.code]);

  const onEnvelope = (msg: AudienceEnvelope): void => {
    if (!isAudienceEnvelope(msg)) return;
    if (msg.kind === 'welcome') {
      const meta = msg.session_metadata as { widgets?: ReadonlyArray<AudienceWidgetDescriptor> } | undefined;
      const w = meta?.widgets;
      if (Array.isArray(w)) setWidgets(w);
    }
  };

  if (stage === 'collect') {
    return (
      <MobileShell title="Join" connectionStatus="closed">
        <JoinForm
          initialCode={form.code}
          onSubmit={onSubmit}
          {...(error ? { error } : {})}
        />
      </MobileShell>
    );
  }

  return (
    <MobileShell title={`Session ${form.code}`} connectionStatus={conn}>
      <button
        type="button"
        className="mb-4 text-sm text-blue-700 underline"
        onClick={() => {
          setStage('collect');
          router.push('/');
        }}
        data-testid="leave-session"
      >
        Leave session
      </button>
      {widgets.length === 0 ? (
        <p className="text-slate-600">Waiting for the presenter to push widgets…</p>
      ) : (
        widgets.map((w) => (
          <WidgetRenderer
            key={w.widget_id}
            descriptor={w}
            disabled={conn !== 'open'}
            onSubmit={(payload) => {
              // Engine-specific routing happens in W4-W8. The envelope
              // is forwarded over the WS bus from the gateway.
              void payload;
            }}
          />
        ))
      )}
    </MobileShell>
  );
}

const _typecheck: SessionCode = '' as unknown as SessionCode;
void _typecheck;