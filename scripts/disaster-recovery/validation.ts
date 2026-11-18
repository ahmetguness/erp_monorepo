export function record(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("Expected a DR object.");
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) result[key] = value;
  return result;
}
export function string(input: unknown): string {
  if (typeof input !== "string" || !input)
    throw new Error("Expected a DR string.");
  return input;
}
export function owner(input: unknown): string {
  const value = string(input);
  if (!/^axon-dr-[a-f0-9]{12}$/.test(value))
    throw new Error("Invalid DR resource owner.");
  return value;
}
export function targetName(runOwner: string, input: unknown): string {
  owner(runOwner);
  const value = string(input);
  if (!new RegExp(`^${runOwner}-restore-[a-z0-9]{1,24}$`).test(value))
    throw new Error("Restore only permits a new owned recovery container.");
  return value;
}
export function approval(
  runOwner: string,
  target: string,
  input: unknown,
): void {
  targetName(runOwner, target);
  if (input !== `RESTORE ${target} FROM ${runOwner}`)
    throw new Error("Explicit target-bound restore approval is required.");
}

export function assertSuccessfulTests(input: unknown): number {
  const report = record(input);
  const total = report.numTotalTests;
  if (
    report.success !== true ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < 1 ||
    report.numPassedTests !== total ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    report.numFailedTestSuites !== 0
  )
    throw new Error("No complete successful test evidence.");
  return total;
}
