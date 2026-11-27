// Node-only, byte-preserving compression for the shipped public CSS/JS files.
// Mount before express.static, only when CLOUDFLARE_WORKER !== '1'.
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzip, brotliCompress, constants as zlibConstants } from 'node:zlib';
import { promisify } from 'node:util';

const compress = promisify(gzip);
const brotli = promisify(brotliCompress);
const ASSETS = new Set([
  '/css/app.css', '/css/design-tokens.css', '/css/editorial-2027.css',
  '/css/research-polish-2027.css', '/css/retail-2027.css',
  '/css/design-foundation.min.css', '/css/design-polish.min.css',
  '/js/admin-settings-ux.js', '/js/app.js', '/js/home-login.js',
  '/js/cart-studio.js', '/js/category-scroll.js', '/js/checkout-auto-price-v1.js',
  '/js/checkout-studio.js', '/js/easy-photo-upload-v1.js', '/js/i18n-kmr.js',
  '/js/i18n.js', '/js/i18n-ar.js', '/js/i18n-ckb.js', '/js/i18n-fr.js',
  '/js/i18n-nl.js', '/js/image-fallback.js', '/js/mfa-setup.js',
  '/js/product-image-preview.js', '/js/product-photo-zoom.js',
  '/js/retail-2027.js', '/js/theme-early-2027.js'
]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 32;
const MAX_LOADS = 2;
const signature = stat => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
const tag = bytes => `"sha256-${createHash('sha256').update(bytes).digest('base64url')}"`;
const sameTag = (header, etag, weak) => String(header).split(',').some(value => {
  const candidate = value.trim();
  return candidate === '*' || (weak ? candidate.replace(/^W\//, '') === etag : candidate === etag);
});

// Explicit entries override '*'; conflicting duplicates use the lower quality.
// An absent/empty header conservatively selects identity. Identity is acceptable
// by default, except an explicit exclusion or '*;q=0' without an identity entry.
function qualities(header) {
  if (!header || !String(header).trim()) return { br: 0, gzip: 0, identity: 1 };
  const values = new Map();
  for (const part of String(header).split(',')) {
    const [name, ...parameters] = part.trim().toLowerCase().split(';').map(value => value.trim());
    if (!/^(?:br|gzip|x-gzip|identity|\*)$/.test(name)) continue;
    let quality = 1;
    if (parameters.length) {
      const match = parameters.length === 1 && /^q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.exec(parameters[0]);
      quality = match ? Number(match[1]) : 0;
    }
    const coding = name === 'x-gzip' ? 'gzip' : name;
    values.set(coding, Math.min(values.get(coding) ?? 1, quality));
  }
  return {
    br: values.get('br') ?? values.get('*') ?? 0,
    gzip: values.get('gzip') ?? values.get('*') ?? 0,
    identity: values.get('identity') ?? (values.get('*') === 0 ? 0 : 1)
  };
}

function vary(res) {
  const current = String(res.getHeader('Vary') || '');
  if (!current.split(',').some(value => ['*', 'accept-encoding'].includes(value.trim().toLowerCase()))) {
    res.setHeader('Vary', current ? `${current}, Accept-Encoding` : 'Accept-Encoding');
  }
}

function refusal(res, status) {
  res.statusCode = status;
  for (const name of ['Content-Encoding', 'Content-Type', 'ETag', 'Last-Modified', 'Accept-Ranges']) res.removeHeader(name);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', '0');
  res.end();
}

// Missing assets retain the normal static/404 behavior. An unsafe known path is
// refused: express.static follows symlinks, so falling through would undo this guard.
async function inspect(root, pathname) {
  const directory = path.join(root, pathname.startsWith('/css/') ? 'css' : 'js');
  const filename = path.join(root, pathname.slice(1));
  try {
    for (const candidate of [root, directory]) {
      const stat = await lstat(candidate);
      if (stat.isSymbolicLink() || !stat.isDirectory() || await realpath(candidate) !== candidate) return { unsafe: true };
    }
    const stat = await lstat(filename, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isFile() || await realpath(filename) !== filename) return { unsafe: true };
    return { filename, stat, key: signature(stat) };
  } catch (error) {
    return error.code === 'ENOENT' || error.code === 'ENOTDIR' ? null : { unsafe: true };
  }
}

export function createStaticAssetCompression({ publicRoot, isProd = false } = {}) {
  if (typeof publicRoot !== 'string' || !path.isAbsolute(publicRoot)) throw new TypeError('publicRoot must be absolute');
  const root = path.resolve(publicRoot);
  const cache = new Map();
  const loading = new Map();
  const queued = [];
  let activeLoads = 0;
  let cacheBytes = 0;
  const forget = key => {
    const existing = cache.get(key);
    if (existing) { cacheBytes -= existing.cost; cache.delete(key); }
  };
  const remember = (pathname, entry) => {
    forget(pathname);
    while (cache.size >= MAX_CACHE_ENTRIES || cacheBytes + entry.cost > MAX_CACHE_BYTES) forget(cache.keys().next().value);
    cache.set(pathname, entry);
    cacheBytes += entry.cost;
    return entry;
  };
  const load = async (pathname, checked) => {
    let handle;
    try {
      handle = await open(checked.filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const before = await handle.stat({ bigint: true });
      if (!before.isFile() || signature(before) !== checked.key || before.size > BigInt(MAX_FILE_BYTES)) return null;
      // A fixed-size read remains bounded even if a file grows concurrently.
      const raw = Buffer.alloc(Number(before.size));
      let offset = 0;
      while (offset < raw.length) {
        const { bytesRead } = await handle.read(raw, offset, raw.length - offset, offset);
        if (!bytesRead) return null;
        offset += bytesRead;
      }
      if (signature(await handle.stat({ bigint: true })) !== checked.key) return null;
      const current = await inspect(root, pathname);
      if (!current || current.unsafe || current.key !== checked.key) return null;
      const [encoded, br] = await Promise.all([
        compress(raw, { level: 6 }),
        brotli(raw, { params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
          [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT
        } })
      ]);
      // Recheck after asynchronous compression before retaining a deployment's bytes.
      const after = await inspect(root, pathname);
      if (!after || after.unsafe || after.key !== checked.key) return null;
      return remember(pathname, {
        key: checked.key, raw, encoded, br, rawTag: tag(raw), gzipTag: tag(encoded), brTag: tag(br),
        modified: new Date(Number(before.mtimeNs / 1000000n)).toUTCString(),
        modifiedSeconds: Number(before.mtimeNs / 1000000000n), cost: raw.length + encoded.length + br.length
      });
    } catch { return null; }
    finally { await handle?.close().catch(() => {}); }
  };

  // The fixed allowlist bounds this queue to the explicitly shipped paths; callers
  // for the same path share one promise. Only two file/compression jobs run at
  // once. A cold page no longer loses compression when its third asset arrives.
  const drain = () => {
    while (activeLoads < MAX_LOADS && queued.length) {
      const { pathname, checked, resolve } = queued.shift();
      activeLoads++;
      load(pathname, checked).then(resolve, () => resolve(null)).finally(() => {
        activeLoads--;
        drain();
      });
    }
  };
  const schedule = (pathname, checked) => new Promise(resolve => {
    queued.push({ pathname, checked, resolve });
    drain();
  });

  return async function staticAssetCompression(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    // Compare the literal path: no percent decoding, path normalization or user filenames.
    const pathname = String(req.url).split(/[?#]/, 1)[0];
    if (!ASSETS.has(pathname)) return next();
    const checked = await inspect(root, pathname);
    if (!checked) { forget(pathname); return next(); }
    if (checked.unsafe) { forget(pathname); return refusal(res, 404); }
    vary(res);
    const accepted = qualities(req.headers['accept-encoding']);
    const plainFallback = async () => {
      // A deployment may replace a file while a load/compression is in flight.
      // Never let an unsafe replacement escape through express.static.
      const current = await inspect(root, pathname);
      if (current?.unsafe) { forget(pathname); return refusal(res, 404); }
      if (!current) { forget(pathname); return next(); }
      return accepted.identity > 0 ? next() : refusal(res, 406);
    };
    if (accepted.br <= 0 && accepted.gzip <= 0 && accepted.identity <= 0) return refusal(res, 406);
    // Leave range/If-Range semantics to the existing static server, using identity.
    if (req.headers.range || checked.stat.size > BigInt(MAX_FILE_BYTES)) return plainFallback();
    let entry = cache.get(pathname);
    if (entry?.key !== checked.key) { forget(pathname); entry = null; }
    if (entry) { cache.delete(pathname); cache.set(pathname, entry); }
    else {
      let pending = loading.get(pathname);
      if (!pending) {
        pending = schedule(pathname, checked);
        loading.set(pathname, pending);
      }
      try { entry = await pending; }
      finally { if (loading.get(pathname) === pending) loading.delete(pathname); }
      // A failed or changed read must fail closed. Sending the path to static
      // here could expose a symlink swapped in while gzip was running.
      if (!entry || entry.key !== checked.key) return refusal(res, 404);
    }
    // Honor the client's highest quality first. Among equally preferred
    // compression codings, send the smaller actual result rather than assuming
    // Brotli wins every file. Preserve compression preference on an identity tie.
    const choices = [
      { coding: 'br', quality: accepted.br, length: entry.br.length },
      { coding: 'gzip', quality: accepted.gzip, length: entry.encoded.length },
      { coding: 'identity', quality: accepted.identity, length: entry.raw.length }
    ].filter(choice => choice.quality > 0);
    const highestQuality = Math.max(...choices.map(choice => choice.quality));
    const preferred = choices.filter(choice => choice.quality === highestQuality);
    const compressed = preferred.filter(choice => choice.coding !== 'identity');
    const coding = (compressed.length ? compressed : preferred).sort((left, right) => left.length - right.length)[0].coding;
    const bytes = coding === 'br' ? entry.br : coding === 'gzip' ? entry.encoded : entry.raw;
    const etag = coding === 'br' ? entry.brTag : coding === 'gzip' ? entry.gzipTag : entry.rawTag;
    res.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', `public, max-age=${isProd ? 604800 : 0}`);
    res.setHeader('Last-Modified', entry.modified);
    res.setHeader('ETag', etag);
    res.setHeader('Accept-Ranges', coding === 'identity' ? 'bytes' : 'none');
    if (coding !== 'identity') res.setHeader('Content-Encoding', coding);
    if (req.headers['if-match'] && !sameTag(req.headers['if-match'], etag, false)) return refusal(res, 412);
    const unmodified = Date.parse(req.headers['if-unmodified-since']);
    if (!req.headers['if-match'] && Number.isFinite(unmodified) && entry.modifiedSeconds > Math.floor(unmodified / 1000)) return refusal(res, 412);
    const modified = Date.parse(req.headers['if-modified-since']);
    const fresh = req.headers['if-none-match'] !== undefined
      ? sameTag(req.headers['if-none-match'], etag, true)
      : Number.isFinite(modified) && entry.modifiedSeconds <= Math.floor(modified / 1000);
    if (fresh && !/(?:^|,)\s*no-cache(?:\s|,|=|$)/i.test(String(req.headers['cache-control'] || ''))) {
      res.statusCode = 304;
      res.removeHeader('Content-Type');
      res.removeHeader('Content-Length');
      res.removeHeader('Transfer-Encoding');
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Length', String(bytes.length));
    res.end(req.method === 'HEAD' ? undefined : bytes);
  };
}
