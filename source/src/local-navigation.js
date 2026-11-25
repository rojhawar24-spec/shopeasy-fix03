// Parse a local redirect and validate its serialized form as a new URL.
// Dot-segment normalization can otherwise turn a same-origin path into //host.
const origin = 'https://navigation.invalid';
export function parseLocalRedirect(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, origin);
    const target = url.pathname + url.search + url.hash;
    if (url.origin !== origin || target.startsWith('//') || new URL(target, origin).origin !== origin) return null;
    return url;
  } catch { return null; }
}
