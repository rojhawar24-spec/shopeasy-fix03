from pathlib import Path
import json, re, base64
from playwright.sync_api import sync_playwright
root=Path('/mnt/data/shopeasy_r21_hard_audit')
out=root/'AUDIT-R21-EVIDENCE';out.mkdir(exist_ok=True)
cssfiles=['app.css','design-tokens.css','retail-2027.css','editorial-2027.css','research-polish-2027.css']
style=''.join('<style>'+ (root/'public/css'/f).read_text() + '</style>' for f in cssfiles)
manager=(root/'AUDIT-R17-EVIDENCE/R17-STATIC-manager.html').read_text()
cat=(root/'AUDIT-R17-EVIDENCE/R17-STATIC-catalog.html').read_text()
cart=(root/'AUDIT-R17-EVIDENCE/R17-STATIC-cart.html').read_text()
cookies=(root/'AUDIT-R17-EVIDENCE/R17-STATIC-cookies.html').read_text()
def style_inline(s):
    for f in cssfiles:
        s=s.replace(f'<link rel="stylesheet" href="../public/css/{f}">','<style>'+ (root/'public/css'/f).read_text()+'</style>')
    return s
mockimg=[]
for f in ('preview-backpack.svg','preview-lamp.svg','preview-bottle.svg'):
    mockimg.append('data:image/svg+xml;base64,'+base64.b64encode((root/'public/assets'/f).read_bytes()).decode())
