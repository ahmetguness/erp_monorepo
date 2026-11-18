import { setTimeout as pause } from "node:timers/promises";
import { DrillCluster, DR_IMAGE, LABEL } from "../cluster.js";
import { docker, run } from "../process.js";

export async function cloneRepository(
  cluster: DrillCluster,
  suffix: "corrupt" | "missing",
): Promise<string> {
  const copy = `${cluster.id}-repo-${suffix}`;
  await cluster.assertOwned("volume", cluster.repository);
  await docker(["volume", "create", "--label", `${LABEL}=${cluster.id}`, copy]);
  await docker([
    "run",
    "--rm",
    "--name",
    `${cluster.id}-helper-copy-${suffix}`,
    "--label",
    `${LABEL}=${cluster.id}`,
    "--entrypoint",
    "sh",
    "--mount",
    `type=volume,source=${cluster.repository},target=/from,readonly`,
    "--mount",
    `type=volume,source=${copy},target=/to`,
    DR_IMAGE,
    "-ec",
    "cp -a /from/. /to/; chown -R postgres:postgres /to",
  ]);
  return copy;
}

export async function interruptBackrest(
  cluster: DrillCluster,
  container: string,
  args: readonly string[],
  checkpoint: string,
): Promise<{ exitCode: number | null; checkpointReached: boolean }> {
  await cluster.assertOwned("container", container);
  // The shell records its PID and replaces itself with the real pgBackRest.
  // No input or environment value is interpolated into shell code.
  const operation = run("docker", [
    "exec",
    "-u",
    "postgres",
    container,
    "sh",
    "-ec",
    'echo $$ > /tmp/dr-operation.pid; exec pgbackrest --stanza=erp "$@"',
    "dr-operation",
    ...args,
  ]);
  let reached = false;
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      const probe = await run("docker", [
        "exec",
        container,
        "sh",
        "-ec",
        checkpoint,
      ]);
      if (probe.code === 0) {
        reached = true;
        break;
      }
      await pause(100);
    }
    if (!reached)
      throw new Error(
        "No real operation checkpoint reached; cannot claim a crash test.",
      );
    await docker([
      "exec",
      container,
      "sh",
      "-ec",
      'kill -KILL "$(cat /tmp/dr-operation.pid)"',
    ]);
  } finally {
    // If the operation missed the checkpoint, still stop only its recorded PID.
    if (!reached)
      await run("docker", [
        "exec",
        container,
        "sh",
        "-ec",
        'test ! -s /tmp/dr-operation.pid || kill -KILL "$(cat /tmp/dr-operation.pid)"',
      ]);
  }
  return { exitCode: (await operation).code, checkpointReached: reached };
}
