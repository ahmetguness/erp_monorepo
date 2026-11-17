import { request } from 'node:https';

export interface HttpsProof { status: number; body: unknown; cookies: readonly string[] }

export function httpsProof(port: number, certificate: string, path: string, body?: unknown): Promise<HttpsProof> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request({
      hostname: '127.0.0.1', port, servername: 'phase7.example.test', ca: certificate, path,
      method: payload ? 'POST' : 'GET', timeout: 6_000,
      headers: { Host: 'phase7.example.test', Origin: 'https://phase7.example.test', ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) },
    }, (response) => {
      let text = '';
      response.on('data', (chunk: Buffer) => { text += chunk.toString('utf8'); });
      response.on('error', reject);
      response.on('end', () => {
        try { resolve({ status: response.statusCode ?? 0, body: text ? JSON.parse(text) as unknown : null, cookies: response.headers['set-cookie'] ?? [] }); }
        catch { reject(new Error('Invalid HTTPS assurance response.')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('HTTPS assurance timed out.')));
    req.end(payload);
  });
}