mockcards=''.join(f'''<article class="product-card product-card-signature"><div class="product-media"><a href="#" class="product-image"><img src="{img}" alt="Sample product"></a></div><div class="product-card-body"><span class="product-category">Everyday essentials</span><h3><a href="#">{'Everyday Backpack' if i==0 else 'Studio Lamp' if i==1 else 'Water Bottle'}</a></h3><p>Useful and beautifully made for every day.</p><div class="price"><strong>€{69+i*20}.00</strong></div><a href="#" class="btn btn-dark btn-small">View product</a></div></article>''' for i,img in enumerate(mockimg))
cat=cat.replace('<form class="shop-controls" method="get"', '<div class="shop-filter-mobile-bar" data-shop-filter-mobile-bar><button type="button" class="shop-filter-toggle" data-shop-filter-toggle aria-expanded="true" aria-controls="shop-filter-form"><span aria-hidden="true">☷</span> Filters &amp; sort <span class="shop-filter-count">1</span> <span class="shop-filter-chevron">⌄</span></button><span class="shop-mobile-result-count"><strong>3</strong> products</span></div><form id="shop-filter-form" class="shop-controls" method="get"',1)
cat=cat.replace('</form><div class="shop-toolbar">','</form><div class="shop-results"><div class="shop-toolbar">',1)
cat=cat.replace('<h2>Featured products</h2></section>','<div class="result-heading"><strong>3 products</strong></div><div class="product-grid shop-grid">'+mockcards+'</div></div></section>',1)
cat=cat.replace('</body>', '<script>'+ (root/'public/js/app.js').read_text()+'</script></body>')
cart=cart.replace('<form class="qty-form"><input type="number" value="1" min="1"><button type="button">Update</button></form>', '<form class="qty-form"><div class="cart-qty-stepper"><button type="button" data-cart-qty-step="-1">−</button><input type="number" name="quantity" value="1" min="1" max="99"><button type="button" data-cart-qty-step="1">+</button></div><button type="submit" class="cart-qty-update">Update</button></form>')
cart=cart.replace('src="../public/assets/preview-backpack.svg"', 'src="'+mockimg[0]+'"')
cart=cart.replace('</body>', '<script>'+ (root/'public/js/app.js').read_text()+'</script></body>')
# Keep cookies script but mock localStorage for deterministic lifecycle
cookie_js=(root/'public/js/app.js').read_text()
cookies=cookies.replace('<script src="../public/js/app.js" defer></script>', '''<script>window.__testCookieStore={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>window.__testCookieStore[k]??null,setItem:(k,v)=>window.__testCookieStore[k]=String(v),removeItem:k=>delete window.__testCookieStore[k]}});</script><script>'''+cookie_js+'</script>')
fixtures={'manager':style_inline(manager),'catalog':style_inline(cat),'cart':style_inline(cart),'cookies':style_inline(cookies)}
for k,html in fixtures.items(): (out/f'R21-STATIC-{k}.html').write_text(html)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    results=[]
    for name,html in fixtures.items():
        for width in (390,768,1440):
            for theme in ('light','dark'):
                for direction in ('ltr','rtl'):
                    context=browser.new_context(viewport={'width':width,'height':900})
                    page=context.new_page(); errors=[]
                    page.on('pageerror',lambda e:errors.append(str(e)))
                    page.set_content(html, wait_until='load');page.evaluate('''({theme,direction})=>{document.documentElement.dataset.theme=theme;document.documentElement.dir=direction}''',{'theme':theme,'direction':direction})
                    page.wait_for_timeout(65)
                    data=page.evaluate('''() => ({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,hiddenVisible:[...document.querySelectorAll('[hidden]')].filter(e=>{let r=e.getBoundingClientRect();return getComputedStyle(e).display!=='none'&&r.width>0&&r.height>0}).length,offscreen:[...document.querySelectorAll('button,a,input,select')].filter(e=>{let s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0&&(r.left < -2||r.right>innerWidth+2)}).map(e=>e.outerHTML.slice(0,80)).slice(0,5)})''')
                    results.append({'name':name,'width':width,'theme':theme,'dir':direction,**data,'errors':errors})
                    if width in (390,1440) and direction=='ltr':page.screenshot(path=str(out/f'R21-STATIC-{name}-{theme}-{width}.png'),full_page=name!='cookies')
                    context.close()
    # Actual UI control assertions on a page containing R18 CSS and R18 app.js
    context=browser.new_context(viewport={'width':390,'height':850})
    page=context.new_page();page.set_content(fixtures['catalog']); page.wait_for_timeout(100)
    filter_checks={'mobileToggleVisible':page.locator('[data-shop-filter-toggle]').is_visible(),'mobileInitiallyCollapsed':not page.locator('#shop-filter-form').is_visible()}
    page.locator('[data-shop-filter-toggle]').click()
    filter_checks['mobileOpens']=page.locator('#shop-filter-form').is_visible()
    filter_checks['ariaExpanded']=page.locator('[data-shop-filter-toggle]').get_attribute('aria-expanded') == 'true'
    page.set_viewport_size({'width':1440,'height':900});page.wait_for_timeout(150)
    filter_checks['desktopShowsFilters']=page.locator('#shop-filter-form').is_visible()
    context.close()
    context=browser.new_context(viewport={'width':390,'height':850})
    page=context.new_page();page.set_content(fixtures['cart']);page.wait_for_timeout(60)
    page.evaluate('''() => {const form=document.querySelector('.qty-form');form.requestSubmit=()=>{window.__r18QtySubmit=true}}''')
    page.locator('[data-cart-qty-step="1"]').click()
    cart_checks={'incremented':page.locator('input[name=quantity]').input_value() == '2', 'submittedExistingForm':page.evaluate('Boolean(window.__r18QtySubmit)')}
    context.close()
    context=browser.new_context(viewport={'width':390,'height':850})
    page=context.new_page();page.set_content(fixtures['cookies']);page.wait_for_timeout(90)
    cookie_checks={'firstVisit':page.locator('[data-cookie-banner]').is_visible()}
    page.locator('[data-cookie-reject]').first.click()
    cookie_checks['rejectCloses']=not page.locator('[data-cookie-banner]').is_visible()
    cookie_checks['choiceStored']=page.evaluate('Boolean(window.__testCookieStore["shopeasy-cookie-choice-v1"])')
    context.close();browser.close()
summary={'screens':len(results),'overflow':[x for x in results if x['sw']>x['cw']+2],'visibleHidden':[x for x in results if x['hiddenVisible']],'offscreen':[x for x in results if x['offscreen']],'errors':[x for x in results if x['errors']],'filters':filter_checks,'cart':cart_checks,'cookies':cookie_checks}
(out/'R21-VISUAL-RESULTS.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False))
print(json.dumps({k:(len(v) if isinstance(v,list) else v) for k,v in summary.items()},ensure_ascii=False,indent=2))
for k in ('overflow','visibleHidden','offscreen','errors'):
    for x in summary[k][:3]:print(k,x)
