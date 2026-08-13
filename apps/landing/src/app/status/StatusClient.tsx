/**
 * Client wrapper for the status page.
 *
 * The page initialises with a server-rendered snapshot of the
 * status data, but the subscribe form needs client-side state
 * (localStorage + form handlers). This thin client component
 * hosts the subscribe form so the heavy server-side data
 * fetching stays out of the client bundle.
 */

'use client';

import type { JSX } from 'react';
import { SubscribeForm } from '../../components/status/SubscribeForm';

export interface StatusClientProps {
  readonly statusEndpoint: string;
}

export function StatusClient(_props: StatusClientProps): JSX.Element {
  // The endpoint is sourced on the server in `fetchStatus()`.
  // We accept it as a prop so future server-driven revalidation
  // (e.g. SWR) can be wired in without changing the page.
  return (
    <div className="status-client">
      <SubscribeForm />
    </div>
  );
}

export default StatusClient;
