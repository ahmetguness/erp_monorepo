import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

interface TableRow {
  table_name: string;
}

interface ModelTable {
  model: string;
  table: string;
}

function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;

  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function extractModelTables(schemaText: string): ModelTable[] {
  const models: ModelTable[] = [];
  const modelRegex = /model\s+(\w+)\s+\{([\s\S]*?)\n\}/g;
  let match: RegExpExecArray | null;

  while ((match = modelRegex.exec(schemaText)) !== null) {
    const model = match[1];
    const body = match[2];
    const mapMatch = body.match(/@@map\("([^"]+)"\)/);
    models.push({ model, table: mapMatch?.[1] ?? model });
  }

  return models;
}

function runPrismaMigrateStatus(): boolean {
  try {
    execSync('npx prisma migrate status --schema prisma/schema.prisma', {
      cwd: process.cwd(),
      stdio: 'pipe',
      encoding: 'utf8',
    });
    console.log('Migration status: OK');
    return true;
  } catch (error) {
    const output = error instanceof Error && 'stdout' in error
      ? String((error as Error & { stdout?: unknown }).stdout ?? '')
      : '';
    const stderr = error instanceof Error && 'stderr' in error
      ? String((error as Error & { stderr?: unknown }).stderr ?? '')
      : '';
    const message = error instanceof Error ? error.message : '';
    console.error('Migration status: NOT CLEAN');
    if (output.trim()) console.error(output.trim());
    if (stderr.trim()) console.error(stderr.trim());
    if (!output.trim() && !stderr.trim() && message.trim()) console.error(message.trim());
    return false;
  }
}

async function main(): Promise<void> {
  loadDotEnv(resolve(process.cwd(), '.env'));

  const schemaPath = resolve(process.cwd(), 'prisma/schema.prisma');
  const schemaText = readFileSync(schemaPath, 'utf8');
  const expectedTables = extractModelTables(schemaText);

  const prisma = new PrismaClient();
  let ok = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('Database connection: OK');

    const existingRows = await prisma.$queryRaw<TableRow[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `;
    const existingTables = new Set(existingRows.map((row) => row.table_name));
    const missingTables = expectedTables.filter((item) => !existingTables.has(item.table));

    if (missingTables.length > 0) {
      ok = false;
      console.error(`Schema tables: ${missingTables.length} missing table(s)`);
      for (const item of missingTables) {
        console.error(`- ${item.model} -> public.${item.table}`);
      }
    } else {
      console.log(`Schema tables: OK (${expectedTables.length} model table(s))`);
    }
  } finally {
    await prisma.$disconnect();
  }

  if (!runPrismaMigrateStatus()) {
    ok = false;
  }

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
