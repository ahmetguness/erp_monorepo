import type { Context } from "hono";

export function rateLimitResponse(
  c: Context,
  message: string,
  retryAfterSeconds: number,
): Response {
  c.header("Retry-After", String(retryAfterSeconds));
  return c.json(
    {
      error: { code: "RATE_LIMITED", message, details: { retryAfterSeconds } },
    },
    429,
  );
}
