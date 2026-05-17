import { z } from 'zod';

export const SingleResponseSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    data: schema,
  });

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    data: z.array(schema),
    meta: z.object({
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
      totalPages: z.number(),
    }),
  });

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    fields?: Record<string, string>;
  };
}
