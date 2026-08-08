import { JoinForm } from '@/components/join/JoinForm';
import { MobileShell } from '@/components/layout/MobileShell';
import { headers } from 'next/headers';

export default async function HomePage() {
  const code = (await headers()).get('x-join-code') ?? '';
  return (
    <MobileShell title="Join a session" connectionStatus="closed">
      <JoinForm
        initialCode={code}
        onSubmit={(_code, _name) => {
          /* form submission is handled client-side via router.push */
        }}
      />
    </MobileShell>
  );
}