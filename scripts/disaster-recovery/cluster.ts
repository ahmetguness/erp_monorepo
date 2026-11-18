import { randomBytes } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { docker, run } from "./process.js";
import { owner, record, string, targetName } from "./validation.js";
import { DrillAudit } from "./audit.js";

export const DR_IMAGE = "axon-postgres-dr:phase9";
export const LABEL = "com.axon.dr";
export class DrillCluster {
  readonly source: string;
  readonly repository: string;
  readonly network: string;
  readonly directory: string;
  readonly keyFile: string;
  readonly audit: DrillAudit;
  constructor(readonly id: string) {
    owner(id);
    this.source = `${id}-source`;
    this.repository = `${id}-repository`;
    this.network = `${id}-network`;
    this.directory = resolve("artifacts", "disaster-recovery", id);
    this.keyFile = resolve(this.directory, "private", "cipher");
    this.audit = new DrillAudit(this.directory, id);
  }
  static fresh(): DrillCluster {
    return new DrillCluster(`axon-dr-${randomBytes(6).toString("hex")}`);
  }
  async assertOwned(
    kind: "container" | "volume" | "network",
    name: string,
  ): Promise<void> {
    if (!name.startsWith(`${this.id}-`) || !/^[a-z0-9-]+$/.test(name))
      throw new Error("DR resource name is outside ownership scope.");
    const template =
      kind === "container" ? "{{json .Config.Labels}}" : "{{json .Labels}}";
    const labels = record(
      JSON.parse(await docker([kind, "inspect", "--format", template, name])),
    );
    if (labels[LABEL] !== this.id)
      throw new Error("DR resource ownership label mismatch.");
  }
  async create(): Promise<void> {
    await mkdir(resolve(this.directory, "private"), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(this.keyFile, randomBytes(48).toString("base64"), {
      mode: 0o600,
      flag: "wx",
    });
    await docker([
      "network",
      "create",
      "--label",
      `${LABEL}=${this.id}`,
      this.network,
    ]);
    await docker([
      "volume",
      "create",
      "--label",
      `${LABEL}=${this.id}`,
      this.repository,
    ]);
    await this.createDatabase(this.source, false);
    await this.wait(this.source);
    // This marker is outside the application schema and survives physical/PITR
    // restore. Verification scripts must prove this identity before any write.
    await this.sql(
      this.source,
      `CREATE SCHEMA axon_dr; CREATE TABLE axon_dr.identity (owner text PRIMARY KEY); INSERT INTO axon_dr.identity VALUES ('${this.id}')`,
    );
  }
  async createDatabase(
    name: string,
    restore: boolean,
    repository = this.repository,
    keyFile = this.keyFile,
  ): Promise<void> {
    if (restore) targetName(this.id, name);
    else if (name !== this.source) throw new Error("Invalid source identity.");
    await this.assertOwned("volume", repository);
    if (
      keyFile !== this.keyFile &&
      keyFile !== resolve(this.directory, "private", "key-escrow")
    )
      throw new Error("Unowned recovery key path.");
    const volume = `${name}-data`;
    await docker([
      "volume",
      "create",
      "--label",
      `${LABEL}=${this.id}`,
      volume,
    ]);
    await this.assertOwned("volume", volume);
    await docker([
      "run",
      "-d",
      "--init",
      "--name",
      name,
      "--label",
      `${LABEL}=${this.id}`,
      "--label",
      `com.axon.dr.role=${restore ? "restore" : "source"}`,
      "--network",
      this.network,
      "--memory",
      "1g",
      "--cpus",
      "2",
      "--publish",
      "127.0.0.1::5432",
      "--mount",
      `type=volume,source=${volume},target=/var/lib/postgresql/data`,
      "--mount",
      `type=volume,source=${repository},target=/var/lib/pgbackrest${restore ? ",readonly" : ""}`,
      "--mount",
      `type=bind,source=${keyFile},target=/run/secrets/dr_cipher,readonly`,
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "--env",
      "POSTGRES_DB=phase3_dr_ci",
      "--env",
      "POSTGRES_INITDB_ARGS=--data-checksums",
      DR_IMAGE,
      ...(restore
        ? ["sleep", "infinity"]
        : [
            "docker-entrypoint.sh",
            "postgres",
            "-c",
            "wal_level=replica",
            "-c",
            "archive_mode=on",
            "-c",
            "archive_timeout=60s",
            "-c",
            "archive_command=pgbackrest --stanza=erp archive-push %p",
            "-c",
            "track_commit_timestamp=on",
          ]),
    ]);
    // Disposable loopback-only test credentials: never a production deployment.
    if (!restore)
      await docker([
        "exec",
        "-u",
        "root",
        name,
        "chown",
        "postgres:postgres",
        "/var/lib/pgbackrest",
      ]);
  }
  async sql(container: string, sql: string): Promise<string> {
    await this.assertOwned("container", container);
    return docker(
      [
        "exec",
        "-i",
        "-u",
        "postgres",
        container,
        "psql",
        "-XAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-d",
        "phase3_dr_ci",
      ],
      sql,
    );
  }
  async connection(container: string): Promise<string> {
    await this.assertOwned("container", container);
    const ports = record(
      JSON.parse(
        await docker([
          "inspect",
          "--format",
          "{{json .NetworkSettings.Ports}}",
          container,
        ]),
      ),
    );
    const bindings = ports["5432/tcp"];
    if (!Array.isArray(bindings) || bindings.length !== 1)
      throw new Error("Invalid DR port binding.");
    const binding = record(bindings[0]);
    const port = string(binding.HostPort);
    if (
      binding.HostIp !== "127.0.0.1" ||
      !/^\d{1,5}$/.test(port) ||
      +port < 1 ||
      +port > 65535
    )
      throw new Error("Unsafe DR port binding.");
    return `postgresql://postgres@127.0.0.1:${port}/phase3_dr_ci?connection_limit=5&pool_timeout=2`;
  }
  async wait(container: string): Promise<void> {
    await this.assertOwned("container", container);
    for (let attempt = 0; attempt < 120; attempt++) {
      const result = await run("docker", [
        "exec",
        "-u",
        "postgres",
        container,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-d",
        "phase3_dr_ci",
      ]);
      if (result.code === 0) return;
      await pause(500);
    }
    throw new Error("DR database did not become ready.");
  }
  async cleanup(): Promise<void> {
    const failures: unknown[] = [];
    // Discover only this unpredictable owner; inspect each label again before deleting.
    for (const kind of ["container", "volume", "network"] as const) {
      let names: string[];
      try {
        names = (
          await docker([
            kind,
            "ls",
            ...(kind === "container" ? ["-a"] : []),
            "--filter",
            `label=${LABEL}=${this.id}`,
            "--format",
            kind === "container" ? "{{.Names}}" : "{{.Name}}",
          ])
        )
          .split("\n")
          .filter(Boolean);
      } catch (error) {
        failures.push(error);
        continue;
      }
      for (const name of names) {
        try {
          await this.assertOwned(kind, name);
          await docker([
            kind,
            "rm",
            ...(kind === "container" ? ["-f"] : []),
            name,
          ]);
        } catch (error) {
          failures.push(error);
        }
      }
    }
    try {
      await this.audit.write(
        "cleanup",
        failures.length ? "FAILED" : "PASSED",
        this.id,
      );
    } catch (error) {
      failures.push(error);
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        "Owned DR resources could not all be cleaned up.",
      );
  }
  async removeSecrets(): Promise<void> {
    const failures: unknown[] = [];
    for (const leaf of [
      "cipher",
      "key-escrow",
      "wrong-key",
      "restore-fixture.json",
    ]) {
      try {
        await unlink(resolve(this.directory, "private", leaf));
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "ENOENT"
        )
          failures.push(error);
      }
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        "Some ephemeral DR secrets could not be removed.",
      );
  }
}
