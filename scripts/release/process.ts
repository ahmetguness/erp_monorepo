import { spawn } from 'node:child_process';

export interface CommandResult { output: string; exitCode: number | null }
export interface CommandOptions {
  captureStderr?: boolean;
  /** Bounded decoded characters; structured consumers must reject truncation. */
  outputLimit?: number;
  failOnTruncation?: boolean;
}

export async function command(executable: string, args: readonly string[], env: NodeJS.ProcessEnv = process.env, options: CommandOptions = {}): Promise<string> {
  const result = await commandResult(executable, args, env, options);
  if (result.exitCode !== 0) throw new Error(`${executable} failed with exit code ${result.exitCode}.`);
  return result.output;
}

export function commandResult(executable: string, args: readonly string[], env: NodeJS.ProcessEnv = process.env, options: CommandOptions = {}): Promise<CommandResult> {
  const limit = options.outputLimit ?? 1_000_000;
  if (!Number.isInteger(limit) || limit < 1 || limit > 4_000_000) return Promise.reject(new Error('Invalid bounded command output limit.'));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], { env, windowsHide: true, signal: AbortSignal.timeout(30 * 60_000), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let truncated = false;
    const append = (chunk: string) => {
      const combined = output + chunk;
      if (combined.length > limit) truncated = true;
      output = combined.slice(-limit);
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', append);
    child.stderr.on('data', (chunk: string) => {
      if (options.captureStderr) append(chunk);
      else process.stderr.write(chunk);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (truncated && options.failOnTruncation) reject(new Error('Command output exceeded its bounded structured-output budget.'));
      else resolve({ output: output.trim(), exitCode: code });
    });
  });
}
