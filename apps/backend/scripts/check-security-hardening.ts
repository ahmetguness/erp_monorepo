import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

import {
  redactSensitiveText,
  redactSensitiveValue,
} from "../src/lib/sensitive-redaction.js";
import { PASSWORD_HASH_COST } from "../src/security/password-hashing.js";

const backendRoot = resolve(process.cwd());
const repoRoot = resolve(backendRoot, "../..");

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const productionSources = filesUnder(resolve(backendRoot, "src")).filter(
  (path) => path.endsWith(".ts"),
);
const sourceText = productionSources
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

for (const match of sourceText.matchAll(
  /bcrypt\.hash(?:Sync)?\([^,]+,\s*(\d+)\s*\)/g,
)) {
  const cost = Number.parseInt(match[1] ?? "0", 10);
  assert.ok(
    cost >= PASSWORD_HASH_COST,
    `bcrypt cost ${cost} is below ${PASSWORD_HASH_COST}`,
  );
}

assert.doesNotMatch(
  sourceText,
  /axonDefaultSCIM123/i,
  "A shared SCIM password is present in production source.",
);
assert.doesNotMatch(
  sourceText,
  /from\s+['"]football-elo['"]|require\(['"]football-elo['"]\)/i,
);

const marketplaceController = read(
  "apps/backend/src/modules/marketplace/http/controllers/marketplace/marketplace-integration.controller.ts",
);
assert.match(
  marketplaceController,
  /apiSecret:\s*body\.apiSecret\s*\?\s*encrypt\(body\.apiSecret\)/,
);
assert.match(
  read("apps/backend/scripts/encrypt-marketplace-credentials.ts"),
  /credential-migration/,
);

const resetController = read(
  "apps/backend/src/modules/identity/http/controllers/set-password.controller.ts",
);
assert.match(resetController, /verifyPasswordResetToken/);
assert.doesNotMatch(
  resetController,
  /where:\s*\{\s*passwordResetToken:\s*token/,
);

const rateLimitMiddleware = read(
  "apps/backend/src/middleware/globalRateLimit.ts",
);
assert.match(rateLimitMiddleware, /rateLimitResponse/);
assert.match(
  read("apps/backend/src/lib/rateLimiter.ts"),
  /REDIS_URL.*production/s,
);

const redactedText = redactSensitiveText(
  "email=user@example.test Authorization: Bearer abc.def.ghi apiSecret=plain-secret",
);
assert.doesNotMatch(
  redactedText,
  /user@example\.test|plain-secret|abc\.def\.ghi/,
);
const redactedObject = redactSensitiveValue({
  password: "plain-password",
  nested: { token: "plain-token" },
});
assert.doesNotMatch(
  JSON.stringify(redactedObject),
  /plain-password|plain-token/,
);

console.log(
  "Security hardening: OK (encryption, password/reset-token, log redaction, rate limit, production dependency scan)",
);
