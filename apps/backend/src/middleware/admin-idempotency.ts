import { createHash } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { ValidationError } from "../errors/index.js";
import {
  abandonAdminRequest,
  claimAdminRequest,
  completeAdminRequest,
} from "../modules/platform/admin-api-safety/admin-idempotency.service.js";
import {
  adminMutationBodySchema,
  idempotencyKeySchema,
} from "../modules/platform/admin-api-safety/admin-api-safety.schemas.js";

const conflict = (message: string) => ({
  error: { code: "IDEMPOTENCY_CONFLICT", message },
});
export const adminIdempotency: MiddlewareHandler = async (c, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next();
  const parsedKey = idempotencyKeySchema.safeParse(
    c.req.header("idempotency-key"),
  );
  if (!parsedKey.success)
    return c.json(
      new ValidationError("Geçerli Idempotency-Key başlığı zorunludur.", {
        "Idempotency-Key":
          "8-120 karakter; harf, rakam, nokta, alt çizgi, iki nokta veya tire kullanın.",
      }).toJSON(),
      400,
    );
  const adminId = c.get("adminId") as string | undefined;
  if (!adminId) return next();
  const body = await c.req.raw.clone().text();
  if (body && c.req.header("content-type")?.includes("application/json")) {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return c.json(new ValidationError("JSON istek gövdesi geçersiz.").toJSON(), 400);
    }
    if (!adminMutationBodySchema.safeParse(json).success)
      return c.json(new ValidationError("Admin mutasyon gövdesi bir JSON nesnesi olmalıdır.").toJSON(), 400);
  }
  const query = new URL(c.req.url).search;
  const requestHash = createHash("sha256")
    .update(`${c.req.method}\n${c.req.path}${query}\n${body}`)
    .digest("hex");
  const claim = await claimAdminRequest({
    adminId,
    method: c.req.method,
    path: c.req.path,
    key: parsedKey.data,
    requestHash,
  });
  if (claim.kind === "CONFLICT")
    return c.json(
      conflict("Aynı idempotency anahtarı farklı bir istek için kullanılamaz."),
      409,
    );
  if (claim.kind === "PROCESSING")
    return c.json(
      conflict(
        "Bu istek halen işleniyor. Daha sonra aynı anahtarla tekrar deneyin.",
      ),
      409,
    );
  if (claim.kind === "REPLAY")
    return new Response([204, 205, 304].includes(claim.statusCode) ? null : claim.responseBody, {
      status: claim.statusCode,
      headers: {
        "content-type": claim.contentType,
        "idempotency-replayed": "true",
      },
    });
  try {
    await next();
    const responseBody = await c.res.clone().text();
    if (c.res.status >= 500 || responseBody.length > 262_144)
      await abandonAdminRequest(claim.id);
    else
      await completeAdminRequest(claim.id, {
        statusCode: c.res.status,
        contentType:
          c.res.headers.get("content-type") ??
          "application/json; charset=UTF-8",
        responseBody,
      });
  } catch (error: unknown) {
    await abandonAdminRequest(claim.id);
    throw error;
  }
};
