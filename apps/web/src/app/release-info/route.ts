import { releaseIdentity } from '@repo/types/release';

export const dynamic = 'force-dynamic';
export function GET(): Response {
  return Response.json(releaseIdentity(process.env), { headers: { 'Cache-Control': 'no-store' } });
}
