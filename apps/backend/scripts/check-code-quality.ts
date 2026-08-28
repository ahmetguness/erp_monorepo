import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { reportIssues, type CheckIssue } from './lib/static-checks.js';
import { TYPE_SAFETY_BYPASS_ALLOWLIST } from './code-quality-allowlist.js';

const repoRoot = resolve(__dirname, '../../..');

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'] as const;
const SKIPPED_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', '.git']);
const QUALITY_SCRIPT_FILES = new Set([
  'apps/backend/scripts/check-code-quality.ts',
  'apps/backend/scripts/code-quality-allowlist.ts',
]);
const GENERATED_OR_CACHE_SEGMENTS = ['node_modules', '.next', 'dist', 'build', 'coverage', '.git'] as const;

const TYPE_SAFETY_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'explicit any annotation', pattern: /[:(<,=]\s*any\b/ },
  { label: 'as any assertion', pattern: /\bas\s+any\b/ },
  { label: 'unknown as assertion', pattern: /\bunknown\s+as\b/ },
  { label: 'ts-ignore suppression', pattern: /@ts-ignore\b/ },
  { label: 'ts-expect-error suppression', pattern: /@ts-expect-error\b/ },
];

const LARGE_FILE_WARNING_LINES = 700;
const LARGE_FILE_HARD_LIMIT_LINES = 2_000;

function toRepoPath(path: string): string {
  return relative(repoRoot, path).replace(/\\/g, '/');
}

function walkSourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry)) files.push(...walkSourceFiles(path));
      continue;
    }

    if (stats.isFile() && SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))) {
      files.push(path);
    }
  }
  return files;
}

function isAllowlisted(repoPath: string, line: string): boolean {
  return TYPE_SAFETY_BYPASS_ALLOWLIST.some(
    (entry) => entry.status === 'active' && entry.file === repoPath && line.includes(entry.snippet),
  );
}

function checkTypeSafety(files: readonly string[]): CheckIssue[] {
  const issues: CheckIssue[] = [];

  for (const file of files) {
    const repoPath = toRepoPath(file);
    if (QUALITY_SCRIPT_FILES.has(repoPath)) continue;

    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const check of TYPE_SAFETY_PATTERNS) {
        if (check.pattern.test(line) && !isAllowlisted(repoPath, line)) {
          issues.push({
            file: `${repoPath}:${index + 1}`,
            message: `${check.label} is not allowed; use unknown plus a type guard/Zod or add a documented active allowlist entry`,
          });
        }
      }
    });
  }

  return issues;
}

function checkActiveAllowlistEntries(files: readonly string[]): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const sourceByPath = new Map(files.map((file) => [toRepoPath(file), readFileSync(file, 'utf8')]));

  for (const entry of TYPE_SAFETY_BYPASS_ALLOWLIST) {
    if (entry.status !== 'active') continue;
    const text = sourceByPath.get(entry.file);
    if (!text?.includes(entry.snippet)) {
      issues.push({
        file: 'apps/backend/scripts/code-quality-allowlist.ts',
        message: `active type-safety bypass allowlist entry is stale: ${entry.file}`,
      });
    }
  }

  return issues;
}

function checkBackendNaming(): CheckIssue[] {
  const checks: ReadonlyArray<{ dir: string; suffix: string; label: string }> = [
    { dir: 'apps/backend/src/routes', suffix: '.routes.ts', label: 'route' },
    { dir: 'apps/backend/src/services', suffix: '.service.ts', label: 'service' },
  ];
  const issues: CheckIssue[] = [];

  for (const check of checks) {
    const absoluteDir = join(repoRoot, check.dir);
    if (!existsSync(absoluteDir)) continue;
    for (const entry of readdirSync(absoluteDir)) {
      const path = join(absoluteDir, entry);
      if (statSync(path).isFile() && entry.endsWith('.ts') && !entry.endsWith(check.suffix)) {
        issues.push({
          file: `${check.dir}/${entry}`,
          message: `${check.label} files must use ${check.suffix}`,
        });
      }
    }
  }

  return issues;
}

function checkAuthorizationQueryCentralization(): CheckIssue[] {
  const middlewareFiles = [
    'requirePermission.ts',
    'requireAccess.ts',
    'requireFeature.ts',
    'requireModule.ts',
    'requirePlan.ts',
  ];
  const issues: CheckIssue[] = [];
  for (const fileName of middlewareFiles) {
    const repoPath = `apps/backend/src/middleware/${fileName}`;
    const source = readFileSync(join(repoRoot, repoPath), 'utf8');
    if (/lib\/prisma|TenantFeatureService|\.tenant(?:User|Setting)?\.(?:find|count|aggregate)/.test(source)) {
      issues.push({
        file: repoPath,
        message: 'authorization gates must consume the request-scoped AccessContext instead of querying persistence',
      });
    }
    if (!source.includes('getAccessContext')) {
      issues.push({ file: repoPath, message: 'authorization gate must consume the centralized request-scoped AccessContext' });
    }
  }
  return issues;
}

