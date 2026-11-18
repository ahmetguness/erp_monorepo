import { docker, OperationFailure } from "./process.js";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { run } from "./process.js";
import { DrillCluster } from "./cluster.js";
import { approval, record, string, targetName } from "./validation.js";

export interface BackupInfo {
  label: string;
  start: number;
  stop: number;
  size: number;
}
export function validateVerification(
  output: string,
  expectedBackup?: string,
): void {
  if (
    !/^stanza: erp\r?\nstatus: ok\b/m.test(output) ||
    !/backup: \d{8}-\d{6}F.*status: valid,/.test(output)
  )
    throw new Error("Repository verification did not prove a valid backup.");
  const counters = [
    ...output.matchAll(
      /missing: (\d+), checksum invalid: (\d+), size invalid: (\d+), other: (\d+)/g,
    ),
  ];
  if (
    counters.length < 2 ||
    counters.some((match) =>
      match.slice(1).some((value) => Number(value) !== 0),
    )
  )
    throw new Error("Repository has missing, corrupt, or unreadable files.");
  if (/status: (?!ok\b|valid\b)/.test(output))
    throw new Error("Repository contains an invalid recovery chain.");
  const archives = [
    ...output.matchAll(
      /archiveId: [0-9]+-[0-9]+, total WAL checked: (\d+), total valid WAL: (\d+)/g,
    ),
  ];
  const backups = [
    ...output.matchAll(
      /backup: (\d{8}-\d{6}F(?:_\d{8}-\d{6}[DI])?), status: valid, total files checked: (\d+), total valid files: (\d+)/g,
    ),
  ];
  const complete = (checked: string | undefined, valid: string | undefined) => {
    const count = Number(checked);
    return Number.isSafeInteger(count) && count > 0 && count === Number(valid);
  };
  if (
    !archives.length ||
    !backups.length ||
    counters.length !== archives.length + backups.length ||
    archives.some((row) => !complete(row[1], row[2])) ||
    backups.some((row) => !complete(row[2], row[3])) ||
    (expectedBackup !== undefined &&
      (backups.length !== 1 || backups[0]?.[1] !== expectedBackup))
  )
    throw new Error(
      "Repository verification is incomplete or belongs to another backup set.",
    );
}
export function parseBackups(json: string): BackupInfo[] {
  const input: unknown = JSON.parse(json);
  if (!Array.isArray(input) || input.length !== 1)
    throw new Error("Expected one repository stanza.");
  const stanza = record(input[0]);
  if (stanza.name !== "erp" || record(stanza.status).code !== 0)
    throw new Error("Repository is not healthy.");
  if (!Array.isArray(stanza.backup))
    throw new Error("Missing repository backups.");
  const backups = stanza.backup.map((value: unknown) => {
    const row = record(value);
    const timestamp = record(row.timestamp);
    const info = record(row.info);
    const label = string(row.label);
    if (!/^\d{8}-\d{6}F(?:_\d{8}-\d{6}[DI])?$/.test(label))
      throw new Error("Invalid backup label.");
    const start = timestamp.start;
    const stop = timestamp.stop;
    const size = info.size;
    if (
      typeof start !== "number" ||
      typeof stop !== "number" ||
      typeof size !== "number" ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(stop) ||
      !Number.isSafeInteger(size) ||
      start < 0 ||
      start > stop ||
      size <= 0
    )
      throw new Error("Invalid backup metadata.");
    return { label, start, stop, size };
  });
  if (new Set(backups.map((row) => row.label)).size !== backups.length)
    throw new Error("Duplicate backup identities.");
  return backups.sort((a, b) => a.stop - b.stop || a.start - b.start);
}

