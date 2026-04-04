import type { z } from 'zod';

/**
 * Zod parse with fallback — parse başarısız olursa raw data'yı döner.
 * Production'da strict parse kullanılmalı, development'ta toleranslı.
 */
export function safeParse<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  label?: string,
): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  if (process.env.NODE_ENV === 'development') {
    console.warn(
      `[Zod] ${label ?? 'parse'} warning:`,
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }

  // Fallback: return raw data as-is
  return data as z.infer<T>;
}