function checkWorkerDurability(): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const schema = readFileSync(join(repoRoot, 'apps/backend/prisma/schema.prisma'), 'utf8');
  const outboxWorker = readFileSync(join(repoRoot, 'apps/backend/src/services/domain-event-outbox-worker.service.ts'), 'utf8');
  const marketplaceWorker = readFileSync(join(repoRoot, 'apps/backend/src/services/trendyol-worker.service.ts'), 'utf8');
  for (const required of ['leaseOwner', 'leaseExpiresAt', '@@index([status, nextRetryAt, createdAt])', '@@index([status, leaseExpiresAt])']) {
    if (!schema.includes(required)) issues.push({ file: 'apps/backend/prisma/schema.prisma', message: `durable workers require ${required}` });
  }
  for (const [file, source] of [
    ['apps/backend/src/services/domain-event-outbox-worker.service.ts', outboxWorker],
    ['apps/backend/src/services/trendyol-worker.service.ts', marketplaceWorker],
  ] as const) {
    if (!source.includes('FOR UPDATE SKIP LOCKED')) issues.push({ file, message: 'multi-instance workers require an atomic SKIP LOCKED claim' });
    if (/setInterval\s*\(/.test(source)) issues.push({ file, message: 'worker services must use the shared non-overlapping WorkerLoop' });
  }
  return issues;
}

