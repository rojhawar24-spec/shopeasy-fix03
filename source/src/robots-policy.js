/**
 * HTTP-layer robot exclusion for pages containing private account, customer,
 * order, payment, or authentication data. robots.txt alone is insufficient:
 * crawlers may already know a URL and can index it even if they cannot crawl.
 */
const PRIVATE_ROUTE_PREFIXES = Object.freeze([
  '/admin', '/account', '/cart', '/checkout', '/login', '/register',
  '/forgot-password', '/verify-email', '/mfa', '/wishlist', '/success',
  '/order', '/order-lookup', '/local-manager-recovery', '/session', '/api',
  '/payments'
]);

export function isPrivateStorefrontPath(pathname) {
  // Express accepts route aliases such as /LOGIN and /Account by default.
  // Their HTTP indexing policy must match the same protected lowercase routes.
  const path = typeof pathname === 'string' ? pathname.split('?')[0].toLowerCase() : '';
  return PRIVATE_ROUTE_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix + '/'));
}

export function privatePageRobotsHeader(req, res, next) {
  if (isPrivateStorefrontPath(req.path)) {
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  next();
}
