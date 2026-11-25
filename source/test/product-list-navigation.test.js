import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductDeleteRedirect } from '../src/product-list-navigation.js';

test('permanent delete preserves the active catalogue filter', () => {
  assert.equal(buildProductDeleteRedirect('active', 'deleted'), '/admin/products?status=active&notice=deleted');
});

test('permanent delete preserves the archived catalogue filter', () => {
  assert.equal(buildProductDeleteRedirect('archived', 'deleted'), '/admin/products?status=archived&notice=deleted');
});

test('all-products view remains unfiltered after permanent delete', () => {
  assert.equal(buildProductDeleteRedirect('all', 'deleted'), '/admin/products?notice=deleted');
  assert.equal(buildProductDeleteRedirect(undefined, 'deleted'), '/admin/products?notice=deleted');
});

test('invalid filter values cannot become a redirect path', () => {
  for (const value of ['https://example.com', '//example.com', '/admin/settings', '../logout', ['archived'], null]) {
    assert.equal(buildProductDeleteRedirect(value, 'deleted'), '/admin/products?notice=deleted');
  }
});

test('only known deletion notices are emitted', () => {
  assert.equal(buildProductDeleteRedirect('archived', 'deleted'), '/admin/products?status=archived&notice=deleted');
  assert.equal(buildProductDeleteRedirect('archived', 'javascript:alert(1)'), '/admin/products?status=archived&notice=deleteFailed');
});