function checkModuleBoundaries(): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const backendSource = join(repoRoot, 'apps/backend/src');
  const bootstrapPath = join(backendSource, 'index.ts');
  const bootstrapSource = readFileSync(bootstrapPath, 'utf8');
  const httpRoutesPath = join(backendSource, 'bootstrap/http/routes.ts');
  const httpRoutesSource = readFileSync(httpRoutesPath, 'utf8');

  if (/\b(app|tenantApi)\.(use|get|post|put|patch|delete|route|onError|notFound)\b|\bserve\s*\(/.test(bootstrapSource)) {
    issues.push({
      file: 'apps/backend/src/index.ts',
      message: 'composition root must delegate HTTP composition and process startup to bootstrap/entrypoint modules',
    });
  }

  const orderedHttpComposition = [
    'registerProgrammaticHttpSurface(app)',
    'registerBrowserProtection(app)',
    'registerPublicHttpSurface(app)',
    'registerAdminHttpSurface(app)',
  ];
  const compositionPositions = orderedHttpComposition.map((call) => httpRoutesSource.indexOf(call));
  if (compositionPositions.some((position) => position < 0)
    || compositionPositions.some((position, index) => index > 0 && position <= compositionPositions[index - 1])) {
    issues.push({
      file: 'apps/backend/src/bootstrap/http/routes.ts',
      message: 'HTTP surface order must remain programmatic -> browser protection -> public -> admin',
    });
  }

  for (const legacyDirectory of ['controllers', join('services', 'controllers')]) {
    if (existsSync(join(backendSource, legacyDirectory))) {
      issues.push({
        file: `apps/backend/src/${legacyDirectory.replace(/\\/g, '/')}`,
        message: 'legacy controller directory is forbidden; controllers belong to modules/<domain>/http/controllers',
      });
    }
  }

  const routesRoot = join(backendSource, 'routes');
  for (const routeFile of walkSourceFiles(routesRoot)) {
    const source = readFileSync(routeFile, 'utf8');
    const controllerImportRegex = /import\s+\{[^}]*Controller[^}]*\}\s+from\s+['"]([^'"]+)['"]/g;
    for (const match of source.matchAll(controllerImportRegex)) {
      if (!/modules\/[^/]+\/http\/controllers\/index\.js$/.test(match[1])) {
        issues.push({
          file: toRepoPath(routeFile),
          message: `routes must import controllers through a domain public API, received ${match[1]}`,
        });
      }
    }
  }

  if (/from\s+['"]\.\/(routes|controllers)\//.test(bootstrapSource)) {
    issues.push({
      file: 'apps/backend/src/index.ts',
      message: 'bootstrap must depend on module public APIs, not route/controller implementations',
    });
  }

  const modulesRoot = join(backendSource, 'modules');
  for (const moduleName of readdirSync(modulesRoot)) {
    const modulePath = join(modulesRoot, moduleName);
    if (!statSync(modulePath).isDirectory() || moduleName === 'shared') continue;

    for (const file of walkSourceFiles(modulePath)) {
      const source = readFileSync(file, 'utf8');
      const importRegex = /from\s+['"]([^'"]+)['"]/g;
      for (const match of source.matchAll(importRegex)) {
        const importPath = match[1];
        if (!importPath?.startsWith('.')) continue;

        const resolvedImport = resolve(dirname(file), importPath);
        const moduleRelativePath = relative(modulesRoot, resolvedImport).replace(/\\/g, '/');
        const importedModuleName = moduleRelativePath.split('/')[0];
        const crossesModuleBoundary =
          importedModuleName &&
          importedModuleName !== '..' &&
          importedModuleName !== 'shared' &&
          importedModuleName !== moduleName;
        const usesPublicApi = importPath.endsWith('/index.js');

        if (!crossesModuleBoundary || usesPublicApi) continue;
        issues.push({
          file: toRepoPath(file),
          message: `module may not import another module's internals (${importedModuleName}); use its public API`,
        });
      }
    }
  }

  for (const file of walkSourceFiles(modulesRoot).filter((path) => path.includes(`${sep}application${sep}`))) {
    const source = readFileSync(file, 'utf8');
    if (/from\s+['"]@prisma\/client['"]|from\s+['"][^'"]*(?:lib\/prisma|infrastructure|\/http\/)[^'"]*['"]/.test(source)) {
      issues.push({
        file: toRepoPath(file),
        message: 'application layer must depend on ports/domain types, not Prisma, infrastructure, or HTTP details',
      });
    }
  }

  const webFeatureBoundaries = [
    ['apps/web/src/hooks/useAccounting.ts', '@/features/finance/api'],
    ['apps/web/src/hooks/useStock.ts', '@/features/inventory/api'],
    ['apps/web/src/hooks/useSales.ts', '@/features/sales/api'],
    ['apps/web/src/hooks/useHR.ts', '@/features/workforce/api'],
  ] as const;
  for (const [relativePath, requiredImport] of webFeatureBoundaries) {
    const source = readFileSync(join(repoRoot, relativePath), 'utf8');
    if (!source.includes(requiredImport) || /from\s+['"]@\/services\//.test(source)) {
      issues.push({
        file: relativePath,
        message: `critical-domain hooks must use the ${requiredImport} feature gateway`,
      });
    }
  }

  return issues;
}

function reportLargeFiles(files: readonly string[]): CheckIssue[] {
  const largeFiles = files
    .map((file) => ({ file: toRepoPath(file), lines: readFileSync(file, 'utf8').split(/\r?\n/).length }))
    .filter((entry) => entry.lines >= LARGE_FILE_WARNING_LINES)
    .sort((left, right) => right.lines - left.lines);

  if (largeFiles.length > 0) {
    console.log(`Large file report (${largeFiles.length} files >= ${LARGE_FILE_WARNING_LINES} lines):`);
    for (const entry of largeFiles.slice(0, 20)) {
      console.log(`- ${entry.file}: ${entry.lines} lines`);
    }
  } else {
    console.log(`Large file report: OK (no files >= ${LARGE_FILE_WARNING_LINES} lines)`);
  }

  return largeFiles
    .filter((entry) => entry.lines > LARGE_FILE_HARD_LIMIT_LINES)
    .map((entry) => ({
      file: entry.file,
      message: `file has ${entry.lines} lines; split before exceeding the ${LARGE_FILE_HARD_LIMIT_LINES} line hard limit`,
    }));
}

function listChangedFiles(): string[] {
  try {
    const output = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMRT', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split(/\r?\n/).filter(Boolean).map((path) => path.replace(/\\/g, '/'));
  } catch {
    return [];
  }
}

function checkGeneratedOrCacheChurn(): CheckIssue[] {
  return listChangedFiles()
    .filter((file) => GENERATED_OR_CACHE_SEGMENTS.some((segment) => file.split('/').includes(segment)))
    .map((file) => ({
      file,
      message: 'generated/cache directory changes are not allowed in normal quality gates',
    }));
}

function main(): void {
  const sourceFiles = walkSourceFiles(repoRoot);
  const issues = [
    ...checkTypeSafety(sourceFiles),
    ...checkActiveAllowlistEntries(sourceFiles),
    ...checkBackendNaming(),
    ...checkAuthorizationQueryCentralization(),
    ...checkWorkerDurability(),
    ...checkModuleBoundaries(),
    ...reportLargeFiles(sourceFiles),
    ...checkGeneratedOrCacheChurn(),
  ];

  reportIssues('Code quality and type safety checks', issues);
}

main();
