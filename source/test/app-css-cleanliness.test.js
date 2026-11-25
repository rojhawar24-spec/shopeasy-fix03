import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const css = read('public/css/app.css');
const rootBlock = css.match(/:root\s*\{([^}]*)\}/s)?.[1] ?? '';

test('app.css has no invisible formatting/control characters', () => {
  assert.doesNotMatch(css, /[\u00ad\u200b\u200c\u200d\u2060\ufeff]/);
});

test('system font fallbacks and font licensing strategy are explicit', () => {
  const tokens=read('public/css/design-tokens.css');
  const notes=read('FONT-ASSETS-NOT-REDISTRIBUTED.md');
  assert.match(tokens,/--font-sorani:/,'Sorani needs an explicit RTL-script font stack');
  assert.match(tokens,/--font-arabic:/,'Arabic needs an explicit script-specific font stack');
  assert.match(css,/font-family:\s*var\(--font-sorani\)/,'CKB text must use its font stack');
  assert.match(notes,/system-font fallbacks/,'the non-bundled font strategy must be documented');
  assert.doesNotMatch(css, /@import\s+(?:url\()?['"]?https?:\/\//, 'do not load third-party font CSS before cookie consent');
});

test('every CSS custom property reference resolves and all root tokens are used', () => {
  const declared = new Set([...rootBlock.matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name));
  const referenced = new Set([...css.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, name]) => name));
  assert.ok(declared.size > 0, 'design tokens must exist');
  assert.deepEqual([...referenced].filter(name => !declared.has(name)).sort(), [], 'undefined token reference');
  assert.deepEqual([...declared].filter(name => !referenced.has(name)).sort(), [], 'unused root token');
});

test('literal color values are centralized in the root design tokens', () => {
  const rootStart = css.search(/:root\s*\{/);
  assert.notEqual(rootStart, -1);
  let depth = 0;
  let rootEnd = -1;
  for (let i = css.indexOf('{', rootStart); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}' && --depth === 0) { rootEnd = i + 1; break; }
  }
  assert.notEqual(rootEnd, -1, ':root block must close');
  const outsideRoot = css.slice(0, rootStart) + css.slice(rootEnd);
  assert.doesNotMatch(outsideRoot, /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/i);
});

test('mobile storefront header has room for both search and menu controls', () => {
  assert.match(css, /@media\s*\(max-width:\s*639px\)\s*\{[\s\S]*?\.nav-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto/s);
  assert.match(css, /\.storefront-search-toggle\s*\{[^}]*inline-size:\s*var\(--control-size-compact\)[^}]*block-size:\s*var\(--control-size-compact\)/s);
  assert.match(css, /\.storefront-mobile-search input\[data-search-input\]\s*\{[^}]*min-block-size:\s*var\(--space-48\)/s);
});

test('global page heading stays content-flow based; only named page families use flex', () => {
  const base = css.match(/(?:^|\n)\.page-head\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.ok(base, 'base .page-head rule must exist');
  assert.doesNotMatch(base, /display\s*:\s*flex/);
  assert.match(css, /\.page-head\.admin-head,[\s\S]*?\.page-head\.checkout-head\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.category-context\s*\{[^}]*gap:\s*var\(--space-24\)/s);
  assert.match(css, /\.category-card-overlay\s*\{[^}]*align-items:\s*flex-end[^}]*justify-content:\s*space-between/s);
});

test('obsolete search comments and candidate-only wording are removed', () => {
  assert.doesNotMatch(css, /current EJS has no search-toggle|separate candidate only|previously unmatched storefront classes/i);
});
