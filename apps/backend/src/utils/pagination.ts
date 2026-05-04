import { Context } from 'hono';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Hono context üzerinden page, limit ve skip hesaplamalarını yapar.
 * Varsayılan olarak page=1, limit=10 alır.
 * 
 * @param c Hono Context
 * @param defaultLimit Varsayılan limit değeri (default: 10)
 */
export function getPaginationParams(c: Context<any>, defaultLimit = 10, maxLimit = 100): PaginationParams {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = Math.min(maxLimit, Math.max(1, parseInt(c.req.query('limit') ?? String(defaultLimit), 10)));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}
