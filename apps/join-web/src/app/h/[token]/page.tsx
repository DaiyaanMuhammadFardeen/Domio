'use client';

import { useParams } from 'next/navigation';
import { MobileShell } from '@/components/layout/MobileShell';
import { HandoutResolver } from '@/components/HandoutResolver';

export default function HandoutPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';

  return (
    <MobileShell title="Your handout" connectionStatus="closed">
      {token ? (
        <HandoutResolver token={token} />
      ) : (
        <p className="text-red-700" role="alert">
          handout link is missing its token
        </p>
      )}
    </MobileShell>
  );
}
