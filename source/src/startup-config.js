
/**
 * Resolve a public origin for canonical URLs and account-verification links.
 * Production MUST use an explicitly configured HTTPS origin; never trust Host or
 * forwarded headers to build links that contain a bearer token. Development may
 * fall back to the current request origin for localhost workflows.
 */
export function resolvePublicBaseUrl({
  nodeEnv = process.env.NODE_ENV,
  baseUrl = process.env.BASE_URL,
  requestProtocol = 'http',
  requestHost = 'localhost:3000'
} = {}) {
  const developmentMode = ['development', 'test'].includes(String(nodeEnv || '').trim().toLowerCase());
  const configured = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  const validOrigin = (raw, requireHttps) => {
    try {
      const url = new URL(raw);
      const protocolAllowed = requireHttps ? url.protocol === 'https:' : ['http:', 'https:'].includes(url.protocol);
      const host = url.hostname.toLowerCase();
      const localHost = host === 'localhost' || host.endsWith('.localhost') ||
        host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host === '[::1]';
      if (!protocolAllowed || !url.hostname || url.username || url.password || url.search || url.hash || url.pathname !== '/') return '';
      if (!developmentMode && localHost) return '';
      return url.origin;
    } catch {
      return '';
    }
  };

  const configuredOrigin = validOrigin(configured, !developmentMode);
  if (configuredOrigin) return configuredOrigin;
  // Only explicit local/test environments may fall back to request headers.
  if (!developmentMode) return '';

  const protocol = String(requestProtocol || '').replace(/:$/, '').toLowerCase();
  const host = String(requestHost || '').trim();
  if (!['http', 'https'].includes(protocol) || !host || /[\s/@?#]/.test(host)) return '';
  return validOrigin(`${protocol}://${host}`, false);
}

/**
 * Emit safe startup warnings for public URL configuration. This never logs the
 * configured URL itself, so arbitrary values cannot leak into production logs.
 */
export function warnIfProductionBaseUrlMisconfigured({
  nodeEnv = process.env.NODE_ENV,
  baseUrl = process.env.BASE_URL,
  warn = console.warn
} = {}) {
  if (nodeEnv !== 'production') return [];

  const configuredBaseUrl = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  const warnings = [];

  if (!/^https:\/\//i.test(configuredBaseUrl)) {
    warnings.push('[config] BASE_URL must start with https:// in production; canonical URLs and sitemap generation may fail.');
  } else if (!resolvePublicBaseUrl({ nodeEnv, baseUrl: configuredBaseUrl })) {
    warnings.push('[config] BASE_URL must be a valid public HTTPS origin without credentials, path, query or fragment; verification links and sitemap generation will be unavailable.');
  }

  if (/localhost/i.test(configuredBaseUrl)) {
    warnings.push('[config] BASE_URL contains localhost in production; public URLs will point to the server itself and Secure-cookie sessions will not work correctly for customers.');
  }

  for (const message of warnings) warn(message);
  return warnings;
}
