"""CSS-only fixtures; NOT EJS server renders or real customer journeys."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parent.parent
out=root/'AUDIT-R10-EVIDENCE';out.mkdir(exist_ok=True)
styles=['app.css','design-tokens.css','retail-2027.css','editorial-2027.css','research-polish-2027.css']
fixture='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R10 manager layout sample — NOT live EJS</title></head>
<body class="is-admin-app"><header class="site-header"><div class="container nav-row"><a class="brand" href="/admin"><span>ShopEasy / Manager</span></a><div class="admin-header-actions"><button class="theme-toggle theme-toggle-admin" data-theme-toggle type="button">☾</button><a href="/admin/staff">Account</a><form class="admin-header-logout"><button type="button">Log out</button></form></div></div></header>
<main id="main-content" class="admin-main"><div class="container"><div class="page-head admin-head"><span class="eyebrow">CATALOGUE</span><h1>Add product</h1><p>Add clear product information. Leave the item hidden until it has real photos and checked pricing.</p></div>
<nav class="product-editor-steps" aria-label="Product editor sections"><a href="#product-details">01 <span>Information</span></a><a href="#product-pricing">02 <span>Pricing</span></a><a href="#product-stock">03 <span>Inventory</span></a><a href="#product-images">04 <span>Photos</span></a><a href="#product-visibility">05 <span>Publish</span></a></nav>
<div class="product-editor-guide" role="note"><div><span class="eyebrow">PUBLISHING CHECK</span><strong>Keep incomplete products as a draft.</strong><p>Check product photos, stock, customer prices, delivery coverage and returns before advertising.</p></div><a class="btn btn-light btn-small" href="/admin/settings">Store policies →</a></div>
<form class="panel form-stack product-editor-form"><section class="form-section" id="product-details"><span class="eyebrow">01 / PRODUCT DETAILS</span><h2>Product information</h2><label>Product name *<input name="name" required placeholder="Everyday Backpack"></label><div class="form-two"><label>Product code<input name="sku" placeholder="Auto-generated"></label><label>Category<select><option>Clothing</option></select></label></div><label>Short description<textarea rows="3"></textarea></label></section>
<section class="form-section" id="product-pricing"><span class="eyebrow">02 / PRICING</span><h2>Price and purchase cost</h2><div class="form-two"><label>Regular price *<input name="price" value="39.00"></label><label>Purchase cost *<input name="costPrice" value="16.00"></label></div></section>
<section class="form-section" id="product-stock"><span class="eyebrow">03 / STOCK &amp; OPTIONS</span><h2>Stock and product options</h2><label>Available units<input type="number" value="12"></label></section>
<section class="form-section" id="product-images"><span class="eyebrow">04 / PRODUCT IMAGES</span><h2>Product gallery</h2><p>Upload your own product photographs.</p><input type="file" accept="image/png,image/jpeg,image/webp"></section>
<section class="form-section" id="product-visibility"><span class="eyebrow">05 / VISIBILITY</span><h2>Publish product</h2><label><input type="checkbox"> Visible in the shop</label></section>
<div class="product-editor-save-actions"><button class="btn btn-mint" type="button">Save product</button><a href="/admin/products" class="btn btn-light">Back to products</a></div></form></div></main>
<section class="language-suggestion" hidden><p>This should remain hidden</p></section>
</body></html>'''
results=[]
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,theme,rtl in [(1440,'light',False),(1440,'dark',False),(390,'light',False),(390,'dark',False),(768,'dark',True),(390,'dark',True)]:
  page=b.new_page(viewport={'width':width,'height':900},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
  page.set_content(fixture,wait_until='domcontentloaded')
  for name in styles:page.add_style_tag(content=(root/'public/css'/name).read_text())
  if theme=='dark':page.evaluate("document.documentElement.dataset.theme='dark'")
  if rtl:page.evaluate("document.documentElement.dir='rtl'; document.documentElement.lang='ar'")
  page.wait_for_timeout(100)
  result=page.evaluate('''() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,hidden:getComputedStyle(document.querySelector('.language-suggestion')).display,links:[...document.querySelectorAll('.product-editor-steps a')].every(a=>document.querySelector(a.getAttribute('href'))),buttons:[...document.querySelectorAll('button')].every(b=>b.getBoundingClientRect().width>=24)})''')
  result.update({'theme':theme,'rtl':rtl,'pageerrors':errors,'pass':result['scrollWidth']<=width+1 and result['hidden']=='none' and result['links'] and result['buttons'] and not errors})
  results.append(result)
  if (width,theme,rtl) in [(1440,'light',False),(1440,'dark',False),(390,'light',False),(390,'dark',False),(390,'dark',True)]:
   page.screenshot(path=str(out/f'R10-STATIC-manager-product-{theme}-{width}{"-rtl" if rtl else ""}.png'),full_page=True)
  page.close()
 b.close()
(out/'r10_layout_results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
for x in results: print(('PASS' if x['pass'] else 'FAIL'),x)
print('STATIC FIXTURE PASS',sum(x['pass'] for x in results),'/',len(results),'— NOT a live application render')
