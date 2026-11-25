"""Browser layout inspection of shipped STATIC PREVIEW HTML, not the EJS server.
Runs desktop, tablet, mobile, light, dark and RTL; saves representative screenshots.
Requires Python playwright + Chromium. Outputs AUDIT-R12-EVIDENCE.
"""
from pathlib import Path
import re,base64,json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
out=root/'AUDIT-R12-EVIDENCE';out.mkdir(exist_ok=True)
css_files=['app.css','design-tokens.css','retail-2027.css','editorial-2027.css','research-polish-2027.css']
css='\n'.join((root/'public/css'/fn).read_text(encoding='utf8') for fn in css_files)
files=['PREVIEW.html','PREVIEW-MANAGER.html','PREVIEW-CHECKOUT-R7.html','PREVIEW-ORDER-R7.html','PREVIEW-CART-R7.html','PREVIEW-SHOP-R6.html','PREVIEW-PRODUCT-R6.html']
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for filename in files:
  doc=(root/filename).read_text(encoding='utf8')
  doc=re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>', '',doc,flags=re.I)
  doc=doc.replace('</head>',f'<style>{css}</style></head>')
  def embedded(match):
   url=match.group(2).split('?')[0]
   path=(root/url).resolve()
   if not path.is_relative_to(root) or not path.is_file(): return match.group(0)
   mime={'.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg'}.get(path.suffix.lower())
   if not mime:return match.group(0)
   return match.group(1)+'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode()+'"'
  doc=re.sub(r'(src=")([.]\/public\/assets\/[^"\s]+)"',embedded,doc)
  for width,height,theme,direction in [(w,h,t,'ltr') for w,h in [(390,844),(768,1024),(1440,900)] for t in ['light','dark']]+[(390,844,'light','rtl'),(390,844,'dark','rtl')]:
   page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
   errors=[];page.on('pageerror',lambda exc:errors.append(str(exc)))
   page.set_content(doc,wait_until='load')
   page.evaluate('''({theme, direction}) => {
     document.documentElement.dir=direction;
     if(theme==='dark')document.documentElement.dataset.theme='dark'; else delete document.documentElement.dataset.theme;
   }''',{'theme':theme,'direction':direction})
   # Run current storefront interaction sources, even on static visual samples.
   page.add_script_tag(content=(root/'public/js/retail-2027.js').read_text(encoding='utf8'))
   page.add_script_tag(content=(root/'public/js/app.js').read_text(encoding='utf8'))
   page.wait_for_timeout(20)
   metrics=page.evaluate('''() => {
      const cw=document.documentElement.clientWidth;
      const hiddenLeaks=[...document.querySelectorAll('[hidden]')].filter(el=>getComputedStyle(el).display!=='none').map(el=>String(el.className||'').slice(0,70));
      const buttons=[...document.querySelectorAll('button')].filter(el=>{
        const r=el.getBoundingClientRect(),s=getComputedStyle(el);
        return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;
      });
      const missingNames=buttons.filter(el=>!(el.getAttribute('aria-label')||el.textContent.trim()||el.getAttribute('title'))).map(el=>String(el.className||'').slice(0,70));
      const offscreenButtons=buttons.filter(el=>{
        const r=el.getBoundingClientRect();return r.left < -5 || r.right > cw+5;
      }).slice(0,10).map(el=>({cls:String(el.className||'').slice(0,65),label:String(el.textContent||'').trim().slice(0,50)}));
      return {scrollWidth:document.documentElement.scrollWidth,clientWidth:cw,hiddenLeaks,visibleButtons:buttons.length,missingButtonNames:missingNames,offscreenButtons};
   }''')
   selected=width==390 and direction=='rtl' and theme=='dark' or (direction=='ltr' and (width==390 and theme=='dark' or width==1440 and theme=='light'))
   if selected:page.screenshot(path=str(out/f'{filename[:-5]}-{theme}-{direction}-{width}.png'),full_page=True)
   results.append({'file':filename,'width':width,'theme':theme,'direction':direction,'pageErrors':errors,**metrics})
   page.close()
 browser.close()
(out/'preview-browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print('runs',len(results),'full-page overflows',sum(r['scrollWidth']>r['clientWidth'] for r in results),'hidden leaks',sum(bool(r['hiddenLeaks']) for r in results),'JS page errors',sum(bool(r['pageErrors']) for r in results),'nameless buttons',sum(bool(r['missingButtonNames']) for r in results),'offscreen buttons',sum(bool(r['offscreenButtons']) for r in results))
for item in results:
 if item['scrollWidth']>item['clientWidth'] or item['hiddenLeaks'] or item['pageErrors'] or item['missingButtonNames'] or item['offscreenButtons']:
  print(item['file'],item['width'],item['theme'],item['direction'],'overflow',item['scrollWidth']-item['clientWidth'],'pageErrors',item['pageErrors'][:2],'hidden',item['hiddenLeaks'][:3],'nameless',item['missingButtonNames'][:3],'offscreen',item['offscreenButtons'][:3])
