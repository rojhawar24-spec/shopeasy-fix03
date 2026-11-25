// Post-authentication navigation is role-bound and must never point to an
// authentication endpoint. Keeping it separate permits tests without a database.
import { isSafeLocalPath } from './security.js';
import { parseLocalRedirect } from './local-navigation.js';

const BAD_CUSTOMER_ROUTES = /^\/(?:admin|mfa|login|register|logout|forgot-password|verify-email|local-manager-recovery|session|payments|api)(?:\/|$)/i;

export function authDestination(role, value, fallback) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  const safeFallback = parseLocalRedirect(fallback);
  const defaultTarget = safeFallback ? safeFallback.pathname+safeFallback.search+safeFallback.hash : (['admin','manager'].includes(normalizedRole) ? '/admin' : '/account');
  if (typeof value !== 'string' || value.length > 200 || !isSafeLocalPath(value)) return defaultTarget;
  const target = value.trim();
  if (!target.startsWith('/') || target.startsWith('//') || !isSafeLocalPath(target)) return defaultTarget;
  // Reject browsers' alternate path representations, e.g. /%2f%2fhost or
  // control characters encoded in the URL, before choosing a redirect.
  if (/%(?:00|0a|0d|2f|5c)/i.test(target)) return defaultTarget;
  const parsed = parseLocalRedirect(target);
  if (!parsed) return defaultTarget;
  // URL resolves /./ and /../ segments. Authorize the resolved destination,
  // not the unnormalized string; this prevents a /./login redirect loop.
  const path=parsed.pathname;
  const normalized=parsed.pathname+parsed.search+parsed.hash;
  if (normalizedRole === 'manager') {
    return /^\/admin(?:\/|$)/.test(path) ? normalized : '/admin';
  }
  if (normalizedRole === 'admin') return '/admin';
  if (BAD_CUSTOMER_ROUTES.test(path)) return '/account';
  return normalized;
}

// An old or partially configured Manager session must be able to open the
// sign-in screen to restart MFA rather than loop between /login and /admin.
export function managerMustCompleteMfa(user) {
  return String(user?.role||'').trim().toLowerCase()==='manager' && Number(user?.mfa_enabled)!==1;
}
