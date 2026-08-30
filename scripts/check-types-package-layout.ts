import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

interface PackageManifest {
  dependencies?: Record<string, string>;
  files?: unknown;
  exports?: unknown;
}

const packageRoot = resolve(process.cwd());
const sourceRoot = join(packageRoot, 'src');
const distRoot = join(packageRoot, 'dist');
const monorepoRoot = resolve(packageRoot, '..', '..');
const generatedExtensions = new Set(['.js', '.mjs', '.cjs', '.map']);

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function fail(message: string): never {
  throw new Error(`[types-package-layout] ${message}`);
}

if (!existsSync(sourceRoot)) fail('src directory is missing.');
if (!existsSync(distRoot)) fail('dist directory is missing; run the package build first.');

for (const file of walk(sourceRoot)) {
  const relativePath = relative(packageRoot, file).replaceAll('\\', '/');
  if (generatedExtensions.has(extname(file)) || file.endsWith('.d.ts')) {
    fail(`generated artifact found in source tree: ${relativePath}`);
  }
  if (extname(file) !== '.ts') fail(`unsupported source file found: ${relativePath}`);
}

const rootArtifacts = readdirSync(packageRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => generatedExtensions.has(extname(name)) || name.endsWith('.d.ts'));
if (rootArtifacts.length > 0) fail(`generated artifacts found in package root: ${rootArtifacts.join(', ')}`);

const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as PackageManifest;
if (!Array.isArray(manifest.files) || manifest.files.length !== 1 || manifest.files[0] !== 'dist') {
  fail('package.json files must publish only dist.');
}
if (typeof manifest.exports !== 'object' || manifest.exports === null) fail('package exports map is missing.');

for (const consumer of ['apps/backend', 'apps/web']) {
  const consumerManifestPath = join(monorepoRoot, consumer, 'package.json');
  const consumerManifest = JSON.parse(readFileSync(consumerManifestPath, 'utf8')) as PackageManifest;
  if (consumerManifest.dependencies?.['@repo/types'] !== '*') {
    fail(`${consumer} must resolve @repo/types through the npm workspace, without a file dependency.`);
  }
}
if (!existsSync(join(monorepoRoot, 'package-lock.json'))) fail('root package-lock.json is missing.');
if (existsSync(join(monorepoRoot, 'apps/web/package-lock.json'))) {
  fail('apps/web/package-lock.json must not exist; the monorepo uses the root lockfile.');
}

for (const requiredOutput of [
  'dist/esm/index.js',
  'dist/esm/index.d.ts',
  'dist/cjs/index.js',
  'dist/cjs/index.d.ts',
  'dist/esm/contracts/index.js',
  'dist/cjs/contracts/index.js',
]) {
  if (!existsSync(join(packageRoot, requiredOutput))) fail(`required build output is missing: ${requiredOutput}`);
}

console.log('Types package source/output layout: OK');
