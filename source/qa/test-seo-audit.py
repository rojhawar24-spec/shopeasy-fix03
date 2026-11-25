"""Negative controls for the read-only crawler's XML/origin/metadata boundaries."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('shopeasy_seo_audit', Path(__file__).with_name('run-seo-audit.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class SeoAuditBoundaries(unittest.TestCase):
    def test_external_or_credentialed_sitemap_locations_are_refused(self):
        for url in ['https://other.example/product/a', 'https://user:secret@shop.example/product/a', 'file:///etc/passwd']:
            with self.assertRaises(audit.AuditError):
                audit.safe_path(url, 'https://shop.example')

    def test_unexpected_token_query_is_not_requested_or_logged(self):
        for query in ['token=fixture-only', 'lang=en&lang=fr', 'page=2&api_key=fixture-only']:
            with self.assertRaises(audit.AuditError):
                audit.safe_path('https://shop.example/shop?' + query, 'https://shop.example')
        self.assertEqual(audit.safe_path('https://shop.example/shop?lang=fr&page=2', 'https://shop.example'), '/shop?lang=fr&page=2')

    def test_xml_doctype_entities_and_wrong_roots_are_refused(self):
        for body in [b'<!DOCTYPE x [<!ENTITY a SYSTEM "file:///fixture-only">]><x/>', b'<html/>', b'<urlset>', b'<urlset xmlns="wrong"/>']:
            with self.assertRaises(audit.AuditError):
                audit.xml_locations(body)

    def test_location_count_and_namespace_are_validated(self):
        prefix = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        for entry in ['<url/>', '<url><loc/></url>', '<url><loc>https://shop.example/a</loc><loc>https://shop.example/b</loc></url>']:
            with self.assertRaises(audit.AuditError):
                audit.xml_locations((prefix + entry + '</urlset>').encode())
        kind, links = audit.xml_locations((prefix + '<url><loc>https://shop.example/shop?lang=fr&amp;page=2</loc></url></urlset>').encode())
        self.assertEqual((kind, links), ('url', ['https://shop.example/shop?lang=fr&page=2']))

    def test_noindex_and_invalid_structured_data_cannot_look_successful(self):
        body = b'<html lang="en" dir="ltr"><title>A</title><meta name="description" content="A"><meta name="robots" content="noindex"><h1>A</h1><script type="application/ld+json">not-json</script></html>'
        result = audit.check_page(body, {}, 'https://shop.example/', ['en'])
        for expected in ['sitemap-url-is-noindex', 'invalid-json-ld', 'canonical-does-not-match-indexed-url', 'missing-hreflang-alternates']:
            self.assertIn(expected, result['problems'])

    def test_default_and_explicit_language_are_checked_without_translating_merchant_names(self):
        body = b'<html lang="fr-BE" dir="ltr"><title>Seller name</title><h1>Seller name</h1><meta name="description" content="Seller text"><link rel="canonical" href="https://shop.example/"><link rel="alternate" hreflang="fr" href="https://shop.example/"><link rel="alternate" hreflang="x-default" href="https://shop.example/"></html>'
        self.assertEqual(audit.check_page(body, {}, 'https://shop.example/', ['fr'], 'fr')['problems'], [])
        self.assertIn('document-language-does-not-match-url', audit.check_page(body, {}, 'https://shop.example/?lang=ar', ['fr', 'ar'], 'fr')['problems'])


if __name__ == '__main__':
    unittest.main()
