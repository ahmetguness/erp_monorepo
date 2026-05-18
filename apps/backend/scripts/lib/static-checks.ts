import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface CheckIssue {
  file: string;
  message: string;
}

export function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

export function toProjectPath(path: string): string {
  return relative(process.cwd(), path).replace(/\\/g, '/');
}

export function walkFiles(root: string, extensions: readonly string[]): string[] {
  if (!existsSync(root)) return [];

  const files: string[] = [];
  const entries = readdirSync(root);

  for (const entry of entries) {
    const path = join(root, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      if (['node_modules', '.next', 'dist', 'build', 'coverage', '.git'].includes(entry)) continue;
      files.push(...walkFiles(path, extensions));
      continue;
    }

    if (stats.isFile() && extensions.some((extension) => path.endsWith(extension))) {
      files.push(path);
    }
  }

  return files;
}

export function normalizePath(path: string): string {
  const withoutDuplicateSlashes = path.replace(/\/+/g, '/');
  if (withoutDuplicateSlashes.length > 1 && withoutDuplicateSlashes.endsWith('/')) {
    return withoutDuplicateSlashes.slice(0, -1);
  }
  return withoutDuplicateSlashes || '/';
}

export function joinRoutePath(base: string, child: string): string {
  if (child === '/') return normalizePath(base);
  return normalizePath(`${base}/${child}`);
}

export function reportIssues(title: string, issues: readonly CheckIssue[]): void {
  if (issues.length === 0) {
    console.log(`${title}: OK`);
    return;
  }

  console.error(`${title}: ${issues.length} issue(s)`);
  for (const issue of issues) {
    console.error(`- ${issue.file}: ${issue.message}`);
  }
  process.exitCode = 1;
}

