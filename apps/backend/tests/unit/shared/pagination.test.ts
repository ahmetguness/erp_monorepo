import { describe, expect, it } from 'vitest';
import { createPageResult, parsePageRequest } from '../../../src/modules/shared/application/pagination.js';

describe('pagination', () => {
  it('normalizes invalid and excessive values', () => {
    expect(parsePageRequest('-2', '999')).toEqual({ page: 1, pageSize: 100 });
    expect(parsePageRequest(undefined, undefined)).toEqual({ page: 1, pageSize: 20 });
  });

  it('creates consistent page metadata', () => {
    expect(createPageResult(['a', 'b'], 21, { page: 2, pageSize: 10 })).toEqual({
      data: ['a', 'b'],
      meta: { total: 21, page: 2, pageSize: 10, totalPages: 3 },
    });
  });
});
