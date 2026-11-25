/**
 * Google Ads / Merchant Center preflight for ShopEasy, without analytics tags.
 * Static checks are not Google approval. Live mode only issues anonymous GET
 * requests to a merchant-supplied public HTTPS host and never triggers orders.
 * Usage: npm run audit:ads -- --static
 *        npm run audit:ads -- --url https://your-real-store.example
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {isIP} from 'node:net';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=filename=>fs.readFileSync(path.join(root,filename),'utf8');
const routeNames=['/','/shop','/contact','/imprint','/shipping-returns','/terms','/privacy','/cookies'];
const source=read('src/server.js');
const header=read('views/partials/header.ejs');
const footer=read('views/partials/footer.ejs');
const checks=[];
function check(name,okay,detail=''){checks.push({name,result:okay?'PASS':'FAIL',detail});}
check('Public store routes',routeNames.every(route=>source.includes(`app.get('${route}'`)),'Declared GET routes; not live-tested');
check('Sitemap and robots endpoints',source.includes("app.get('/sitemap.xml'")&&source.includes("app.get('/robots.txt'"));
check('Legal, contact and returns linked', ['/contact','/imprint','/shipping-returns','/terms','/privacy'].every(href=>footer.includes(`href="${href}"`)));
check('Product offer structured data', read('src/product-structured-data.js').includes("'@type': 'Offer'"));
check('No automatic Google Ads / analytics tags',![/googletagmanager\.com/i,/google-analytics\.com/i,/googleads\.g\.doubleclick\.net/i,/gtag\s*\(/i].some(regex=>regex.test(header+'\n'+footer)),'Advertising measurement intentionally requires a separately consent-reviewed setup');
check('Checkout guest route declared',source.includes("app.get('/checkout'")&&source.includes("app.post('/checkout'"),'Guest eligibility requires a live customer journey');
for (const item of checks) console.log(`[${item.result}] ${item.name}${item.detail?' — '+item.detail:''}`);
const argIndex=process.argv.indexOf('--url');
if (argIndex<0){
 console.log('\n[NOT TESTED] Public HTTPS reachability, GoogleAdsBot crawl, real inventory, legal business identity, paid checkout, Merchant Center account approval.');
 console.log('Run with --url https://your-verified-domain.example on a staging/production deployment.');
 process.exitCode=process.argv.includes('--static')?Number(checks.some(c=>c.result==='FAIL')):2;
} else {
 const raw=process.argv[argIndex+1];
 let base;
 try {
  const u=new URL(raw);
  const host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||
    !host.includes('.')||isIP(host)||['localhost','host.docker.internal'].includes(host)||host.endsWith('.local')||host.endsWith('.internal')) throw new Error('Public HTTPS hostname required');
  base=u.origin;
 } catch {console.error('[FAIL] Supply a real public HTTPS origin (without a path, query or port)');process.exit(2);}
 const routes=['/robots.txt','/sitemap.xml',...routeNames];
 let failed=checks.filter(c=>c.result==='FAIL').length;
 for(const route of routes){
  try {
   const response=await fetch(base+route,{headers:{'Accept':'text/html,application/xml,text/plain;q=0.7','User-Agent':'ShopEasyAudit/1.0 (+manual compliance preflight)'},redirect:'manual',signal:AbortSignal.timeout(12000)});
   const finalOrigin=new URL(response.url).origin;
   const body=(await response.text()).slice(0,100_000);
   const ok=response.status===200 && finalOrigin===base &&
     (route==='/robots.txt'?/User-agent:/i.test(body):route==='/sitemap.xml'?/<sitemapindex\b|<urlset\b/i.test(body):
       /<html\b/i.test(body)&&/<title\b/i.test(body)&&!/<meta\s+name="robots"\s+content="noindex/i.test(body));
   console.log(`[${ok?'PASS':'FAIL'}] GET ${route}: HTTP ${response.status} ${ok?'expected public document':'Unexpected response or non-indexable page'}`);
   if(!ok)failed++;
  } catch(error){console.log(`[FAIL] GET ${route}: ${error?.message||'Request failed'}`);failed++;}
 }
 console.log('\n[NOT TESTED] Approval, actual checkout payment, Merchant Center price feed parity, business identity verification, country-targeting and ad account policy reviews.');
 process.exitCode=failed?1:0;
}
