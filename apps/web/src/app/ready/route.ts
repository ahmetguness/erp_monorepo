import { releaseIdentity } from '@repo/types/release';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ready', release: releaseIdentity(process.env) }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
