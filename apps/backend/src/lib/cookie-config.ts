export function isSecureCookieEnabled(): boolean {
  const envValue = process.env.COOKIE_SECURE;
  if (envValue !== undefined) return envValue === 'true';

  const appUrl = process.env.APP_URL ?? '';
  const isHttpsAppUrl = appUrl.startsWith('https://');
  return process.env.NODE_ENV === 'production' && isHttpsAppUrl;
}
