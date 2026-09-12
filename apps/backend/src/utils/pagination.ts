import type { Context } from 'hono';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Hono context üzerinden page, limit ve skip hesaplamalarını yapar.
 * @param c Hono Context
 * @param defaultLimit Varsayılan limit değeri (default: 10)
 * @param maxLimit Maksimum limit değeri (default: 100)
 */
export function getPaginationParams(c: Context, defaultLimit = 10, maxLimit = 100): PaginationParams {
  const requestedPage = Number.parseInt(c.req.query('page') ?? '1', 10);
  const requestedLimit = Number.parseInt(c.req.query('limit') ?? String(defaultLimit), 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(maxLimit, requestedLimit)
    : defaultLimit;
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
