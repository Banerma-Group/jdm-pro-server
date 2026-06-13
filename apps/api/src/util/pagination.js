export function pagination(limit, offset, totalCount) {
  const safeLimit = Math.max(1, Number(limit) || 1);
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeTotalCount = Number(totalCount) || 0;

  if (safeTotalCount === 0) {
    return { totalPages: 0, currentPage: 0, totalCount: 0, perPage: safeLimit };
  }

  const totalPages = Math.ceil(safeTotalCount / safeLimit);
  const currentPage = Math.ceil(safeOffset / safeLimit) + 1;
  return { totalPages, currentPage, totalCount: safeTotalCount, perPage: safeLimit };
}
