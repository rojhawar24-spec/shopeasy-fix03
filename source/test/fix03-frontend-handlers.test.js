import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the delivered handler blocks, with controllable events and transport.
// This is deliberately not browser rendering or an accessibility certification.
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const app = read('public/js/app.js');
const retail = read('public/js/retail-2027.js');
const section = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `handler boundaries: ${start}`);
  return source.slice(a, b);
};
const tick = () => new Promise(resolve => setImmediate(resolve));
function element(extra = {}) {
  const node = {
    listeners: {}, attrs: {}, dataset: {}, children: [], textContent: '', hidden: false,
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); },
    dispatch(type, event = {}) {
      event.target ||= this;
      event.preventDefault ||= function () { this.defaultPrevented = true; };
      event.stopPropagation ||= function () { this.propagationStopped = true; };
      return (this.listeners[type] || []).map(fn => fn(event));
    },
    async fire(type, event = {}) { await Promise.all(this.dispatch(type, event)); return event; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name] ?? null; },
    removeAttribute(name) { delete this.attrs[name]; },
    append(...children) { this.children.push(...children); for (const child of children) child.parentElement = this; },
    replaceChildren(...children) { this.children = []; this.append(...children); },
    contains(other) { return other === this || this.children.some(child => child.contains?.(other)); },
    focus() { this.focused = true; },
    scrollIntoView() { this.scrolled = true; },
    getClientRects() { return [{}]; },
    showModal() { this.open = true; },
    close() { this.open = false; this.dispatch('close'); },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }
  };
  return Object.assign(node, extra);
}
const deferredFetch = () => {
  const pending = [];
  return { pending, fetch: (url, options) => new Promise((resolve, reject) => pending.push({ url, options, resolve, reject })) };
};
const response = data => ({ ok: true, json: async () => data });
function aiFixture() {
  const ask = element(), input = element({ value: 'First question' }), answer = element();
  const transport = deferredFetch();
  const document = { querySelector: () => ask, getElementById: id => id === 'ai-input' ? input : answer };
  vm.runInNewContext(section(app, '  const ask =', '  const priceInput ='), {
    document, window: { ShopEasyI18n: { translate: value => value } }, csrf: 'synthetic-csrf', fetch: transport.fetch
  });
  return { ask, input, answer, ...transport };
}
test('FIX03 UI-001: repeated Enter is serialized and a later question starts only after completion', async () => {
  const f = aiFixture();
  await f.input.fire('keydown', { key: 'Enter' });
  f.input.value = 'Second question';
  await f.input.fire('keydown', { key: 'Enter' });
  assert.equal(f.pending.length, 1);
  assert.equal(f.ask.disabled, true);
  assert.equal(f.answer.getAttribute('aria-busy'), 'true');
  f.pending[0].resolve(response({ answer: 'First answer' })); await tick();
  assert.equal(f.answer.textContent, 'First answer');
  assert.equal(f.ask.disabled, false);
  await f.input.fire('keydown', { key: 'Enter' });
  assert.equal(f.pending.length, 2);
  assert.equal(JSON.parse(f.pending[1].options.body).message, 'Second question');
  f.pending[1].resolve(response({ answer: 'Second answer' })); await tick();
  assert.equal(f.answer.textContent, 'Second answer');
});
test('FIX03 UI-001: failed assistant requests unlock retry without displaying an unsuccessful answer', async () => {
  const f = aiFixture();
  const first = f.ask.fire('click');
  f.pending[0].resolve({ ok: false, json: async () => ({ answer: 'Not a successful answer' }) }); await first;
  assert.equal(f.ask.disabled, false);
  assert.equal(f.answer.getAttribute('aria-busy'), null);
  assert.match(f.answer.textContent, /unavailable/);
  const second = f.ask.fire('click');
  f.pending[1].reject(new Error('Offline')); await second;
  assert.equal(f.ask.disabled, false);
  const third = f.ask.fire('click');
  f.pending[2].resolve(response({ answer: 'Recovered' })); await third;
  assert.equal(f.answer.textContent, 'Recovered');
});
function drawerFixture() {
  const names = ['drawer', 'close', 'items', 'message', 'total', 'checkout'];
  const nodes = Object.fromEntries(names.map(name => [name, element()]));
  const selectors = Object.fromEntries(names.map(name => [`[data-cart-drawer${name === 'drawer' ? '' : '-' + name}]`, nodes[name]]));
  const document = element({ documentElement: { lang: 'en' }, createElement: () => element() });
  const transport = deferredFetch();
  vm.runInNewContext(section(retail, '  // Accessible drawer:', '  // Privacy-preserving suggestion:'), {
    document, q: selector => selectors[selector], text: (_, value) => element({ textContent: value }),
    sellerText: (_, value) => element({ textContent: value }), Intl, AbortController, fetch: transport.fetch
  });
  const link = element(); link.closest = selector => selector === '[data-cart-drawer-trigger]' ? link : null;
  return { ...nodes, ...transport, open: () => document.fire('click', { target: link, button: 0 }) };
}
const cart = name => ({ currency: 'EUR', items: [{ name, quantity: 1, total: 200 }], total: 200, checkoutHref: '/checkout', hasStockIssues: false });
test('FIX03 UI-002: late drawer response cannot merge rows or replace the reopened total', async () => {
  const f = drawerFixture();
  const old = f.open();
  await f.close.fire('click');
  assert.equal(f.pending[0].options.signal.aborted, true);
  const current = f.open();
  f.pending[1].resolve(response(cart('Current'))); await current;
  f.pending[0].resolve(response({ ...cart('Stale'), total: 100 })); await old;
  assert.equal(f.items.children.length, 1);
  assert.equal(f.items.children[0].children[0].textContent, 'Current');
  assert.match(f.total.textContent, /2\.00/);
  assert.equal(f.checkout.hidden, false);
});
test('FIX03 UI-002: a failed or closed drawer never retains an earlier checkout action', async () => {
  const f = drawerFixture();
  const first = f.open(); f.pending[0].resolve(response(cart('First'))); await first;
  await f.close.fire('click');
  const failed = f.open();
  assert.equal(f.checkout.hidden, true); assert.equal(f.items.children.length, 0);
  f.pending[1].reject(new Error('Offline')); await failed;
  assert.match(f.message.textContent, /unavailable/);
  assert.equal(f.checkout.hidden, true); assert.equal(f.total.textContent, '');
  const closing = f.open(); await f.close.fire('click');
  f.pending[2].resolve(response(cart('Closed'))); await closing;
  assert.equal(f.items.children.length, 0); assert.equal(f.checkout.hidden, true);
});
function formatter(intl = Intl) {
  const context = { document: { documentElement: { lang: 'en' } }, Intl: intl };
  // The helper now precedes request invalidation; no behavior is reimplemented.
  vm.runInNewContext(section(retail, '    const fmt=', '    const invalidateRequest=') + '\nglobalThis.format = fmt;', context);
  return context.format;
}
test('FIX03 UI-003: supported zero, two and three decimal currencies use explicit precision', () => {
  const format = formatter();
  for (const [code, digits] of [['IQD', 3], ['KWD', 3], ['EUR', 2], ['USD', 2], ['JPY', 0], ['VND', 0], ['ISK', 0]]) {
    const expected = new Intl.NumberFormat('en', { style: 'currency', currency: code, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(1234 / 10 ** digits);
    assert.equal(format(1234, code.toLowerCase()), expected, code);
  }
});
test('FIX03 UI-003: formatter failure preserves major-unit scale rather than exposing raw minor units', () => {
  const format = formatter({ NumberFormat: function () { throw new Error('Unavailable locale'); } });
  assert.equal(format(1234, 'IQD'), '1.234 IQD');
  assert.equal(format(1234, 'EUR'), '12.34 EUR');
  assert.equal(format(1234, 'JPY'), '1234 JPY');
  const context = { Intl: { NumberFormat: function () { throw new Error('Unavailable locale'); } } };
  vm.runInNewContext(section(app, '  const ISO_CURRENCY_DIGITS', '  // Messages produced') + '\nglobalThis.digits = currencyFractionDigits;', context);
  assert.equal(context.digits('iqd'), 3); assert.equal(context.digits('JPY'), 0); assert.equal(context.digits('EUR'), 2);
});
test('FIX03 UI-007: modifiers and non-primary photo clicks retain native navigation; normal click opens current image', async () => {
  const link = element(), large = element(), close = element();
  const stage=element(), root=element();
  const main = element({ currentSrc: 'https://shop.example.test/uploads/old.webp', alt: 'Selected', parentElement:stage });
  main.setAttribute('src','/uploads/selected.webp');
  const dialog = element({ querySelector: selector => selector === '[data-product-photo-large]' ? large : close });
  const nodes = { '[data-product-photo-expand]': link, '[data-product-photo-dialog]': dialog, '[data-product-main-image]': main };
  root.querySelector=selector=>nodes[selector];
  let observer;
  class MutationObserver {constructor(fn){observer=fn;} observe(){}}
  vm.runInNewContext(read('public/js/product-photo-zoom.js'), {
    document: { querySelector: selector => selector==='[data-product-gallery]'?root:null,documentElement:{lang:'en-GB',dir:'ltr'},baseURI:'https://shop.example.test/product/test',body:{dataset:{motion:'off'}} },
    URL,MutationObserver,matchMedia:()=>({matches:true})
  });
  for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
    const event = await link.fire('click', { button: 0, [modifier]: true });
    assert.ok(!event.defaultPrevented); assert.ok(!dialog.open);
  }
  for (const button of [1, 2]) { const event = await link.fire('click', { button }); assert.ok(!event.defaultPrevented); }
  const normal = await link.fire('click', { button: 0 });
  assert.equal(normal.defaultPrevented, true); assert.equal(dialog.open, true); assert.equal(large.src, 'https://shop.example.test/uploads/selected.webp');
  main.setAttribute('src','/uploads/new-variant.webp'); observer();
  assert.equal(large.src,'https://shop.example.test/uploads/new-variant.webp');
  await close.fire('click'); assert.equal(link.focused, true);
});
function stepperFixture({ prevent = false, valid = true } = {}) {
  const input = element({ value: '1', min: '1', max: '10' });
  let submissions = 0;
  const form = element({ querySelector: () => input, requestSubmit() {
    if (!valid) return;
    const event = { preventDefault() { this.defaultPrevented = true; } };
    if (prevent) event.preventDefault();
    this.dispatch('submit', event);
    if (!event.defaultPrevented) submissions++;
  } });
  const button = element({ dataset: { cartQtyStep: '1' }, closest: () => form });
  const window = element();
  const document = { readyState: 'complete', querySelector: () => null, getElementById: () => null,
    querySelectorAll: selector => selector.includes('[data-cart-qty-step]') ? [button] : selector === 'form[data-cart-submitting]' && form.dataset.cartSubmitting ? [form] : [] };
  vm.runInNewContext(app.slice(app.indexOf('/* R18: Progressive catalogue')), { window, document });
  return { button, input, form, window, submissions: () => submissions };
}
test('FIX03 UI-RISK-01: cart duplicate guard resets on a persisted pageshow', async () => {
  const f = stepperFixture();
  await f.button.fire('click'); await f.button.fire('click');
  assert.equal(f.submissions(), 1); assert.equal(f.input.value, '2');
  await f.window.fire('pageshow', { persisted: true }); await f.button.fire('click');
  assert.equal(f.submissions(), 2); assert.equal(f.input.value, '3');
});
test('FIX03 UI-RISK-01: prevented or invalid submissions do not permanently lock the cart controls', async () => {
  for (const options of [{ prevent: true }, { valid: false }]) {
    const f = stepperFixture(options); await f.button.fire('click'); await f.button.fire('click');
    assert.equal(f.form.dataset.cartSubmitting, undefined); assert.equal(f.submissions(), 0); assert.equal(f.input.value, '3');
  }
});
function searchFixture() {
  const input = element({ value: 'bag' }), results = element({ hidden: true }), box = element();
  box.append(input, results); box.querySelector = () => results; input.closest = () => box;
  input.setAttribute('aria-label', 'Search products');
  const document = element({ querySelectorAll: () => [input], createElement: () => element() });
  const transport = deferredFetch(); let timer = null; const navigations = [];
  vm.runInNewContext(section(app, '  const searchInputs =', "  document.querySelectorAll('[data-wishlist-toggle]')"), {
    document, window: { location: { assign: href => navigations.push(href) }, ShopEasyI18n: { translate: value => value } },
    AbortController, fetch: transport.fetch, setTimeout: fn => { timer = fn; return 1; }, clearTimeout: () => { timer = null; }
  });
  return { input, results, box, document, ...transport, navigations, debounce: () => { const fn = timer; timer = null; return fn?.(); }, announcement: box.children[2] };
}
const suggestions = names => ({ results: names.map(name => ({ name, slug: name.toLowerCase(), price: '€1.00' })) });
test('FIX03 UI-RISK-02: combobox arrows announce active results and Enter follows the chosen product', async () => {
  const f = searchFixture(); await f.input.fire('input'); const pending = f.debounce();
  f.pending[0].resolve(response(suggestions(['Home', 'Bag']))); await pending;
  assert.equal(f.input.getAttribute('role'), 'combobox');
  assert.equal(f.results.getAttribute('role'), 'listbox');
  assert.equal(f.input.getAttribute('aria-expanded'), 'true'); assert.equal(f.announcement.textContent, '2 Products');
  let event = await f.input.fire('keydown', { key: 'ArrowDown' }); assert.equal(event.defaultPrevented, true);
  assert.equal(f.input.getAttribute('aria-activedescendant'), f.results.children[0].id);
  assert.equal(f.results.children[0].getAttribute('aria-selected'), 'true');
  await f.input.fire('keydown', { key: 'ArrowUp' });
  assert.equal(f.input.getAttribute('aria-activedescendant'), f.results.children[1].id);
  event = await f.input.fire('keydown', { key: 'Enter' });
  assert.equal(event.defaultPrevented, true); assert.deepEqual(f.navigations, ['/product/bag']);
  assert.equal(f.results.children[0].children[1].children[0].textContent, 'Home');
  assert.equal(f.results.children[0].children[1].children[0].getAttribute('translate'), 'no');
  await f.input.fire('keydown', { key: 'Escape' });
  assert.equal(f.results.hidden, true);
  await f.input.fire('keydown', { key: 'ArrowDown' });
  assert.equal(f.results.hidden, false);
  assert.equal(f.input.getAttribute('aria-activedescendant'), f.results.children[0].id);
});
test('FIX03 UI-RISK-02: Escape closes suggestions and aborts pending work without reopening on a late result', async () => {
  const f = searchFixture(); await f.input.fire('input'); const pending = f.debounce();
  const event = await f.input.fire('keydown', { key: 'Escape' });
  assert.equal(event.defaultPrevented, true); assert.equal(event.propagationStopped, true);
  assert.equal(f.pending[0].options.signal.aborted, true);
  f.pending[0].resolve(response(suggestions(['Late']))); await pending;
  assert.equal(f.results.hidden, true); assert.equal(f.input.getAttribute('aria-expanded'), 'false');
  assert.equal(f.input.getAttribute('aria-busy'), null); assert.equal(f.input.getAttribute('aria-activedescendant'), null);
});
test('FIX03 UI-RISK-02: old search responses cannot replace newer suggestions or clear their busy state', async () => {
  const f = searchFixture(); await f.input.fire('input'); const old = f.debounce();
  f.input.value = 'new'; await f.input.fire('input'); const current = f.debounce();
  f.pending[0].resolve(response(suggestions(['Old']))); await old;
  assert.equal(f.input.getAttribute('aria-busy'), 'true');
  f.pending[1].resolve(response(suggestions(['New']))); await current;
  assert.equal(f.results.children.length, 1); assert.equal(f.results.children[0].href, '/product/new');
  assert.equal(f.input.getAttribute('aria-busy'), null);
});
test('FIX03 UI-RISK-02: Tab and outside focus dismiss suggestions while ordinary Enter retains form submission', async () => {
  const f = searchFixture(); await f.input.fire('input'); const pending = f.debounce();
  f.pending[0].resolve(response(suggestions(['Bag']))); await pending;
  let event = await f.input.fire('keydown', { key: 'Enter' }); assert.ok(!event.defaultPrevented); assert.equal(f.navigations.length, 0);
  event = await f.input.fire('keydown', { key: 'Tab' }); assert.ok(!event.defaultPrevented); assert.equal(f.results.hidden, true);
  await f.input.fire('input'); const again = f.debounce(); f.pending[1].resolve(response(suggestions(['Bag']))); await again;
  await f.box.fire('focusout', { relatedTarget: element() }); assert.equal(f.results.hidden, true);
});
test('FIX03 UI-RISK-02: empty/error results announce recovery and clearing input cancels loading', async () => {
  const f = searchFixture(); await f.input.fire('input'); let pending = f.debounce();
  f.pending[0].reject(new Error('Offline')); await pending;
  assert.match(f.announcement.textContent, /temporarily unavailable/);
  await f.input.fire('input'); pending = f.debounce(); f.pending[1].resolve(response(suggestions([]))); await pending;
  assert.equal(f.announcement.textContent, 'No matching products');
  await f.input.fire('input'); pending = f.debounce();
  f.input.value = ''; await f.input.fire('input');
  f.pending[2].resolve(response(suggestions(['Stale']))); await pending;
  assert.equal(f.results.hidden, true); assert.equal(f.results.children.length, 0); assert.equal(f.input.getAttribute('aria-busy'), null);
});
