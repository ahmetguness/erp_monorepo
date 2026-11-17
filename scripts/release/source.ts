import { command } from './process.js';

type GitCommand = (args: readonly string[]) => Promise<string>;

export async function validateReleaseSource(sha: string, git: GitCommand = (args) => command('git', args)): Promise<void> {
  if (await git(['rev-parse', 'HEAD']) !== sha) throw new Error('Deployment source must match the release manifest commit.');
  await git(['diff', '--quiet', 'HEAD', '--']);
  if (await git(['ls-files', '--others', '--exclude-standard', '--', 'deploy'])) throw new Error('Deployment definitions must be committed.');
}
