import { createServer } from 'node:https';
import { readFileSync } from 'node:fs';
// Isolated drill fixture only. Never mounted in an application image.
const objects = new Map<string, Buffer>();
createServer({ key: readFileSync('/qa.key'), cert: readFileSync('/qa.crt') }, async (request, response) => {
  try {
    const fault = readFileSync('/control/provider-fault', 'utf8').trim();
    if (fault === 'timeout') {
      request.resume();
      const timer = setTimeout(() => {
        if (!response.destroyed) {
          response.writeHead(504);
          response.end();
        }
      }, 30000);
      response.on('close', () => clearTimeout(timer));
      return;
    }
    if (fault === '429' || fault === '500') {
      request.resume();
      response.writeHead(Number(fault));
      response.end();
      return;
    }
    if (fault !== 'healthy')
      throw new Error('Unknown fixture fault');
    const path = new URL(request.url ?? '/', 'https://fixture').pathname;
    if (path === '/scan') {
      request.resume();
      response.setHeader('content-type', 'application/json');
      response.end('{"clean":true}');
      return;
    }
    const signed = request.headers.authorization?.startsWith('AWS4-HMAC-SHA256 ') || request.url?.includes('X-Amz-Signature=');
    if (!signed || !path.startsWith('/axon-perf')) {
      request.resume();
      response.writeHead(403);
      response.end();
      return;
    }
    if (request.method === 'HEAD') {
      response.writeHead(200);
      response.end();
      return;
    }
    if (request.method === 'PUT') {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const value of request) {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
        bytes += chunk.length;
        if (bytes > 1024 * 1024)
          throw new Error('Fixture upload limit');
        chunks.push(chunk);
      }
      objects.set(path, Buffer.concat(chunks));
      response.writeHead(200);
      response.end();
      return;
    }
    if (request.method === 'DELETE') {
      objects.delete(path);
      response.writeHead(204);
      response.end();
      return;
    }
    const object = objects.get(path);
    if (!object) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.setHeader('content-type', 'text/plain');
    response.end(object);
  }
  catch {
    if (!response.headersSent)
      response.writeHead(500);
    response.end();
  }
}).listen(9000, '0.0.0.0');
