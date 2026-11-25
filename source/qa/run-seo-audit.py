#!/usr/bin/env python3
"""Read-only sitemap/HTML audit; fixture mode owns and removes synthetic state."""
from __future__ import annotations
import argparse
import datetime as dt
from html.parser import HTMLParser
import importlib.util
import json
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import xml.etree.ElementTree as ET

sys.dont_write_bytecode = True
NS = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
MAX_BODY = 4 * 1024 * 1024


class AuditError(Exception):
    """Contains only a static audit code, never response bodies/credentials."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_):
        return None


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lang = self.direction = ''
        self.title = []
        self.h1s = []
        self.meta = {}
        self.links = []
        self.json_ld = []
        self.active = None

    def handle_starttag(self, tag, attributes):
        a = dict(attributes)
        if tag == 'html':
            self.lang, self.direction = a.get('lang', ''), a.get('dir', '')
        if tag == 'meta':
            self.meta.setdefault(a.get('name', a.get('property', '')).lower(), []).append(a.get('content', ''))
        if tag == 'link':
            self.links.append(a)
        if tag in ('title', 'h1'):
            values = []
            (self.title if tag == 'title' else self.h1s).append(values)
            self.active = (tag, values)
        if tag == 'script' and a.get('type') == 'application/ld+json':
            self.json_ld.append([])
            self.active = ('script', self.json_ld[-1])

    def handle_endtag(self, tag):
        if self.active and self.active[0] == tag:
            self.active = None

    def handle_data(self, data):
        if self.active:
            self.active[1].append(data)


def origin(value):
    u = urlsplit(value)
    if u.scheme not in ('http', 'https') or not u.hostname or u.username or u.password or u.fragment:
        raise AuditError('unsafe-base-url')
    return u.scheme + '://' + u.netloc


def safe_path(value, canonical_origin):
    u = urlsplit(value)
    if origin(value) != canonical_origin or u.fragment:
        raise AuditError('sitemap-outside-configured-origin')
    query = parse_qs(u.query, keep_blank_values=True)
    if set(query) - {'lang', 'page'}:
        raise AuditError('sitemap-unexpected-query-parameter')
    if any(len(values) != 1 for values in query.values()):
        raise AuditError('sitemap-repeated-query-parameter')
    return u.path + ('?' + u.query if u.query else '')


def xml_locations(data):
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise AuditError('xml-doctype-entity-refused')
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        raise AuditError('malformed-sitemap-xml') from None
    if root.tag not in (NS + 'sitemapindex', NS + 'urlset'):
        raise AuditError('wrong-sitemap-root-or-namespace')
    kind = 'sitemap' if root.tag == NS + 'sitemapindex' else 'url'
    locations = []
    for entry in root:
        if entry.tag != NS + kind:
            raise AuditError('unexpected-sitemap-entry')
        loc = entry.findall(NS + 'loc')
        if len(loc) != 1 or not (loc[0].text or '').strip():
            raise AuditError('missing-or-duplicate-location')
        locations.append(loc[0].text.strip())
    return kind, locations


def check_page(data, headers, public_url, expected_locales, default_locale='en'):
    p = Page()
    p.feed(data.decode('utf-8', 'strict'))
    problems = []
    title = [''.join(parts).strip() for parts in p.title]
    headings = [''.join(parts).strip() for parts in p.h1s]
    canonical = [a.get('href', '') for a in p.links if 'canonical' in a.get('rel', '').split()]
    alternatives = {a.get('hreflang'): a.get('href') for a in p.links if 'alternate' in a.get('rel', '').split() and a.get('hreflang')}
    language = parse_qs(urlsplit(public_url).query).get('lang', [default_locale])[0]
    if len(title) != 1 or not title[0]: problems.append('missing-or-duplicate-title')
    if len(headings) != 1 or not headings[0]: problems.append('missing-or-duplicate-h1')
    if len(p.meta.get('description', [])) != 1 or not p.meta['description'][0].strip(): problems.append('missing-or-duplicate-description')
    if canonical != [public_url]: problems.append('canonical-does-not-match-indexed-url')
    if 'noindex' in ' '.join(p.meta.get('robots', [])).lower() or 'noindex' in headers.get('x-robots-tag', '').lower(): problems.append('sitemap-url-is-noindex')
    if not p.lang.lower().startswith(language.lower()): problems.append('document-language-does-not-match-url')
    if p.direction != ('rtl' if language in ('ar', 'ckb') else 'ltr'): problems.append('wrong-document-direction')
    if set(alternatives) != set(expected_locales) | {'x-default'}: problems.append('missing-hreflang-alternates')
    schemas = []
    for parts in p.json_ld:
        try:
            schemas.append(json.loads(''.join(parts)))
        except json.JSONDecodeError:
            problems.append('invalid-json-ld')
    return {'url': public_url, 'title': title[0] if title else '', 'h1_count': len(headings), 'language': p.lang, 'direction': p.direction,
            'canonical': canonical, 'alternates': alternatives, 'json_ld_types': [x.get('@type') for x in schemas if isinstance(x, dict)], 'problems': problems}


def audit(base, canonical_base, maximum, delay_ms, locales, default_locale='en'):
    transport_origin, public_origin = origin(base), origin(canonical_base)
    if urlsplit(base).path not in ('', '/') or urlsplit(base).query:
        raise AuditError('base-url-must-be-origin')
    opener = build_opener(NoRedirect())
    def fetch(path):
        if delay_ms: time.sleep(delay_ms / 1000)
        request = Request(transport_origin + path, headers={'User-Agent': 'ShopEasy-read-only-SEO-audit/1.0', 'Accept-Encoding': 'identity'})
        try:
            response = opener.open(request, timeout=15)
        except HTTPError as error:
            response = error
        with response:
            body = response.read(MAX_BODY + 1)
            if len(body) > MAX_BODY: raise AuditError('response-size-limit')
            return response.status, {k.lower(): v for k, v in response.headers.items()}, body
    status, robot_headers, robots = fetch('/robots.txt')
    if status != 200: raise AuditError('robots-not-http200')
    if public_origin + '/sitemap.xml' not in robots.decode('utf-8'): raise AuditError('robots-sitemap-origin-mismatch')
    if 'set-cookie' in robot_headers: raise AuditError('robots-sets-cookie')
    queue, seen_sitemaps, urls = ['/sitemap.xml'], set(), []
    sitemap_records = []
    while queue:
        path = queue.pop(0)
        if path in seen_sitemaps: raise AuditError('sitemap-cycle-or-duplicate-child')
        seen_sitemaps.add(path)
        status, headers, data = fetch(path)
        if status != 200: raise AuditError('sitemap-not-http200')
        if 'set-cookie' in headers: raise AuditError('sitemap-sets-cookie')
        kind, locations = xml_locations(data)
        sitemap_records.append({'path': path, 'status': status, 'kind': kind, 'locations': len(locations)})
        for location in locations:
            target = safe_path(location, public_origin)
            if kind == 'sitemap': queue.append(target)
            else: urls.append(location)
        if len(urls) + len(queue) > maximum: raise AuditError('crawl-limit-reached-incomplete')
    if not urls: raise AuditError('empty-public-sitemap')
    if len(urls) != len(set(urls)): raise AuditError('duplicate-sitemap-url')
    pages = []
    for url in urls:
        status, headers, body = fetch(safe_path(url, public_origin))
        if status != 200:
            pages.append({'url': url, 'status': status, 'problems': ['indexed-url-not-http200']})
            continue
        page = check_page(body, headers, url, locales, default_locale)
        page['status'] = status
        pages.append(page)
    return {'robots_status': 200, 'sitemaps': sitemap_records, 'indexed_urls': len(urls), 'pages': pages,
            'page_problem_count': sum(len(p['problems']) for p in pages), 'crawl_complete': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--fixture', action='store_true', help='Own disposable synthetic application copy; no external providers.')
    mode.add_argument('--base-url', help='Explicit public origin; read-only crawl, redirects not followed.')
    parser.add_argument('--canonical-base', help='Only when auditing a local mirror; sitemap/canonical origin must match this exact origin.')
    parser.add_argument('--app-root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--node', default='node')
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--max-urls', type=int, default=2000)
    parser.add_argument('--delay-ms', type=int, default=100)
    parser.add_argument('--locales', default='en,ckb,ar,nl,fr')
    parser.add_argument('--default-locale', default='en', help='The audited store default language; the disposable fixture currently uses en.')
    args = parser.parse_args()
    if args.output.exists(): parser.error('Output must name a new file.')
    if not 1 <= args.max_urls <= 100000 or not 0 <= args.delay_ms <= 60000: parser.error('Invalid crawl/delay limit.')
    if args.default_locale not in args.locales.split(','): parser.error('Default locale must be one of the expected locales.')
    if args.fixture and args.default_locale != 'en': parser.error('The shipped synthetic fixture uses en as its default; public audits support other explicit defaults.')
    result = {'started_utc': dt.datetime.now(dt.timezone.utc).isoformat(), 'label': 'NOT TESTED', 'scope': 'Read-only robots, all discovered sitemap children and each listed HTML URL; no search-engine eligibility/indexing claim.'}
    fixture = None
    try:
        if args.fixture:
            if sys.version_info[:2] != (3, 13): raise AuditError('fixture-requires-python313')
            spec = importlib.util.spec_from_file_location('shopeasy_seo_fixture', args.app_root / 'qa/run-browser-qa.py')
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            args.simulated_email = False
            fixture = module.Fixture(args).__enter__()
            result['application_runtime'] = fixture.source_fingerprint
            base, canonical_base = fixture.base, 'https://fixture.example.test'
        else:
            base, canonical_base = args.base_url, args.canonical_base or args.base_url
        result.update(audit(base, canonical_base, args.max_urls, args.delay_ms, args.locales.split(','), args.default_locale))
        result['label'] = 'VERIFIED'
    except (AuditError, OSError, URLError, ValueError, UnicodeError) as error:
        result['error_code'] = str(error) if isinstance(error, AuditError) else type(error).__name__
    finally:
        if fixture:
            fixture.__exit__(None, None, None)
            result['temporary_fixture_removed'] = not fixture.private.exists()
        result['finished_utc'] = dt.datetime.now(dt.timezone.utc).isoformat()
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: result.get(key) for key in ('label', 'indexed_urls', 'page_problem_count', 'crawl_complete', 'error_code', 'temporary_fixture_removed')}))
    return 0 if result.get('crawl_complete') and result.get('page_problem_count') == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
