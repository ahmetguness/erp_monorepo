import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

const UNKNOWN_IP = 'unknown';

function splitCsv(value: string | undefined): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
}

function normalizeIp(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  if (trimmed === '::1') return '127.0.0.1';
  return trimmed;
}

function firstForwardedIp(value: string | undefined): string | null {
  return normalizeIp(value?.split(',')[0]);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number.parseInt(part, 10);
    if (octet < 0 || octet > 255) return null;
    result = (result << 8) + octet;
  }

  return result >>> 0;
}

export function isIpv4InCidr(ip: string, cidr: string): boolean {
  const [range, prefixRaw] = cidr.split('/');
  if (!range || !prefixRaw) return false;

  const prefix = Number.parseInt(prefixRaw, 10);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;

  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);
  if (ipInt === null || rangeInt === null) return false;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

function isTrustedProxy(remoteIp: string | null): boolean {
  if (!remoteIp) return false;

  const trustedIps = splitCsv(process.env.TRUSTED_PROXY_IPS).map(normalizeIp).filter((ip): ip is string => ip !== null);
  if (trustedIps.includes(remoteIp)) return true;

  return splitCsv(process.env.TRUSTED_PROXY_CIDRS).some((cidr) => isIpv4InCidr(remoteIp, cidr));
}

export function getRemoteAddress(c: Context): string | null {
  try {
    return normalizeIp(getConnInfo(c).remote.address);
  } catch {
    return null;
  }
}

export function getTrustedClientIp(c: Context): string {
  const remoteIp = getRemoteAddress(c);
  if (isTrustedProxy(remoteIp)) {
    return (
      firstForwardedIp(c.req.header('x-forwarded-for')) ??
      normalizeIp(c.req.header('x-real-ip')) ??
      remoteIp ??
      UNKNOWN_IP
    );
  }

  return remoteIp ?? UNKNOWN_IP;
}

export function getTrustedClientIpOrNull(c: Context): string | null {
  const ip = getTrustedClientIp(c);
  return ip === UNKNOWN_IP ? null : ip;
}
