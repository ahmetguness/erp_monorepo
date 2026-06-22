import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
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
    { dir: 'apps/backend/src/controllers', suffix: '.controller.ts', label: 'controller' },
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
    ...reportLargeFiles(sourceFiles),
    ...checkGeneratedOrCacheChurn(),
  ];

  reportIssues('Code quality and type safety checks', issues);
}

main();
