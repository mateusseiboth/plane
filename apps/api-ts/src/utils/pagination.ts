// Matches the Django OffsetPaginator cursor format: "limit:page:is_prev"

export interface PaginationParams {
  cursor?: string;
  perPage?: number;
}

export interface PaginatedResult<T> {
  total_count: number;
  next_cursor: string;
  prev_cursor: string;
  next_page_results: boolean;
  prev_page_results: boolean;
  total_results: number;
  results: T[];
}

function parseCursor(raw: string): { limit: number; page: number; isPrev: boolean } {
  const parts = raw.split(":");
  if (parts.length !== 3) return { limit: 100, page: 0, isPrev: false };
  return {
    limit: parseInt(parts[0]) || 100,
    page: parseInt(parts[1]) || 0,
    isPrev: parts[2] === "1",
  };
}

export function buildCursor(limit: number, page: number, isPrev: boolean): string {
  return `${limit}:${page}:${isPrev ? 1 : 0}`;
}

export async function paginate<T>(opts: {
  query: (skip: number, take: number) => Promise<T[]>;
  count: () => Promise<number>;
  cursor?: string;
  perPage?: number;
  transform?: (items: T[]) => unknown;
}): Promise<PaginatedResult<unknown>> {
  const perPage = Math.min(opts.perPage ?? 100, 1000);
  const parsed = opts.cursor ? parseCursor(opts.cursor) : { limit: perPage, page: 0, isPrev: false };
  const limit = parsed.limit || perPage;
  const page = parsed.page;
  const skip = page * limit;

  const [items, total] = await Promise.all([
    opts.query(skip, limit + 1), // fetch one extra to detect next page
    opts.count(),
  ]);

  const hasNext = items.length > limit;
  const results = hasNext ? items.slice(0, limit) : items;

  const transformed = opts.transform ? opts.transform(results) : results;

  return {
    total_count: total,
    next_cursor: buildCursor(limit, page + 1, false),
    prev_cursor: buildCursor(limit, Math.max(0, page - 1), true),
    next_page_results: hasNext,
    prev_page_results: page > 0,
    total_results: total,
    results: transformed as unknown[],
  };
}
