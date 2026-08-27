import { resolve, relative } from 'node:path';
import { walkFiles, reportIssues, type CheckIssue } from './lib/static-checks.js';
import { buildImportEdges, findCircularImports } from './architecture/import-graph.js';
import { checkBackendBoundaries, checkWebBoundaries } from './architecture/boundary-rules.js';
import type { ArchitectureIssue, SourceProject } from './architecture/types.js';

const repoRoot = resolve(__dirname, '../../..');
const extensions = ['.ts', '.tsx', '.mts'] as const;

function project(kind: SourceProject['kind'], root: string): SourceProject {
  return { kind, root, files: walkFiles(root, extensions) };
}

function displayPath(path: string): string {
  return relative(repoRoot, path).replace(/\\/g, '/');
}

function asCheckIssue(issue: ArchitectureIssue): CheckIssue {
  return { file: displayPath(issue.file), message: issue.message };
}

function main(): void {
  const backend = project('backend', resolve(repoRoot, 'apps/backend/src'));
  const web = project('web', resolve(repoRoot, 'apps/web/src'));
  const backendEdges = buildImportEdges(backend);
  const webEdges = buildImportEdges(web);
  const issues: CheckIssue[] = [
    ...checkBackendBoundaries(backend.root, backendEdges).map(asCheckIssue),
    ...checkWebBoundaries(web.root, webEdges).map(asCheckIssue),
  ];

  for (const sourceProject of [backend, web]) {
    const edges = sourceProject.kind === 'backend' ? backendEdges : webEdges;
    for (const cycle of findCircularImports(sourceProject.files, edges)) {
      issues.push({
        file: displayPath(cycle[0] ?? sourceProject.root),
        message: `circular ${sourceProject.kind} import: ${cycle.map(displayPath).join(' -> ')}`,
      });
    }
  }

  reportIssues(
    `Module boundaries (${backendEdges.length} backend edges, ${webEdges.length} web edges)`,
    issues,
  );
}

main();
