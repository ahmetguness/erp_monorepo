import { spawn } from 'node:child_process';

export interface CommandResult { output: string; exitCode: number | null }

export async function command(executable: string, args: readonly string[], env: NodeJS.ProcessEnv = process.env, options: { captureStderr?: boolean } = {}): Promise<string> {
  const result = await commandResult(executable, args, env, options);
  if (result.exitCode !== 0) throw new Error(`${executable} failed with exit code ${result.exitCode}.`);
  return result.output;
}

export function commandResult(executable: string, args: readonly string[], env: NodeJS.ProcessEnv = process.env, options: { captureStderr?: boolean } = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], { env, windowsHide: true, signal: AbortSignal.timeout(30 * 60_000), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output = (output + chunk.toString('utf8')).slice(-1_000_000); });
    child.stderr.on('data', (chunk: Buffer) => {
      if (options.captureStderr) output = (output + chunk.toString('utf8')).slice(-1_000_000);
      else process.stderr.write(chunk);
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ output: output.trim(), exitCode: code }));
  });
}
