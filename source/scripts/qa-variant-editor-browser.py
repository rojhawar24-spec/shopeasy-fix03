"""Optional isolated Chromium regression for Manager's dynamically generated variant rows.
Requires Python playwright and Chromium; does NOT start ShopEasy or test database writes.
Run: python scripts/qa-variant-editor-browser.py
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'AUDIT-R12-EVIDENCE'
OUT.mkdir(exist_ok=True)
HTML='''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Isolated Manager Variant Editor Test (not real website)</title></head><body>
<h1>Isolated Manager variant editor interaction</h1>
<form id="product-save-form">
<label>Use options<input type="checkbox" data-variant-toggle checked></label>
<div data-variant-fields>
<label>First option name<input data-variant-name value="Size"></label>
<label>Second option name<input data-variant-name-two></label>
<label>Matrix one<input data-matrix-values-one placeholder="S, M"></label>
<label data-option-two-values-field hidden>Second values<input data-matrix-values-two placeholder="Red, Blue"></label>
<button type="button" data-generate-matrix>Generate combinations</button>
<div data-variant-editor>
<div data-variant-rows>
<div data-variant-row><label data-variant-label-one>Size<input name="variantValue" data-variant-value value="S"></label><label data-variant-label-two hidden>Second<input name="variantValue2" data-variant-value-two></label><label>Stock<input type="number" data-variant-stock value="2"></label><label>SKU<input data-variant-sku></label><label>Image<input data-variant-image></label><button type="button" data-variant-remove>Remove</button></div>
</div>
<span data-variant-count></span><span data-variant-total-stock></span><p data-variant-validation></p>
<button type="button" data-variant-add>Add combination</button>
</div>
</div>
<label>Base stock<input data-base-stock-input value="10"></label>
<button type="submit">Save draft (disabled in test)</button>
</form></body></html>'''
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1000,'height':800})
    errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    page.set_content(HTML)
    page.add_script_tag(content=(ROOT/'public/js/app.js').read_text(encoding='utf-8'))
    page.locator('[data-variant-add]').click()
    assert page.locator('[data-variant-row]').count()==2
    page.locator('[data-variant-row]').last.locator('[data-variant-value]').fill('M')
    assert page.locator('[data-variant-validation]').inner_text()==''
    page.locator('[data-variant-row]').last.locator('[data-variant-value]').fill('S')
    assert 'unique' in page.locator('[data-variant-validation]').inner_text()
    page.locator('[data-variant-row]').last.locator('[data-variant-value]').fill('M')
    assert page.locator('[data-variant-validation]').inner_text()==''
    page.locator('[data-variant-name]').fill('Colour')
    assert page.locator('[data-variant-row]').last.locator('[data-variant-label-one]').inner_text().startswith('Colour')
    assert page.locator('[data-variant-total-stock]').inner_text()=='2'
    assert not errors,errors
    page.screenshot(path=str(OUT/'isolated-manager-variant-editor.png'),full_page=True)
    results={'mode':'isolated browser DOM; not a live ShopEasy server','row_count':2,'typing_new_row':'PASS','duplicates_flagged':'PASS','duplicates_cleared':'PASS','labels_update':'PASS','stock_total':'PASS','page_errors':errors}
    (OUT/'isolated-variant-result.json').write_text(json.dumps(results,indent=2))
    print(json.dumps(results))
    browser.close()
