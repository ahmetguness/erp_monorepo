import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminMfaSetup } from '@/components/features/admin/AdminMfaSetup';

// Synthetic fixture only; never use an actual enrollment secret in tests.
const secret = 'JBSWY3DPEHPK3PXP';
const otpauthUri = `otpauth://totp/Test?secret=${secret}&issuer=Test`;

describe('Admin MFA setup', () => {
  it('renders an inline QR code and preserves manual setup', () => {
    const html = renderToStaticMarkup(createElement(AdminMfaSetup, { secret, otpauthUri }));
    expect(html).toContain('<svg');
    expect(html).toContain('<path');
    expect(html).toContain(secret);
    expect(html).toContain('otpauth://totp/Test?secret=');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('https://');
  });

  it('regenerates the QR pattern when enrollment changes', () => {
    const first = renderToStaticMarkup(createElement(AdminMfaSetup, { secret, otpauthUri }));
    const second = renderToStaticMarkup(createElement(AdminMfaSetup, { secret, otpauthUri: `${otpauthUri}&period=30` }));
    expect(first.match(/<path[^>]+/g)).not.toEqual(second.match(/<path[^>]+/g));
  });
});
