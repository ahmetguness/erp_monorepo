import { DemoRequestStatus } from "@prisma/client";
import { z } from "zod";

const plainText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform((value) => value.replace(/<[^>]*>/g, "").trim());

export const publicDemoRequestSchema = z
  .object({
    fullName: plainText(100),
    companyName: plainText(100),
    email: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase()),
    phone: plainText(20).optional(),
    plan: z.enum(["STARTER", "PROFESSIONAL", "ENTERPRISE"]).optional(),
  })
  .strict();

export const demoRequestListSchema = z.object({
  status: z.nativeEnum(DemoRequestStatus).optional(),
  ownerId: z.string().min(1).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const demoRejectSchema = z
  .object({ reason: z.string().trim().min(10).max(1000) })
  .strict();

export const demoOwnerSchema = z
  .object({ ownerId: z.string().min(1) })
  .strict();

export const demoNoteSchema = z
  .object({ note: z.string().trim().min(2).max(2000) })
  .strict();
