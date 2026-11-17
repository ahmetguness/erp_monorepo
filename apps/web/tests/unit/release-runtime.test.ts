import { afterEach, describe, expect, it, vi } from 'vitest';
import { decideRouteAccess } from '@/bootstrap/routing/access-policy';
import { GET as ready } from '@/app/ready/route';
import { GET as identity } from '@/app/release-info/route';

afterEach(() => vi.unstubAllEnvs());
describe('release runtime contracts', () => {
  it.each(['/ready', '/release-info'])('allows an unauthenticated operational read of %s', (pathname) => {
    expect(decideRouteAccess({ pathname, search: '', hasToken: false, hasReturnTarget: false })).toEqual({ type: 'allow' });
  });
  it('still protects tenant pages', () => {
    expect(decideRouteAccess({ pathname: '/dashboard/invoices', search: '', hasToken: false, hasReturnTarget: false }).type).toBe('login');
  });
  it('returns the runtime identity without cache or secret values', async () => {
    vi.stubEnv('RELEASE_GIT_SHA', 'a'.repeat(40)); vi.stubEnv('RELEASE_VERSION', '1.2.3');
    vi.stubEnv('JWT_SECRET', 'must-not-be-public');
    const response = identity();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body: unknown = await response.json();
    expect(body).toEqual({ version: '1.2.3', gitSha: 'a'.repeat(40), apiContractVersion: 1, eventSchemaVersion: 2, featureFlagVersion: 1 });
    expect(JSON.stringify(body)).not.toContain('must-not-be-public');
    const readiness: unknown = await ready().json();
    expect(readiness).toMatchObject({ status: 'ready' });
  });
});
