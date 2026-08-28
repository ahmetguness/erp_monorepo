import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const prismaDirectory = resolve(process.cwd(), 'prisma', 'schema');
const declarationPattern = /^(model|enum|type)\s+(\w+)\s*\{/gm;
const MAX_DOMAIN_FILE_LINES = 600;
const MINIMUM_MODEL_COUNT = 102;
const MINIMUM_DECLARATION_COUNT = 166;
const REQUIRED_DOMAIN_FILES = new Set([
  'catalog.prisma',
  'finance.prisma',
  'hr.prisma',
  'identity.prisma',
  'inventory.prisma',
  'marketplace.prisma',
  'platform.prisma',
  'procurement.prisma',
  'production.prisma',
  'reporting.prisma',
  'sales.prisma',
  'service.prisma',
  'workflow.prisma',
]);

interface DeclarationLocation {
  kind: string;
  file: string;
}

async function main(): Promise<void> {
  const mainSchema = await readFile(resolve(prismaDirectory, 'schema.prisma'), 'utf8');
  if (mainSchema.includes('prismaSchemaFolder')) {
    throw new Error('Prisma 6.19 supports schema folders without the deprecated preview flag.');
  }
  if (declarationPattern.test(mainSchema)) {
    throw new Error('Domain models/enums must live under prisma/models, not schema.prisma.');
  }

  const files = (await readdir(prismaDirectory)).filter((file) => file.endsWith('.prisma') && file !== 'schema.prisma').sort();
  const missingDomains = [...REQUIRED_DOMAIN_FILES].filter((file) => !files.includes(file));
  if (missingDomains.length > 0) throw new Error(`Missing Prisma domain files: ${missingDomains.join(', ')}.`);
  const declarations = new Map<string, DeclarationLocation>();
  let modelCount = 0;

  for (const file of files) {
    const source = await readFile(resolve(prismaDirectory, file), 'utf8');
    const lineCount = source.split(/\r?\n/).length;
    if (lineCount > MAX_DOMAIN_FILE_LINES) {
      throw new Error(`${file} has ${lineCount} lines; split it before it becomes another monolith.`);
    }
    for (const match of source.matchAll(declarationPattern)) {
      const kind = match[1] ?? 'declaration';
      const name = match[2] ?? '';
      const previous = declarations.get(name);
      if (previous) throw new Error(`${name} is duplicated in ${previous.file} and ${file}.`);
      declarations.set(name, { kind, file });
      if (kind === 'model') modelCount += 1;
    }
  }

  if (modelCount < MINIMUM_MODEL_COUNT) throw new Error(`Expected at least ${MINIMUM_MODEL_COUNT} Prisma models, found ${modelCount}.`);
  if (declarations.size < MINIMUM_DECLARATION_COUNT) {
    throw new Error(`Expected at least ${MINIMUM_DECLARATION_COUNT} Prisma declarations, found ${declarations.size}.`);
  }
  console.info(`Prisma architecture: OK (${files.length} domains, ${modelCount} models, ${declarations.size} declarations).`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
