import { createPublicKey, createSecretKey, type KeyObject } from "node:crypto";

/** Match jsonwebtoken's key interpretation once per configured signing key. */
export function createJwtVerificationKey(material: string): KeyObject {
  try {
    return createPublicKey(material);
  } catch {
    return createSecretKey(Buffer.from(material));
  }
}