export class RecoveryOperations {
  constructor(readonly cluster: DrillCluster) {}
  async backrest(container: string, args: readonly string[]): Promise<string> {
    await this.cluster.assertOwned("container", container);
    return docker([
      "exec",
      "-u",
      "postgres",
      container,
      "pgbackrest",
      "--stanza=erp",
      ...args,
    ]);
  }
  async backup(): Promise<BackupInfo> {
    await this.cluster.audit.write("backup", "STARTED", this.cluster.source);
    try {
      await this.backrest(this.cluster.source, ["stanza-create"]);
      await this.backrest(this.cluster.source, ["check"]);
      await this.backrest(this.cluster.source, ["--type=full", "backup"]);
      const backups = await this.info();
      const latest = backups.at(-1);
      if (!latest) throw new Error("No completed backup.");
      await this.cluster.audit.write("backup", "PASSED", this.cluster.source);
      return latest;
    } catch (error) {
      await this.recordFailure("backup", this.cluster.source, error);
      await this.cluster.audit.write("backup", "FAILED", this.cluster.source);
      throw error;
    }
  }
  info(): Promise<BackupInfo[]> {
    return this.backrest(this.cluster.source, ["--output=json", "info"]).then(
      parseBackups,
    );
  }
  async verify(): Promise<void> {
    await this.cluster.audit.write("verify", "STARTED", this.cluster.source);
    try {
      // verify checks repository file checksums; check additionally proves WAL shipping.
      validateVerification(
        await this.backrest(this.cluster.source, [
          "--output=text",
          "--verbose",
          "verify",
        ]),
      );
      await this.backrest(this.cluster.source, ["check"]);
      await this.cluster.audit.write("verify", "PASSED", this.cluster.source);
    } catch (error) {
      await this.recordFailure("verify", this.cluster.source, error);
      await this.cluster.audit.write("verify", "FAILED", this.cluster.source);
      throw error;
    }
  }
  async restore(
    target: string,
    approvalText: string,
    options: { backup: string; time?: string },
  ): Promise<void> {
    approval(this.cluster.id, target, approvalText);
    if (!/^\d{8}-\d{6}F$/.test(options.backup))
      throw new Error("A specific full recovery chain is required.");
    if (
      options.time !== undefined &&
      (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(options.time) ||
        !Number.isFinite(Date.parse(options.time)) ||
        new Date(options.time).toISOString() !== options.time)
    )
      throw new Error("Invalid recovery time.");
    await this.cluster.assertOwned("container", target);
    const labels = record(
      JSON.parse(
        await docker([
          "inspect",
          "--format",
          "{{json .Config.Labels}}",
          target,
        ]),
      ),
    );
    if (labels["com.axon.dr.role"] !== "restore")
      throw new Error("Target is not a recovery container.");
    // Never delete, overwrite, or use --delta. Interrupted restores need another
    // fresh target; the failed target remains available for restricted inspection.
    await docker([
      "exec",
      target,
      "sh",
      "-ec",
      'test -z "$(ls -A /var/lib/postgresql/data)"; chown postgres:postgres /var/lib/postgresql/data; chmod 700 /var/lib/postgresql/data',
    ]);
    await this.cluster.audit.write("restore", "STARTED", target);
    try {
      validateVerification(
        await this.backrest(target, [
          "--set=" + options.backup,
          "--output=text",
          "--verbose",
          "verify",
        ]),
        options.backup,
      );
      // PostgreSQL's recovery GUC parser requires a space/UTC offset here; its
      // timestamp input grammar is narrower than JavaScript's ISO date parser.
      const time = options.time?.replace("T", " ").replace("Z", "+00");
      await this.backrest(target, [
        "--set=" + options.backup,
        ...(time
          ? ["--type=time", "--target=" + time, "--target-action=promote"]
          : ["--type=immediate", "--target-action=promote"]),
        "restore",
      ]);
      await docker([
        "exec",
        "-d",
        "-u",
        "postgres",
        target,
        "pg_ctl",
        "-D",
        "/var/lib/postgresql/data",
        "-l",
        "/tmp/recovery.log",
        "-o",
        "-c archive_mode=off -c track_commit_timestamp=on",
        "-w",
        "start",
      ]);
      await this.cluster.wait(target);
      // pg_isready can succeed during the short read-only recovery interval.
      // Wait for promotion, while keeping the readiness window bounded.
      const deadline = performance.now() + 15_000;
      while (
        (await this.cluster.sql(target, "SELECT pg_is_in_recovery()")) !== "f"
      ) {
        if (performance.now() >= deadline)
          throw new Error("Recovery target has not been reached.");
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      await this.cluster.audit.write("restore", "PASSED", target);
    } catch (error) {
      await this.recordFailure("restore", target, error);
      const log = await run("docker", [
        "exec",
        target,
        "cat",
        "/tmp/recovery.log",
      ]);
      await writeFile(
        resolve(this.cluster.directory, `${target}-recovery.log`),
        log.stdout + "\n" + log.stderr,
      );
      await this.cluster.audit.write("restore", "FAILED", target);
      throw error;
    }
  }
  async newTarget(
    suffix: string,
    repository = this.cluster.repository,
    keyFile = this.cluster.keyFile,
  ): Promise<string> {
    const target = targetName(
      this.cluster.id,
      `${this.cluster.id}-restore-${suffix}`,
    );
    await this.cluster.createDatabase(target, true, repository, keyFile);
    return target;
  }
  private async recordFailure(
    action: "backup" | "verify" | "restore",
    target: string,
    error: unknown,
  ): Promise<void> {
    if (error instanceof OperationFailure) {
      // pgBackRest redacts cipher options; these artifacts are synthetic and private.
      await writeFile(
        resolve(this.cluster.directory, `${target}-${action}-failure.log`),
        error.result.stdout + "\n" + error.result.stderr,
        { mode: 0o600 },
      );
    }
  }
}
