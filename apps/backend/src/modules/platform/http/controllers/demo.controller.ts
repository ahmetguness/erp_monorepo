import type { Context } from "hono";
import { rateLimiter } from "../../../../lib/rateLimiter.js";
import {
  approveDemoRequest,
  createDemoRequest,
  rejectDemoRequest,
} from "../../../../services/demo.service.js";
import { requireParam } from "../../../../utils/context.js";
import { getTrustedClientIp } from "../../../../utils/request-ip.js";
import {
  addDemoRequestNote,
  assignDemoRequest,
  demoNoteSchema,
  demoOwnerSchema,
  demoRejectSchema,
  demoRequestListSchema,
  getDemoRequest,
  listDemoRequests,
  previewDemoProvisioning,
  publicDemoRequestSchema,
} from "../../demo-operations/index.js";

export class DemoController {
  private static readonly RATE_LIMIT = 5;
  private static readonly RATE_WINDOW = 15 * 60 * 1000;

  static async create(c: Context) {
    const ip = getTrustedClientIp(c);
    if (
      await rateLimiter.check(
        `demo:${ip}`,
        DemoController.RATE_LIMIT,
        DemoController.RATE_WINDOW,
      )
    ) {
      return c.json(
        {
          success: false,
          code: "RATE_LIMITED",
          message: "Çok fazla talep gönderdiniz. Lütfen 15 dakika sonra tekrar deneyin.",
        },
        429,
      );
    }
    const body = publicDemoRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success)
      return c.json(
        { error: body.error.issues[0]?.message ?? "Geçersiz demo talebi." },
        400,
      );

    const result = await createDemoRequest(body.data);
    if (!result.success && "code" in result) return c.json(result, 409);
    return c.json(result, result.success ? 201 : 500);
  }

  static async list(c: Context) {
    const parsed = demoRequestListSchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: "Geçersiz liste filtresi." }, 400);
    return c.json(await listDemoRequests(parsed.data));
  }

  static async getById(c: Context) {
    const request = await getDemoRequest(requireParam(c, "id"));
    if (!request) return c.json({ error: "Demo talebi bulunamadı." }, 404);
    return c.json({ data: request });
  }

  static async preview(c: Context) {
    return c.json({ data: await previewDemoProvisioning(requireParam(c, "id")) });
  }

  static async approve(c: Context) {
    const result = await approveDemoRequest(requireParam(c, "id"), c.get("adminId"));
    return c.json(result, result.success ? 200 : 400);
  }

  static async reject(c: Context) {
    const body = demoRejectSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success)
      return c.json({ error: "En az 10 karakter red nedeni zorunludur." }, 400);
    const result = await rejectDemoRequest(
      requireParam(c, "id"),
      c.get("adminId"),
      body.data.reason,
    );
    return c.json(result, result.success ? 200 : 400);
  }

  static async assign(c: Context) {
    const body = demoOwnerSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Geçerli sahip zorunludur." }, 400);
    await assignDemoRequest(
      requireParam(c, "id"),
      body.data.ownerId,
      c.get("adminId"),
    );
    return c.json({ success: true });
  }

  static async addNote(c: Context) {
    const body = demoNoteSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Not en az 2 karakter olmalıdır." }, 400);
    await addDemoRequestNote(requireParam(c, "id"), body.data.note, c.get("adminId"));
    return c.json({ success: true });
  }
}
