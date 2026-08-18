import { useState } from "react";

const DEFAULT_PAGE_SIZE = 10;

export function usePagination<T>(items: T[], pageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  // Clamp rather than reset: if a reload/filter shrinks the result set, this falls back to the
  // last valid page instead of always jumping to page 1, so paging through results then adding
  // one more row doesn't relocate you.
  const safePage = Math.min(page, pageCount);
  const pagedItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  return { page: safePage, setPage, pageCount, pagedItems };
}
