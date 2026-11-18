import { appendFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { owner, record, string } from "./validation.js";

export type AuditAction =
  | "backup"
  | "verify"
  | "restore"
  | "expire"
  | "cleanup";
export type AuditStatus = "STARTED" | "PASSED" | "FAILED";

// An external immutable audit sink is required for production. This local hash
// chain detects accidental changes, but cannot defend against its own operator.
export class DrillAudit {
  private tail = Promise.resolve();
  constructor(
    readonly directory: string,
    readonly runOwner: string,
  ) {
    owner(runOwner);
  }
  write(
    action: AuditAction,
    status: AuditStatus,
    target: string,
  ): Promise<void> {
    const next = this.tail.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const path = join(this.directory, "audit.jsonl");
      let contents = "";
      try {
        contents = await readFile(path, "utf8");
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "ENOENT"
        )
          throw error;
      }
      let previous = "0".repeat(64);
      for (const line of contents.split("\n").filter(Boolean)) {
        const row = record(JSON.parse(line));
        const payload = string(row.payload);
        const hash = createHash("sha256")
          .update(previous + payload)
          .digest("hex");
        if (row.previous !== previous || row.hash !== hash)
          throw new Error("DR audit integrity failure.");
        previous = hash;
      }
      // Only fixed operation names and owned resource identities are accepted.
      if (!target.startsWith(this.runOwner) || !/^[a-z0-9-]+$/.test(target))
        throw new Error("Unsafe audit identity.");
      const payload = JSON.stringify({
        at: new Date().toISOString(),
        owner: this.runOwner,
        action,
        status,
        target,
      });
      const hash = createHash("sha256")
        .update(previous + payload)
        .digest("hex");
      await appendFile(
        path,
        JSON.stringify({ previous, payload, hash }) + "\n",
        { mode: 0o600 },
      );
    });
    // A failed audit fails the operation, but must not poison later failure logging.
    this.tail = next.catch(() => undefined);
    return next;
  }
}
