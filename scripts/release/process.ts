import { spawn } from 'node:child_process';

export function command(executable: string, args: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], { env, windowsHide: true, signal: AbortSignal.timeout(30 * 60_000), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output = (output + chunk.toString('utf8')).slice(-1_000_000); });
    child.stderr.on('data', (chunk: Buffer) => { process.stderr.write(chunk); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(`${executable} failed with exit code ${code}.`)));
  });
}
