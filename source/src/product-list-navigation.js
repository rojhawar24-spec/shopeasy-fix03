const PRODUCT_LIST_STATUSES = new Set(['active', 'archived']);
const PRODUCT_DELETE_NOTICES = new Set(['deleted', 'deleteFailed', 'history', 'reserved']);

/**
 * Build a same-origin, allow-listed manager product-list redirect after a
 * destructive action. A submitted form value is a filter name, never a URL.
 */
export function buildProductDeleteRedirect(returnStatus, notice) {
  const status = typeof returnStatus === 'string' && PRODUCT_LIST_STATUSES.has(returnStatus)
    ? returnStatus
    : 'all';
  const safeNotice = typeof notice === 'string' && PRODUCT_DELETE_NOTICES.has(notice)
    ? notice
    : 'deleteFailed';
  return `/admin/products?${status === 'all' ? '' : `status=${status}&`}notice=${encodeURIComponent(safeNotice)}`;
}
