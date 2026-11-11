export const LIBRARY_PAGE_SIZE = 9;

export function paginateLibrary<T>(items: T[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / LIBRARY_PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, requestedPage));
  return { page, pageCount, items: items.slice((page - 1) * LIBRARY_PAGE_SIZE, page * LIBRARY_PAGE_SIZE) };
}
