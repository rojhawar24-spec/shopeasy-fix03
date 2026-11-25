import crypto from 'node:crypto';
import { createSession, createAuthenticatedSession, destroySession, getSession, getUserAuthByEmail, getUserById, saveSessionCart, saveSessionWishlist, saveSessionCoupon, setSessionCsrf } from './db.js';

import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from './password-hashing.js';

export function sessionCookieName() { return process.env.NODE_ENV === 'production' ? '__Host-sid' : 'sid'; }

// Session rotation must replace the middleware's previously queued cookie rather
// than append a second cookie with the same name. Besides removing ambiguity for
// clients that expose combined Set-Cookie headers, this makes the browser's session
// identifier unambiguous during login and the Manager MFA challenge transition.
function removeQueuedSessionCookie(res) {
  const name = `${sessionCookieName()}=`;
  const current = res.getHeader?.('Set-Cookie');
  if (!current) return;
  const values = (Array.isArray(current) ? current : [current])
    .filter(value => !String(value).trim().startsWith(name));
  if (values.length) res.setHeader('Set-Cookie', values);
  else res.removeHeader?.('Set-Cookie');
}

export function setSessionCookie(res, sid, options = cookieOptions()) {
  removeQueuedSessionCookie(res);
  res.cookie(sessionCookieName(), sid, options);
}

export function clearSessionCookie(res) {
  removeQueuedSessionCookie(res);
  res.clearCookie(sessionCookieName(), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
}

export async function attachAuth(req, res, next) {
  try {
    const suppliedSid = req.cookies?.[sessionCookieName()];
    // cookie-parser intentionally decodes j: cookies into arbitrary JSON values.
    // Only bounded opaque session identifiers may reach the database driver.
    let sid = typeof suppliedSid === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(suppliedSid) ? suppliedSid : null;
    if (suppliedSid !== undefined && !sid) clearSessionCookie(res);
    let session = sid ? await getSession(sid) : null;
    if (!session) { sid = await createSession(); session = await getSession(sid); }
    if (!session.csrf) { session.csrf = crypto.randomBytes(24).toString('base64url'); await setSessionCsrf(sid, session.csrf); }
    setSessionCookie(res, sid, cookieOptions());
    req.sessionId = sid;
    req.session = session;
    req.user = session.user_id ? await getUserById(session.user_id) : null;
    res.locals.user = req.user;
    res.locals.isLoggedIn = Boolean(req.user);
    next();
  } catch (error) { next(error); }
}
export function cookieOptions(_rememberMe = true) { return { httpOnly:true, sameSite:'lax', secure:process.env.NODE_ENV==='production', path:'/', maxAge:2*60*60*1000 }; }
export async function login(req, res, userId, rememberMe = true, credentialProof) {
  const oldSession = req.session;
  const newSid = await createAuthenticatedSession(userId, credentialProof);
  try {
    await setSessionCsrf(newSid, crypto.randomBytes(24).toString('base64url'));
    await saveSessionCart(newSid, oldSession?.cart || []);
    await saveSessionWishlist(newSid, oldSession?.wishlist || []);
    await saveSessionCoupon(newSid, oldSession?.coupon || null);
    await destroySession(req.sessionId);
    setSessionCookie(res, newSid, cookieOptions(rememberMe));
  } catch(error) {
    try { await destroySession(newSid); } catch {}
    throw error;
  }
}
export async function logout(req, res) { await destroySession(req.sessionId); clearSessionCookie(res); }
export function requireAuth(req, res, next) { if (!req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl)); next(); }
async function refreshSessionUser(req, res, next) {
  if (req.session?.user_id) {
    try {
      const freshUser = await getUserById(req.session.user_id);
      req.user = freshUser || null;
      res.locals.user = req.user;
      res.locals.isLoggedIn = Boolean(req.user);
    } catch (error) { next(error); return false; }
  }
  return true;
}

// Manager is the only role with full store-management privileges.
export async function requireManager(req, res, next) {
  if (!await refreshSessionUser(req, res, next)) return;
  if (!req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  const role = String(req.user.role ?? '').trim().toLowerCase();
  if (role !== 'manager') return res.status(403).render('error', { title: 'Access denied', message: 'A Manager account is required to manage this store.' });
  if (Number(req.user.mfa_enabled)!==1) return res.redirect(303,'/login?mfa=required');
  next();
}

// Admin can sign in and view only the restricted overview; every management route
// uses requireManager and is therefore unavailable to Admin.
export async function requireDashboardAccess(req, res, next) {
  if (!await refreshSessionUser(req, res, next)) return;
  if (!req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  const role = String(req.user.role ?? '').trim().toLowerCase();
  if (!['admin', 'manager'].includes(role)) return res.status(403).render('error', { title: 'Access denied', message: 'You do not have permission to open this page.' });
  if (role === 'manager' && Number(req.user.mfa_enabled) !== 1) return res.redirect(303, '/login?mfa=required');
  next();
}

// Strict Admin guard retained for future admin-specific operations, not store management.
export async function requireAdmin(req, res, next) {
  if (!await refreshSessionUser(req, res, next)) return;
  if (!req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  const role = String(req.user.role ?? '').trim().toLowerCase();
  if (role !== 'admin') return res.status(403).render('error', { title: 'Access denied', message: 'Administrator permission is required.' });
  next();
}
export async function authenticate(email, password) {
  const row = await getUserAuthByEmail(String(email || '').trim().toLowerCase());
  // Always run a PBKDF2 check for unknown users to reduce account-enumeration timing differences.
  const stored = row?.password_hash || DUMMY_PASSWORD_HASH;
  const valid = await verifyPassword(String(password || ''), stored);
  if (!row || !valid) return null;
  if(String(row.role||'').toLowerCase()==='customer' && Number(row.email_verification_required)===1 && !row.email_verified_at) return null;
  const user={ id: row.id, email: row.email, role: row.role, mfaEnabled: Number(row.mfa_enabled)===1 };
  // Internal proof only; do not serialize password hashes into response models.
  Object.defineProperty(user,'credentialProof',{value:Object.freeze({passwordHash:stored,email:row.email,role:row.role})});
  return user;
}
