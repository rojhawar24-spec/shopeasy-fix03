import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ejs from 'ejs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function localeFixture(locale) {
  const queue = []; let observer;
  class TextNode {
    constructor(value, parent) { this.nodeType = 3; this.value = value; this.parentElement = parent; }
    get nodeValue() { return this.value; }
    set nodeValue(value) { this.value = value; if (observer?.options?.characterData) queue.push({ type: 'characterData', target: this }); }
    get textContent() { return this.nodeValue; } set textContent(value) { this.nodeValue = value; }
  }
  class Element {
    constructor(tag = 'span', value = '', attrs = {}) {
      this.nodeType = 1; this.tag = tag; this.attrs = attrs; this.dataset = {}; this.childNodes = [];
      this.listeners = {}; this.parentElement = null; this.controls = {}; this.classList = { toggle() {} };
      if (value) this.childNodes.push(new TextNode(value, this));
    }
    closest(selector) {
      for (let p = this; p; p = p.parentElement) {
        if (selector.includes('[data-no-translate]') && Object.hasOwn(p.attrs, 'data-no-translate')) return p;
        if (selector.includes('[translate="no"]') && p.attrs.translate === 'no') return p;
        if (selector.includes('[contenteditable="true"]') && p.attrs.contenteditable === 'true') return p;
        if (selector.includes('script,style') && ['script', 'style', 'textarea', 'code', 'pre'].includes(p.tag)) return p;
      }
      return null;
    }
    hasAttribute(key) { return Object.hasOwn(this.attrs, key); }
    getAttribute(key) { return this.attrs[key]; }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    querySelectorAll() { return []; } querySelector(selector) { return this.controls[selector] || null; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    fire(type) { for (const fn of this.listeners[type] || []) fn({}); }
    append(...nodes) { for (const node of nodes) { node.parentElement = this; this.childNodes.push(node); } }
    replaceChildren(...nodes) { this.childNodes = []; this.append(...nodes); }
    get textContent() { return this.childNodes.map(child => child.textContent).join(''); }
    set textContent(value) {
      this.childNodes = [new TextNode(value, this)];
      if (observer?.options?.childList) queue.push({ type: 'childList', addedNodes: this.childNodes });
    }
  }
  const brandTag = read('views/partials/header.ejs').match(/<span class="brand-word"[\s\S]*?<\/span>/)[0];
  const brandHtml = ejs.render(brandTag, { storeName: 'Home' });
  const brandAttrs = {};
  if (/\bdata-no-translate(?:\s|>)/.test(brandHtml)) brandAttrs['data-no-translate'] = '';
  if (/\btranslate="no"/.test(brandHtml)) brandAttrs.translate = 'no';
  const body = new Element('body'), brand = new Element('span', 'Home', brandAttrs);
  const htmlProtected = new Element('span', 'Home', { translate: 'no' });
  const uiText = new Element('span', 'Home'), dynamic = new Element('span', 'Initial runtime text');
  const submit = new Element('button', 'Add to cart');
  body.append(brand, htmlProtected, uiText, dynamic, submit);
  const optionOne = new Element('select'); optionOne.value = '';
  const form = new Element('form'); form.dataset.variantMap = JSON.stringify([
    { id: 1, value: 'M', value2: '', stock: 4, sku: 'HOME-M' }, { id: 2, value: 'S', value2: '', stock: 0, sku: 'HOME-S' }
  ]);
  form.controls = { '[data-option-one-select]': optionOne, '[data-variant-submit]': submit };
  const textNodes = node => node.childNodes.flatMap(child => child.nodeType === 3 ? [child] : textNodes(child));
  const document = {
    documentElement: { lang: locale }, body,
    querySelector: selector => selector === 'h1' ? brand : null,
    querySelectorAll: selector => selector === '[data-product-variant-form]' ? [form] : [],
    createElement: tag => new Element(tag),
    createTreeWalker(element) { let i = -1; const nodes = textNodes(element); return { nextNode() { this.currentNode = nodes[++i]; return i < nodes.length; } }; }
  };
  class MutationObserver { constructor(callback) { this.callback = callback; observer = this; } observe(_, options) { this.options = options; } }
  const context = { Element, document, window: { MutationObserver }, MutationObserver, NodeFilter: { SHOW_TEXT: 4 }, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 } };
  vm.runInNewContext(read(`public/js/i18n-${locale}.js`), context);
  const flush = () => {
    let batches = 0;
    while (queue.length) {
      assert.ok(++batches <= 10, 'translator observer must settle without a feedback loop');
      observer.callback(queue.splice(0));
    }
    return batches;
  };
  return { brand, htmlProtected, uiText, dynamic, submit, optionOne, context, flush, observer, translate: value => context.window.ShopEasyI18n.translate(value) };
}
for (const locale of ['nl', 'fr', 'ar', 'ckb']) {
  test(`FIX03 UI-005 ${locale}: actual header merchant guard and standard translate=no preserve Home while UI copy translates`, () => {
    const f = localeFixture(locale);
    assert.equal(f.brand.textContent, 'Home'); assert.equal(f.htmlProtected.textContent, 'Home');
    assert.equal(f.uiText.textContent, f.translate('Home')); assert.notEqual(f.uiText.textContent, 'Home');
    f.brand.childNodes[0].nodeValue = 'Shop'; f.htmlProtected.childNodes[0].nodeValue = 'Shop'; f.flush();
    assert.equal(f.brand.textContent, 'Shop'); assert.equal(f.htmlProtected.textContent, 'Shop');
  });
  test(`FIX03 UI-004 ${locale}: existing text-node changes translate and observer writes settle`, () => {
    const f = localeFixture(locale);
    assert.equal(f.observer.options.characterData, true);
    f.dynamic.childNodes[0].nodeValue = 'Add to cart';
    const batches = f.flush();
    assert.equal(f.dynamic.textContent, f.translate('Add to cart')); assert.ok(batches <= 2);
    f.dynamic.childNodes[0].nodeValue = 'Sold out'; f.flush();
    assert.equal(f.dynamic.textContent, f.translate('Sold out'));
  });
  test(`FIX03 UI-004 ${locale}: variant labels remain localized in available, sold-out and incomplete states`, () => {
    const f = localeFixture(locale), app = read('public/js/app.js');
    const start = app.indexOf("  document.querySelectorAll('[data-product-variant-form]')");
    const end = app.indexOf("\n  document.querySelectorAll('[data-gallery-image]')", start);
    assert.ok(start >= 0 && end > start);
    vm.runInNewContext(app.slice(start, end), f.context); f.flush();
    assert.equal(f.submit.textContent.trim(), f.translate('Choose options'));
    f.optionOne.value = 'M'; f.optionOne.fire('change'); f.flush();
    assert.equal(f.submit.textContent.trim(), f.translate('Add to cart')); assert.equal(f.submit.disabled, false);
    f.optionOne.value = 'S'; f.optionOne.fire('change'); f.flush();
    assert.equal(f.submit.textContent.trim(), f.translate('Sold out')); assert.equal(f.submit.disabled, true);
  });
}
