import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  approval,
  owner,
  targetName,
  assertSuccessfulTests,
} from "../validation.js";
import { parseBackups, validateVerification } from "../operations.js";
import { DrillAudit } from "../audit.js";
import { DrillCluster } from "../cluster.js";
import { finalizeDrill } from "../finalization.js";
import { assertRestoreScope } from "../../../apps/backend/scripts/disaster-recovery/restore-scope.js";

test("restore approvals cannot address production, another owner, source, traversal or a previous target", () => {
  const id = "axon-dr-123456abcdef";
  for (const target of [
    "production",
    `${id}-source`,
    `${id}-restore-../source`,
    "axon-dr-abcdef123456-restore-pitr",
    `${id}-restore-pitr;rm`,
  ]) {
    assert.throws(() => targetName(id, target));
    assert.throws(() => approval(id, target, `RESTORE ${target} FROM ${id}`));
  }
  assert.throws(() => owner("axon-dr-123456abcdef\n"));
  const target = `${id}-restore-safe`;
  assert.throws(() =>
    approval(id, target, `RESTORE ${id}-restore-previous FROM ${id}`),
  );
  approval(id, target, `RESTORE ${target} FROM ${id}`);
});

test("a successful process exit with invalid or absent repository evidence fails closed", () => {
  assert.throws(() =>
    parseBackups(
      JSON.stringify([{ name: "erp", status: { code: 28 }, backup: [] }]),
    ),
  );
  assert.throws(() =>
    parseBackups(
      JSON.stringify([
        { name: "another-cluster", status: { code: 0 }, backup: [] },
      ]),
    ),
  );
  assert.throws(() =>
    parseBackups(
      JSON.stringify([
        {
          name: "erp",
          status: { code: 0 },
          backup: [{ label: "../../source" }],
        },
      ]),
    ),
  );
  const valid =
    "stanza: erp\nstatus: ok\n archiveId: 17-1, total WAL checked: 7, total valid WAL: 7\n missing: 0, checksum invalid: 0, size invalid: 0, other: 0\n backup: 20261118-000000F, status: valid, total files checked: 2, total valid files: 2\n missing: 0, checksum invalid: 0, size invalid: 0, other: 0";
  validateVerification(valid);
  for (const invalid of [
    "",
    valid.replace("missing: 0", "missing: 1"),
    valid.replace("checksum invalid: 0", "checksum invalid: 1"),
    valid.replace("status: valid", "status: invalid"),
    valid.replace("stanza: erp", "stanza: production"),
    valid.replace(
      "total WAL checked: 7, total valid WAL: 7",
      "total WAL checked: 0, total valid WAL: 0",
    ),
    valid.replace("total valid WAL: 7", "total valid WAL: 3"),
    valid.replace("total valid files: 2", "total valid files: 1"),
    valid.replace(
      "total files checked: 2, total valid files: 2",
      "total files checked: 0, total valid files: 0",
    ),
  ])
    assert.throws(() => validateVerification(invalid));
  validateVerification(valid, "20261118-000000F");
  assert.throws(() => validateVerification(valid, "20261118-000001F"));
});

test("backup metadata rejects invalid sizes/timestamps and selects the newest completed set", () => {
  const row = {
    label: "20261118-000000F",
    timestamp: { start: 10, stop: 20 },
    info: { size: 1024 },
  };
  const encode = (rows: unknown[]) =>
    JSON.stringify([{ name: "erp", status: { code: 0 }, backup: rows }]);
  const newer = {
    ...row,
    label: "20261118-000001F",
    timestamp: { start: 30, stop: 40 },
  };
  assert.equal(parseBackups(encode([newer, row])).at(-1)?.label, newer.label);
  for (const invalid of [
    { ...row, info: { size: 0.5 } },
    { ...row, timestamp: { start: -2, stop: -1 } },
  ])
    assert.throws(() => parseBackups(encode([invalid])));
  assert.throws(() => parseBackups(encode([row, row])));
});

test("restore verification rejects foreign paths, tenant keys and missing owner before any write", () => {
  const id = "axon-dr-123456abcdef";
  const root = resolve("artifacts", "disaster-recovery", id);
  const input = {
    tenantId: "tenant-a",
    objectKey: "tenant-a/object.txt",
    orphanKey: "tenant-a/orphan.txt",
    objectRoot: resolve(root, "private", "objects"),
    output: resolve(root, "restored-erp.json"),
  };
  const env = {
    DR_OWNER: id,
    DR_EXPECTATION_FILE: resolve(root, "private", "restore-fixture.json"),
  };
  assert.equal(assertRestoreScope(input, env), id);
  assert.throws(() => assertRestoreScope(input, {}));
  assert.throws(() =>
    assertRestoreScope(input, { ...env, DR_EXPECTATION_FILE: resolve("a.md") }),
  );
  for (const invalid of [
    { ...input, objectRoot: resolve("uploads") },
    { ...input, output: resolve("a.md") },
    { ...input, orphanKey: "tenant-b/file" },
    { ...input, orphanKey: "tenant-a/../other" },
  ])
    assert.throws(() => assertRestoreScope(invalid, env));
});

