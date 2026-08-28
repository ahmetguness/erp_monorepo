import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { createPrimaryObjectStorage } from '../src/modules/shared/index.js';

interface MigrationCounters {
  discovered: number;
  copied: number;
  skipped: number;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function inferContentType(filePath: string): string {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    const code = error instanceof Error && 'code' in error ? String(error.code) : null;
    if (code === 'ENOENT') return [];
    throw error;
  });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : Promise.resolve([path]);
  }));
  return nested.flat();
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const root = resolve(process.env.STORAGE_LEGACY_LOCAL_ROOT ?? resolve(process.cwd(), 'uploads'));
  const target = createPrimaryObjectStorage();
  const files = await listFiles(root);
  const counters: MigrationCounters = { discovered: files.length, copied: 0, skipped: 0 };

  for (const filePath of files) {
    const key = relative(root, filePath).replaceAll('\\', '/');
    const body = await readFile(filePath);
    const existing = await target.get(key);
    if (existing && createHash('sha256').update(existing.body).digest('hex') === createHash('sha256').update(body).digest('hex')) {
      counters.skipped += 1;
      continue;
    }
    if (!execute) continue;
    await target.put({ key, body, contentType: inferContentType(filePath) });
    const copied = await target.get(key);
    if (!copied || createHash('sha256').update(copied.body).digest('hex') !== createHash('sha256').update(body).digest('hex')) {
      throw new Error(`Object verification failed: ${key}`);
    }
    counters.copied += 1;
  }

  console.info(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', root, ...counters }));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
