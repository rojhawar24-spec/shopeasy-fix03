import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shopView = fs.readFileSync(new URL('../views/shop.ejs', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

// Tiny EJS-tag evaluation harness for a dependency-free template smoke check.
// It deliberately does NOT replace a test with the real EJS package/server.
// Stubbed includes and empty products isolate the category view's own locals.
function evaluateShopView(view, data) {
  const pieces = view.split(/(<%[-=#]?[\s\S]*?%>)/g);
  let js = 'const output=[]; with (data) {\n';
  for (const piece of pieces) {
    if (!piece.startsWith('<%')) { js += `output.push(${JSON.stringify(piece)});\n`; continue; }
    const body = piece.slice(2, -2);
    if (body.startsWith('#')) continue;
    if (body.startsWith('=') || body.startsWith('-')) {
      js += `output.push(String((${body.slice(1).trim()}) ?? ''));\n`;
    } else {
      js += `${body}\n`;
    }
  }
  js += '} return output.join("");';
  return Function('data', js)(data);
}

const common = {
  include: () => '',
  // Translation is tested separately; this harness isolates category/AI control flow.
  customerText: value => String(value),
  escapeHtml: value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),
  safeImageUrl: value => value,
  locale: 'nl',
  aiEnabled: false, // injected by request middleware on real pages
  appearance: {filterChips: true},
  products: [],
  categories: [
    {id:1,slug:'kleding',name:'Kleding',parent_id:null},
    {id:2,slug:'jassen',name:'Jassen',parent_id:1,product_count:0}
  ],
  search: '', category: '', sort: 'featured', page: 1, hasPrev:false, hasNext:false,
  minPrice:'',maxPrice:'',inStockOnly:false,priceRangeInvalid:false,
  resultCount:0, securityNotice:null,added:false,cartError:null
};

test('category route explicitly supplies aiSearchUsed:false to shared shop template', () => {
  const block = server.slice(server.indexOf("app.get('/category/:slug'"), server.indexOf("app.get('/shop'"));
  assert.ok(block.includes("render(res,'shop'"));
  assert.match(block, /resultCount,aiSearchUsed:false,categoryInfo/);
  assert.match(server, /aiSearchUsed:false,securityNotice:null,categoryInfo:null/);
});

test('category link renders category heading, child category and empty result without AI variable crash', () => {
  const page = evaluateShopView(shopView, {
    ...common,
    category:'kleding',
    categoryInfo:{id:1,slug:'kleding',name:'Kleding',description:'Kleding & meer',image_url:''},
    categoryPath:[{id:1,slug:'kleding',name:'Kleding'}],
    childCategories:[{id:2,slug:'jassen',name:'Jassen',image_url:'',product_count:0}],
    // aiSearchUsed intentionally omitted to simulate legacy /category locals
  });
  assert.match(page, /<h1(?: data-no-translate)?>Kleding<\/h1>/);
  assert.match(page, /href="\/category\/jassen"/);
  assert.match(page, /No products found/);
  assert.doesNotMatch(page, /AI expanded your search/);
});

test('normal shop route still displays AI expansion only when enabled', () => {
  const ordinary = evaluateShopView(shopView, {...common, aiSearchUsed:false, categoryInfo:null, categoryPath:[], childCategories:[]});
  assert.doesNotMatch(ordinary, /AI expanded your search/);
  const expanded = evaluateShopView(shopView, {...common, locale:'en', aiSearchUsed:true, categoryInfo:null, categoryPath:[], childCategories:[]});
  assert.match(expanded, /AI expanded your search/);
});

test('category pagination preserves category route and query filters', () => {
  const page = evaluateShopView(shopView, {
    ...common,
    category:'kleding',search:'warm',page:2,hasPrev:true,hasNext:true,
    aiSearchUsed:false,
    categoryInfo:{id:1,slug:'kleding',name:'Kleding',image_url:''},
    categoryPath:[], childCategories:[],
    products:[{id:6,slug:'winterjas',name:'Winterjas'}]
  });
  assert.match(page, /href="\/category\/kleding\?page=1&category=kleding/);
  assert.match(page, /href="\/category\/kleding\?page=3&category=kleding/);
});

test('regression proof: old unguarded category template throws on missing aiSearchUsed', () => {
  const legacyView = shopView.replace(
    "<% if(typeof aiSearchUsed !== 'undefined' && aiSearchUsed){ %>",
    '<% if(aiSearchUsed){ %>'
  );
  assert.notEqual(legacyView, shopView);
  const categoryState = {...common,category:'kleding',categoryInfo:{id:1,slug:'kleding',name:'Kleding'},categoryPath:[],childCategories:[]};
  assert.throws(() => evaluateShopView(legacyView, categoryState), /aiSearchUsed is not defined/);
  assert.doesNotThrow(() => evaluateShopView(shopView, categoryState));
});

test('Sorani category navigation accepts Unicode slugs and displays child links', () => {
  const parentSlug='جل-وبەرگ';
  const childSlug='ژێر-پۆل';
  const page = evaluateShopView(shopView, {
    ...common, locale:'ckb', category:parentSlug,
    categories:[{id:10,slug:parentSlug,name:'جلوبەرگ',parent_id:null},
      {id:11,slug:childSlug,name:'پۆلی منداڵان',parent_id:10}],
    categoryInfo:{id:10,slug:parentSlug,name:'جلوبەرگ',image_url:''},
    categoryPath:[], childCategories:[{id:11,slug:childSlug,name:'پۆلی منداڵان',product_count:0,image_url:''}]
  });
  assert.match(page, /جلوبەرگ/);
  assert.ok(page.includes(`/category/${encodeURIComponent(childSlug)}`));
});
