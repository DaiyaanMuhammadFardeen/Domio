'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MobileShell } from '@/components/layout/MobileShell';
import { resolveHandoutToken } from '@/lib/handout-service';

export default function HandoutPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The signed-link-token package is verified on the server; here we
    // simply route to /j/[code] after stripping the workspace prefix.
    if (!params?.token) return;
    resolveHandoutToken(params.token)
      .then((body) => {
        if (body.session_code) {
          router.push(`/j/${body.session_code}`);
        } else {
          setError('handout link is invalid or expired');
        }
      })
      .catch(() => setError('handout link could not be resolved'));
  }, [params?.token, router]);

  return (
    <MobileShell title="Opening handout…" connectionStatus="closed">
      {error ? (
        <p className="text-red-700" role="alert">{error}</p>
      ) : (
        <p className="text-slate-600">Resolving your handout link…</p>
      )}
    </MobileShell>
  );
}