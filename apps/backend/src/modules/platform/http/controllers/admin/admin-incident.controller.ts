import type { Context } from "hono";
import { ValidationError } from "../../../../../errors/index.js";
import { addTimelineEntry, createIncident, decideCommunication, listIncidents, requestCommunication, updateIncident } from "../../../incident-management/incident-management.service.js";
import { communicationDecisionSchema, communicationSchema, createIncidentSchema, timelineEntrySchema, updateIncidentSchema } from "../../../incident-management/incident-management.schemas.js";

const invalid = (c: Context, message: string) => c.json(new ValidationError(message).toJSON(), 400);
const parseId = (c: Context, name = "id"): string => c.req.param(name) ?? "";

export const AdminIncidentController = {
  async list(c: Context): Promise<Response> { return c.json({ data: await listIncidents() }); },
  async create(c: Context): Promise<Response> {
    const parsed = createIncidentSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message ?? "Geçersiz olay kaydı.");
    return c.json({ data: await createIncident(parsed.data, c.get("adminId")) }, 201);
  },
  async update(c: Context): Promise<Response> {
    const parsed = updateIncidentSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message ?? "Geçersiz olay güncellemesi.");
    return c.json({ data: await updateIncident(parseId(c), parsed.data, c.get("adminId")) });
  },
  async timeline(c: Context): Promise<Response> {
    const parsed = timelineEntrySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message ?? "Geçersiz zaman çizelgesi kaydı.");
    return c.json({ data: await addTimelineEntry(parseId(c), parsed.data.message, c.get("adminId")) }, 201);
  },
  async communication(c: Context): Promise<Response> {
    const parsed = communicationSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message ?? "Geçersiz iletişim taslağı.");
    return c.json({ data: await requestCommunication(parseId(c), parsed.data.message, c.get("adminId")) }, 201);
  },
  async decision(c: Context): Promise<Response> {
    const parsed = communicationDecisionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message ?? "Geçersiz iletişim kararı.");
    return c.json({ data: await decideCommunication(parseId(c, "communicationId"), parsed.data.decision, parsed.data.note, c.get("adminId")) });
  },
};
