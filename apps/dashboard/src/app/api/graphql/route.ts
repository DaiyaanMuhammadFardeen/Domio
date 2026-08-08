/**
 * /api/graphql — dashboard gateway route handler.
 *
 * Delegates POST + GET to the graphql-yoga instance. The yoga handler
 * is created lazily so the module loads quickly during `next build`.
 */

import type { NextRequest } from 'next/server';
import { makeYoga } from '../../../lib/graphql/server';

let yogaInstance: ReturnType<typeof makeYoga> | null = null;
function getYoga(): ReturnType<typeof makeYoga> {
  if (!yogaInstance) yogaInstance = makeYoga();
  return yogaInstance;
}

const yogaFetch = async (req: NextRequest): Promise<Response> => {
  const yoga = getYoga();
  return yoga.handle(req as unknown as Request, {});
};

export async function POST(req: NextRequest): Promise<Response> {
  return yogaFetch(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  return yogaFetch(req);
}

export const dynamic = 'force-dynamic';