async function finalizationFixture() {
  const id = `axon-dr-${randomBytes(6).toString("hex")}`;
  const directory = resolve(
    "artifacts",
    "disaster-recovery",
    `${id}-finalization-test`,
  );
  await mkdir(directory, { recursive: true });
  return { id, directory };
}

test("diagnostic failure still cleans resources and secrets and records FAIL", async () => {
  const fixture = await finalizationFixture();
  const calls: string[] = [];
  await assert.rejects(
    finalizeDrill(
      {
        ...fixture,
        cleanup: async () => {
          calls.push("resources");
        },
        removeSecrets: async () => {
          calls.push("secrets");
        },
      },
      { passed: true },
      async () => {
        throw new Error("Injected diagnostics disk failure");
      },
    ),
  );
  assert.deepEqual(calls, ["resources", "secrets"]);
  const report: unknown = JSON.parse(
    await readFile(resolve(fixture.directory, "outcome.json"), "utf8"),
  );
  assert.ok(
    report &&
      typeof report === "object" &&
      "passed" in report &&
      report.passed === false,
  );
});

test("resource cleanup failure cannot retain secrets or publish PASS", async () => {
  const fixture = await finalizationFixture();
  let removedSecrets = false;
  await assert.rejects(
    finalizeDrill(
      {
        ...fixture,
        cleanup: async () => {
          throw new Error("Injected Docker cleanup failure");
        },
        removeSecrets: async () => {
          removedSecrets = true;
        },
      },
      { passed: true },
    ),
  );
  assert.ok(removedSecrets);
  const report: unknown = JSON.parse(
    await readFile(resolve(fixture.directory, "outcome.json"), "utf8"),
  );
  assert.ok(
    report &&
      typeof report === "object" &&
      "finalizationPassed" in report &&
      report.finalizationPassed === false,
  );
});

test("success is published after cleanup; an outcome write failure never skips cleanup", async () => {
  const fixture = await finalizationFixture();
  const file = resolve(fixture.directory, "outcome.json");
  let calls = 0;
  const cleanup = async () => {
    await assert.rejects(readFile(file), { code: "ENOENT" });
    calls++;
  };
  await finalizeDrill(
    { ...fixture, cleanup, removeSecrets: cleanup },
    { passed: true },
  );
  assert.equal(calls, 2);
  const blocked = await finalizationFixture();
  await mkdir(resolve(blocked.directory, "outcome.json"));
  await assert.rejects(
    finalizeDrill(
      {
        ...blocked,
        cleanup: async () => {
          calls++;
        },
        removeSecrets: async () => {
          calls++;
        },
      },
      { passed: true },
    ),
  );
  assert.equal(calls, 4);
});

test("one unreadable secret path does not skip removal of the remaining secret files", async () => {
  const cluster = DrillCluster.fresh();
  await mkdir(cluster.keyFile, { recursive: true }); // a directory makes unlink fail
  const paths = ["key-escrow", "wrong-key", "restore-fixture.json"].map(
    (name) => resolve(cluster.directory, "private", name),
  );
  for (const path of paths)
    await writeFile(path, "synthetic-test-secret", { mode: 0o600 });
  await assert.rejects(cluster.removeSecrets());
  for (const path of paths)
    await assert.rejects(readFile(path), { code: "ENOENT" });
});

test("zero, skipped, incomplete and failed test reports cannot produce a successful drill", () => {
  const valid = {
    success: true,
    numTotalTests: 16,
    numPassedTests: 16,
    numFailedTests: 0,
    numPendingTests: 0,
    numFailedTestSuites: 0,
  };
  assert.equal(assertSuccessfulTests(valid), 16);
  for (const invalid of [
    {},
    { ...valid, numTotalTests: 0, numPassedTests: 0 },
    { ...valid, numPendingTests: 1 },
    { ...valid, numPassedTests: 15 },
    { ...valid, success: false },
    { ...valid, numFailedTestSuites: 1 },
  ])
    assert.throws(() => assertSuccessfulTests(invalid));
});

test("concurrent audit appends preserve the chain and a changed historical event blocks subsequent operations", async () => {
  const id = `axon-dr-${randomBytes(6).toString("hex")}`;
  const directory = resolve(
    "artifacts",
    "disaster-recovery",
    `${id}-audit-test`,
  );
  const audit = new DrillAudit(directory, id);
  await Promise.all(
    Array.from({ length: 10 }, () =>
      audit.write("backup", "STARTED", `${id}-source`),
    ),
  );
  await audit.write("backup", "PASSED", `${id}-source`);
  const file = resolve(directory, "audit.jsonl");
  const original = await readFile(file, "utf8");
  assert.equal(original.trim().split("\n").length, 11);
  await writeFile(file, original.replace("STARTED", "FAILED"));
  await assert.rejects(
    audit.write("restore", "STARTED", `${id}-restore-safe`),
    /integrity/,
  );
});
