import { relative, resolve, sep } from 'node:path';
import type { ArchitectureIssue, ImportEdge } from './types.js';

function segments(root: string, file: string): string[] {
  return relative(root, file).split(sep);
}

function isBackendPublicApi(moduleRoot: string, imported: string): boolean {
  const path = relative(moduleRoot, imported).replace(/\\/g, '/');
  return path === 'index.ts' || /^(?:domain|application|http\/controllers)\/index\.ts$/.test(path);
}

export function checkBackendBoundaries(sourceRoot: string, edges: readonly ImportEdge[]): ArchitectureIssue[] {
  const issues: ArchitectureIssue[] = [];
  const modulesRoot = resolve(sourceRoot, 'modules');

  for (const edge of edges) {
    const importerParts = segments(modulesRoot, edge.importer);
    const importedParts = segments(modulesRoot, edge.imported);
    const importerInModules = !importerParts[0]?.startsWith('..');
    const importedInModules = !importedParts[0]?.startsWith('..');
    if (!importedInModules) continue;

    if (importedParts.length === 1 && importedParts[0] === 'index.ts') continue;

    const importedModule = importedParts[0];
    const importerModule = importerInModules ? importerParts[0] : null;
    if (importedModule && importedModule !== importerModule) {
      const importedModuleRoot = resolve(modulesRoot, importedModule);
      if (!isBackendPublicApi(importedModuleRoot, edge.imported)) {
        issues.push({
          file: edge.importer,
          message: `module internals are private (${edge.specifier}); import ${importedModule} through its public API`,
        });
      }
    }

    if (!importerInModules || importerModule !== importedModule) continue;
    const importerLayer = importerParts[1];
    const importedLayer = importedParts[1];
    if (importerLayer === 'domain' && importedLayer && importedLayer !== 'domain') {
      issues.push({ file: edge.importer, message: `domain layer cannot depend on ${importedLayer}` });
    }
    if (importerLayer === 'application' && (importedLayer === 'http' || importedLayer === 'infrastructure')) {
      issues.push({ file: edge.importer, message: `application layer cannot depend on ${importedLayer}` });
    }
    if (importerLayer === 'infrastructure' && importedLayer === 'http') {
      issues.push({ file: edge.importer, message: 'infrastructure layer cannot depend on HTTP' });
    }
  }
  return issues;
}

export function checkWebBoundaries(sourceRoot: string, edges: readonly ImportEdge[]): ArchitectureIssue[] {
  const issues: ArchitectureIssue[] = [];
  const featuresRoot = resolve(sourceRoot, 'features');
  const domainRoot = resolve(sourceRoot, 'domain');

  for (const edge of edges) {
    const importerFeatureParts = segments(featuresRoot, edge.importer);
    const importedFeatureParts = segments(featuresRoot, edge.imported);
    const importerFeature = importerFeatureParts[0]?.startsWith('..') ? null : importerFeatureParts[0];
    const importedFeature = importedFeatureParts[0]?.startsWith('..') ? null : importedFeatureParts[0];

    if (importedFeature && importedFeature !== importerFeature) {
      const publicApiPath = relative(resolve(featuresRoot, importedFeature), edge.imported).replace(/\\/g, '/');
      if (publicApiPath !== 'index.ts' && publicApiPath !== 'api/index.ts') {
        issues.push({
          file: edge.importer,
          message: `feature internals are private (${edge.specifier}); import ${importedFeature} through its public API`,
        });
      }
    }

    const importerDomainParts = segments(domainRoot, edge.importer);
    const importerInDomain = !importerDomainParts[0]?.startsWith('..');
    if (importerInDomain) {
      const importedRelative = relative(sourceRoot, edge.imported).replace(/\\/g, '/');
      if (/^(?:components|features|hooks|services|store)\//.test(importedRelative)) {
        issues.push({ file: edge.importer, message: `web domain code cannot depend on ${importedRelative}` });
      }
    }
  }
  return issues;
}
