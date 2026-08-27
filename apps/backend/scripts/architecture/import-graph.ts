import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import type { ImportEdge, SourceProject } from './types.js';

const STATIC_IMPORT_PATTERN = /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_PATTERN = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'] as const;

function importSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  for (const pattern of [STATIC_IMPORT_PATTERN, DYNAMIC_IMPORT_PATTERN]) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

function candidatePaths(basePath: string): string[] {
  const extension = extname(basePath);
  const withoutRuntimeExtension = /\.(?:js|jsx|mjs)$/.test(extension)
    ? basePath.slice(0, -extension.length)
    : basePath;
  const candidates = new Set<string>([basePath]);

  for (const sourceExtension of SOURCE_EXTENSIONS) {
    candidates.add(`${withoutRuntimeExtension}${sourceExtension}`);
    candidates.add(join(basePath, `index${sourceExtension}`));
  }
  return [...candidates];
}

function resolveImport(project: SourceProject, importer: string, specifier: string): string | null {
  let basePath: string;
  if (specifier.startsWith('.')) {
    basePath = resolve(dirname(importer), specifier);
  } else if (project.kind === 'web' && specifier.startsWith('@/')) {
    basePath = resolve(project.root, specifier.slice(2));
  } else {
    return null;
  }

  for (const candidate of candidatePaths(basePath)) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return resolve(candidate);
  }
  return null;
}

export function buildImportEdges(project: SourceProject): ImportEdge[] {
  const sourceFiles = new Set(project.files.map((file) => resolve(file)));
  const edges: ImportEdge[] = [];

  for (const importer of sourceFiles) {
    const source = readFileSync(importer, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      const imported = resolveImport(project, importer, specifier);
      if (imported && sourceFiles.has(imported)) edges.push({ importer, imported, specifier });
    }
  }
  return edges;
}

export function findCircularImports(files: readonly string[], edges: readonly ImportEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const file of files) adjacency.set(resolve(file), []);
  for (const edge of edges) adjacency.get(edge.importer)?.push(edge.imported);

  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];
  const cycles = new Map<string, string[]>();

  const visit = (file: string): void => {
    visited.add(file);
    active.add(file);
    stack.push(file);

    for (const dependency of adjacency.get(file) ?? []) {
      if (!visited.has(dependency)) visit(dependency);
      else if (active.has(dependency)) {
        const start = stack.lastIndexOf(dependency);
        const cycle = [...stack.slice(start), dependency];
        const canonicalKey = [...new Set(cycle)].sort().join('|');
        cycles.set(canonicalKey, cycle);
      }
    }

    stack.pop();
    active.delete(file);
  };

  for (const file of adjacency.keys()) if (!visited.has(file)) visit(file);
  return [...cycles.values()];
}
