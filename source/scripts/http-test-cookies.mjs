/** Return separate Set-Cookie values across Node/Fetch Headers implementations. */
export function responseSetCookieHeaders(headers) {
  if (typeof headers?.getSetCookie === 'function') return headers.getSetCookie();
  const combined = headers?.get?.('set-cookie') || '';
  // A comma inside an Expires attribute is followed by a date, not a cookie pair.
  return combined ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/).map(value => value.trim()).filter(Boolean) : [];
}

/** Select the last Set-Cookie value for a cookie name, matching user-agent update order. */
export function responseCookieHeader(headers, name = 'sid') {
  const prefix = `${name}=`;
  return responseSetCookieHeaders(headers).filter(value => value.trim().startsWith(prefix)).at(-1)?.trim() || '';
}

export function responseCookie(headers, name = 'sid') {
  return responseCookieHeader(headers, name).split(';', 1)[0] || null;
}
