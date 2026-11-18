import { spawn } from "node:child_process";

export interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}
export class OperationFailure extends Error {
  constructor(readonly result: ProcessResult) {
    super(
      "DR process failed; restricted diagnostics are available in the owned artifact directory.",
    );
  }
}

// Captured output is bounded and never included in an exception. In particular,
// database connection strings and repository configuration must not be logged.
export function run(
  executable: string,
  args: readonly string[],
  input?: string,
  env = process.env,
  cwd?: string,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      env,
      cwd,
      windowsHide: true,
      signal: AbortSignal.timeout(30 * 60_000),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = (stdout + chunk.toString("utf8")).slice(-2_000_000);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-200_000);
    });
    child.stdin.on("error", () => {
      /* early process exit is reported through close */
    });
    child.once("error", () => reject(new Error("DR process could not start.")));
    child.once("close", (code) =>
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }),
    );
    child.stdin.end(input);
  });
}

export async function docker(
  args: readonly string[],
  input?: string,
): Promise<string> {
  const result = await run("docker", args, input);
  if (result.code !== 0) throw new OperationFailure(result);
  return result.stdout;
}
