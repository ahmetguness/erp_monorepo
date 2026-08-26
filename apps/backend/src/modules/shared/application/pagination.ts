export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface PageResult<TItem> {
  data: TItem[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export function createPageResult<TItem>(
  data: TItem[],
  total: number,
  request: PageRequest,
): PageResult<TItem> {
  return {
    data,
    meta: {
      total,
      page: request.page,
      pageSize: request.pageSize,
      totalPages: Math.ceil(total / request.pageSize),
    },
  };
}

export function parsePageRequest(
  page: string | undefined,
  pageSize: string | undefined,
  defaults: { pageSize: number; maxPageSize: number } = { pageSize: 20, maxPageSize: 100 },
): PageRequest {
  const parsedPage = Number.parseInt(page ?? '', 10);
  const parsedPageSize = Number.parseInt(pageSize ?? '', 10);
  return {
    page: Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1,
    pageSize: Number.isFinite(parsedPageSize)
      ? Math.min(defaults.maxPageSize, Math.max(1, parsedPageSize))
      : defaults.pageSize,
  };
}
