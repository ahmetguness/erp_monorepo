import { createServer as httpsServer } from 'node:https';
import { createServer as httpServer } from 'node:http';
import { readFileSync } from 'node:fs';

/** Synthetic network provider only: no claim of AWS compatibility or malware detection. */
const objects = new Map<string, { body: Buffer; contentType: string }>();
const tenants = new Map<string, { uploadedBytes: number; downloadedBytes: number; puts: number; gets: number }>();
let scans = 0;
httpsServer({ key: readFileSync('/qa.key'), cert: readFileSync('/qa.crt') }, async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'https://fixture');
    if (url.pathname === '/scan' && request.method === 'POST') {
      for await (const chunk of request) { if (!Buffer.isBuffer(chunk)) throw new Error('Invalid scan body.'); }
      scans++; response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"clean":true}'); return;
    }
    const signed = request.headers.authorization?.startsWith('AWS4-HMAC-SHA256 ') || url.searchParams.has('X-Amz-Signature');
    if (!signed || !url.pathname.startsWith('/axon-perf')) { response.writeHead(403); response.end(); return; }
    if (request.method === 'HEAD' && url.pathname === '/axon-perf') { response.writeHead(200); response.end(); return; }
    const tenantId = url.pathname.split('/')[2] ?? 'unknown';
    const traffic = tenants.get(tenantId) ?? { uploadedBytes: 0, downloadedBytes: 0, puts: 0, gets: 0 }; tenants.set(tenantId, traffic);
    if (request.method === 'PUT') {
      const chunks: Buffer[] = []; let size = 0;
      for await (const value of request) { const chunk = Buffer.isBuffer(value) ? value : Buffer.from(String(value)); size += chunk.length; if (size > 8 * 1024 * 1024) throw new Error('Synthetic upload size exceeded.'); chunks.push(chunk); }
      objects.set(url.pathname, { body: Buffer.concat(chunks), contentType: request.headers['content-type'] ?? 'application/octet-stream' });
      traffic.uploadedBytes += size; traffic.puts++; response.writeHead(200); response.end(); return;
    }
    if (request.method === 'DELETE') { objects.delete(url.pathname); response.writeHead(204); response.end(); return; }
    const object = objects.get(url.pathname);
    if (!object || request.method !== 'GET') { response.writeHead(404); response.end(); return; }
    traffic.downloadedBytes += object.body.length; traffic.gets++;
    response.writeHead(200, { 'content-type': object.contentType, 'content-length': object.body.length }); response.end(object.body);
  } catch { response.writeHead(500); response.end(); }
}).listen(9000, '0.0.0.0');
httpServer((_request, response) => {
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ objects: objects.size, storedBytes: [...objects.values()].reduce((sum, object) => sum + object.body.length, 0), scans, tenants: Object.fromEntries(tenants) }));
}).listen(9001, '127.0.0.1');
