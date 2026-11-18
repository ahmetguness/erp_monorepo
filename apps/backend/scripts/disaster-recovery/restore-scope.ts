import { resolve } from "node:path";

export function assertExpectationFile(env: NodeJS.ProcessEnv = process.env): string {
  const owner = env.DR_OWNER;
  if (!owner || !/^axon-dr-[a-f0-9]{12}$/.test(owner)) throw new Error('An explicit DR owner is required.');
  if (resolve(env.DR_EXPECTATION_FILE ?? '') !== resolve('artifacts', 'disaster-recovery', owner, 'private', 'restore-fixture.json')) throw new Error('Restore expectation file is outside the owned drill.');
  return owner;
}

export function assertRestoreScope(
  input: {
    objectRoot: string;
    output: string;
    objectKey: string;
    orphanKey: string;
    tenantId: string;
  },
  env: NodeJS.ProcessEnv = process.env,
): string {
  const owner = assertExpectationFile(env);
  const root = resolve("artifacts", "disaster-recovery", owner);
  if (
    resolve(env.DR_EXPECTATION_FILE ?? "") !==
      resolve(root, "private", "restore-fixture.json") ||
    resolve(input.objectRoot) !== resolve(root, "private", "objects") ||
    resolve(input.output) !== resolve(root, "restored-erp.json")
  )
    throw new Error("Restore verification paths are outside the owned drill.");
  for (const key of [input.objectKey, input.orphanKey]) {
    if (
      !key.startsWith(input.tenantId + "/") ||
      key.includes("..") ||
      key.includes("\\") ||
      key.includes("//")
    )
      throw new Error("Restore verification object belongs to another tenant.");
  }
  return owner;
}
