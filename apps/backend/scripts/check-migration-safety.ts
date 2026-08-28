import { readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const destructivePatterns: readonly RegExp[] = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\s+COLUMN\b[^;]*\bSET\s+NOT\s+NULL\b/i,
  /\bALTER\s+COLUMN\b[^;]*\bSET\s+DATA\s+TYPE\b/i,
];

async function main(): Promise<void> {
  const pathArgument = process.argv.find((argument) => argument.endsWith('.sql'));
  if (!pathArgument) throw new Error('Usage: npm run db:migrate:review -- prisma/schema/migrations/<id>/migration.sql');
  const path = resolve(process.cwd(), pathArgument);
  const migrationsDirectory = resolve(process.cwd(), 'prisma', 'schema', 'migrations');
  const relativePath = relative(migrationsDirectory, path);
  if (relativePath.startsWith(`..${sep}`) || relativePath === '..' || !relativePath.endsWith(`${sep}migration.sql`)) {
    throw new Error('Only prisma/schema/migrations/<id>/migration.sql files can be reviewed.');
  }
  const source = await readFile(path, 'utf8');
  const hazards = source.split(';').map((statement) => statement.trim()).filter((statement) =>
    destructivePatterns.some((pattern) => pattern.test(statement)) && !statement.includes('migration-safety-reviewed'),
  );
  if (hazards.length > 0) {
    throw new Error(`Migration has ${hazards.length} destructive statement(s). Review lock/backfill/rollback impact and add "-- migration-safety-reviewed: <reason>" immediately before each reviewed statement.`);
  }
  console.info('Migration safety review: OK.');
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
