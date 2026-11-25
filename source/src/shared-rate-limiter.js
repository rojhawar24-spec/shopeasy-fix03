import crypto from 'node:crypto';
import {isIP} from 'node:net';

function actorIp(req) {
  const cloudflareIp = req.get?.('cf-connecting-ip') || req.headers?.['cf-connecting-ip'];
  const candidate = typeof cloudflareIp === 'string' && cloudflareIp.trim()
    ? cloudflareIp.trim()
    : String(req.ip || req.socket?.remoteAddress || '').trim();
  // Avoid an attacker-provided list/header becoming a shared unbounded key.
  if (!candidate || candidate.length > 128 || candidate.includes(',')) return '';
  return candidate;
}

function serviceUnavailable(res) {
  return res.status(503).type('text/plain').send('Request protection is temporarily unavailable. Please try again later. This production deployment must use Cloudflare Workers with the SHOP_RATE_LIMITER binding or a single persistent Node.js instance configured for single-process rate limiting.');
}

/**
 * Supported production serverless deployment is Cloudflare Workers, using a Durable
 * Object counter shared across Worker isolates. Local Node development retains the
 * express-rate-limit in-memory store. Persistent Node production must explicitly opt
 * into a single-process memory store; serverless platforms are refused because
 * per-process memory does not provide a shared enforcement boundary.
 */
export function createShopRateLimiter({ name, windowMs, max, message, fallback, isCloudflareWorker, onLimit, onUnavailable }) {
  const unavailable = (req, res, next) => {
    if (typeof onUnavailable === 'function') {
      try { return onUnavailable(req, res, next); } catch { /* retain fail-closed default */ }
    }
    return serviceUnavailable(res);
  };
  return function shopRateLimitMiddleware(req, res, next) {
    if (!isCloudflareWorker && process.env.RATE_LIMIT_BACKEND === 'postgres-shared') {
      return (async () => {
        const ip = process.env.VERCEL === '1' ? req.get?.('x-vercel-forwarded-for') : req.ip;
        if (typeof ip !== 'string' || !isIP(ip)) return unavailable(req,res,next);
        const actorKey=crypto.createHash('sha256').update(name+'\0'+ip).digest('hex');
        const {isPostgresStaging,db}=await import('./database.js');
        if (!isPostgresStaging) return unavailable(req,res,next);
        const result=await db.consumeRequestLimit(actorKey,max,windowMs);
        if(typeof result?.allowed!=='boolean' || !Number.isSafeInteger(result.remaining) || !Number.isSafeInteger(result.reset_at))return unavailable(req,res,next);
        const resetSeconds=Math.max(0,result.reset_at-Math.floor(Date.now()/1000));
        res.set('RateLimit-Limit',String(max));
        res.set('RateLimit-Remaining',String(result.remaining));
        res.set('RateLimit-Reset',String(resetSeconds));
        res.set('RateLimit-Policy',max+';w='+Math.ceil(windowMs/1000));
        if(!result.allowed){
          res.set('Retry-After',String(Math.max(1,resetSeconds)));
          if(typeof onLimit==='function')return onLimit(req,res,next);
          return res.status(429).type('text/plain').send(message);
        }
        return next();
      })().catch(()=>unavailable(req,res,next));
    }
    if (!isCloudflareWorker) {
      const production = process.env.NODE_ENV === 'production';
      const serverless = process.env.VERCEL === '1' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
      const explicitlySingleProcess = process.env.RATE_LIMIT_BACKEND === 'memory-single-instance';
      if (production && (serverless || !explicitlySingleProcess)) return unavailable(req, res, next);
      return fallback(req, res, next);
    }

    return (async () => {
      const env = globalThis.__SHOP_CF_ENV;
      const binding = env?.SHOP_RATE_LIMITER;
      if (!binding || typeof binding.idFromName !== 'function' || typeof binding.get !== 'function') {
        return unavailable(req, res, next);
      }
      const ip = actorIp(req);
      if (!ip) return unavailable(req, res, next);
      const actorKey = crypto.createHash('sha256').update(`${name}\0${ip}`).digest('hex');
      const stub = binding.get(binding.idFromName(actorKey));
      const response = await stub.fetch('https://shopeasy-rate-limit.internal/consume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: max, windowMs })
      });
      if (!response.ok) return unavailable(req, res, next);
      const result = await response.json();
      if (typeof result?.allowed !== 'boolean' || !Number.isFinite(result.remaining) || !Number.isFinite(result.resetAt)) {
        return unavailable(req, res, next);
      }
      const resetSeconds = Math.max(0, result.resetAt - Math.floor(Date.now() / 1000));
      res.set('RateLimit-Limit', String(max));
      res.set('RateLimit-Remaining', String(Math.max(0, result.remaining)));
      res.set('RateLimit-Reset', String(resetSeconds));
      res.set('RateLimit-Policy', `${max};w=${Math.ceil(windowMs / 1000)}`);
      if (!result.allowed) {
        res.set('Retry-After', String(Math.max(1, resetSeconds)));
        if (typeof onLimit === 'function') return onLimit(req, res, next);
        return res.status(429).type('text/plain').send(message);
      }
      return next();
    })().catch(() => unavailable(req, res, next));
  };
}
