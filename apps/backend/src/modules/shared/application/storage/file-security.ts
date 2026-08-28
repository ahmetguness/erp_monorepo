import { createHash } from 'node:crypto';
import { ValidationError } from '../../../../errors/index.js';

export type MalwareScanMode = 'disabled' | 'monitor' | 'enforce';

export interface FileSecurityInput {
  body: Buffer;
  fileName: string;
  contentType: string;
}

function beginsWith(body: Buffer, signature: readonly number[]): boolean {
  return signature.every((byte, index) => body[index] === byte);
}

function contentMatchesMime(body: Buffer, contentType: string): boolean {
  if (contentType === 'application/pdf') return body.subarray(0, 5).toString('ascii') === '%PDF-';
  if (contentType === 'image/png') return beginsWith(body, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (contentType === 'image/jpeg') return beginsWith(body, [0xff, 0xd8, 0xff]);
  if (contentType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(body.subarray(0, 6).toString('ascii'));
  if (contentType === 'image/webp') {
    return body.subarray(0, 4).toString('ascii') === 'RIFF'
      && body.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (contentType.includes('officedocument')) return beginsWith(body, [0x50, 0x4b, 0x03, 0x04]);
  if (contentType.startsWith('text/')) return !body.includes(0);
  return true;
}

function scanMode(): MalwareScanMode {
  const value = process.env.MALWARE_SCAN_MODE;
  return value === 'monitor' || value === 'enforce' ? value : 'disabled';
}

async function scanForMalware(input: FileSecurityInput): Promise<void> {
  const mode = scanMode();
  if (mode === 'disabled') return;
  const endpoint = process.env.MALWARE_SCAN_ENDPOINT;
  if (!endpoint) {
    if (mode === 'enforce') throw new ValidationError('Malware tarama servisi yapılandırılmamış.');
    return;
  }
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(input.body)], { type: input.contentType }), input.fileName);
  form.set('sha256', createHash('sha256').update(input.body).digest('hex'));
  const response = await fetch(endpoint, { method: 'POST', body: form });
  if (!response.ok) {
    if (mode === 'enforce') throw new ValidationError(`Malware tarama servisi başarısız: HTTP ${response.status}.`);
    return;
  }
  const result: unknown = await response.json();
  const clean = typeof result === 'object' && result !== null && 'clean' in result && result.clean === true;
  if (!clean) throw new ValidationError('Dosya güvenlik taramasından geçemedi.');
}

export async function enforceFileSecurity(input: FileSecurityInput): Promise<void> {
  if (!contentMatchesMime(input.body, input.contentType)) {
    throw new ValidationError('Dosya içeriği bildirilen MIME tipiyle eşleşmiyor.');
  }
  await scanForMalware(input);
}
