import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('password recovery uses a dedicated secret and the example config exposes it',()=>{
  const server=read('src/server.js');
  const env=read('.env.example');
  assert.match(server,/function resetCodePepper\(\)[\s\S]*process\.env\.RESET_CODE_SECRET/);
  assert.doesNotMatch(server,/RESET_CODE_SECRET\|\|process\.env\.TURSO_AUTH_TOKEN/);
  assert.doesNotMatch(server,/RESET_CODE_SECRET\|\|process\.env\.RESEND_API_KEY/);
  assert.match(env,/^RESET_CODE_SECRET=$/m);
});

test('dynamic request rate limiting runs before URL-encoded and JSON body parsing',()=>{
  const server=read('src/server.js');
  const staticAssets=server.indexOf("app.use(express.static(path.join(root,'public')");
  const general=server.indexOf('app.use(generalLimiter);');
  const urlencoded=server.indexOf('app.use(express.urlencoded(');
  const json=server.indexOf('app.use(express.json(');
  assert.ok(staticAssets>=0 && general>staticAssets,'static assets may remain ahead of the dynamic-request limiter');
  assert.ok(general<urlencoded && general<json,'general limiter must execute before untrusted body parsing');
  assert.match(server,/app\.use\(express\.urlencoded\(\{extended:false,limit:'2mb'\}\)\)/,'multilingual settings forms need a bounded 2 MiB URL-encoded limit');
  assert.equal(server.indexOf('app.use(generalLimiter);'),server.lastIndexOf('app.use(generalLimiter);'),'general limiter must be registered exactly once');
});

test('crawler routes and admin rate limiting run before session creation',()=>{
  const server=read('src/server.js');
  const general=server.indexOf('app.use(generalLimiter);');
  const robots=server.indexOf("app.get('/robots.txt'");
  const adminLimit=server.indexOf("app.use('/admin',adminLimiter);");
  const attach=server.indexOf('app.use(attachAuth);');
  const dynamic=server.indexOf('app.use(async(req,res,next)=>{');
  assert.ok(general>=0 && robots>general,'robots route must be after global rate limiting');
  assert.ok(robots<adminLimit && adminLimit<attach,'admin limiter must be before authentication/session creation');
  assert.ok(robots<dynamic,'crawler routes must bypass personalized dynamic middleware');
  assert.equal(server.indexOf("app.get('/robots.txt'"),server.lastIndexOf("app.get('/robots.txt'"),'robots route should be registered once');
  assert.equal(server.indexOf("app.get('/sitemap.xml'"),server.lastIndexOf("app.get('/sitemap.xml'"),'sitemap index route should be registered once');
});

test('local uploaded-asset cleanup only ignores already-missing files',()=>{
  const server=read('src/server.js');
  const start=server.indexOf('async function deleteUploadedAsset');
  const end=server.indexOf('async function safeProductImage',start);
  assert.ok(start>=0&&end>start);
  const block=server.slice(start,end);
  assert.match(block,/fs\.unlinkSync/);
  assert.match(block,/error\?\.code!==['"]ENOENT['"]/);
  assert.doesNotMatch(block,/catch\s*\{\s*\}/);
});

test('release versions and password-reset documentation are internally consistent',()=>{
  const pkg=JSON.parse(read('package.json'));
  const lock=JSON.parse(read('package-lock.json'));
  assert.equal(pkg.version,'2.8.95');
  assert.equal(lock.version,'2.8.95');
  assert.equal(lock.packages[''].version,'2.8.95');
  assert.equal(pkg.dependencies.ejs,'7.0.2');
  assert.equal(lock.packages['node_modules/ejs'].version,'7.0.2');
  assert.match(read('SECURITY.md'),/expire after 10 minutes/);
  assert.doesNotMatch(read('SECURITY.md'),/expire after 60 minutes/);
});

test('known current dependency security baselines are not rolled back',()=>{
  const pkg=JSON.parse(read('package.json'));
  const lock=JSON.parse(read('package-lock.json'));
  assert.equal(pkg.dependencies.multer,'2.5.0');
  assert.equal(lock.packages['node_modules/multer'].version,'2.5.0');
  const bodyParserVersion=lock.packages['node_modules/body-parser']?.version;
  const qsVersion=lock.packages['node_modules/qs']?.version;
  const atLeast=(actual,minimum)=>{
    const a=String(actual||'').split('.').map(Number);
    const b=minimum.split('.').map(Number);
    if(a.length<3||a.some(part=>!Number.isFinite(part))) return false;
    for(let i=0;i<3;i+=1){if((a[i]||0)>(b[i]||0))return true;if((a[i]||0)<(b[i]||0))return false;}
    return true;
  };
  assert.ok(atLeast(bodyParserVersion,'2.4.0'),`body-parser must include the DoS fix (>=2.4.0); found ${bodyParserVersion||'missing'}`);
  assert.ok(atLeast(qsVersion,'6.16.1'),`qs must include the stringify fix (>=6.16.1); found ${qsVersion||'missing'}`);
  assert.equal(pkg.dependencies['express-rate-limit'],'8.7.5');
});



test('production crawler URLs fail closed when BASE_URL is missing instead of trusting Host',()=>{
  const server=read('src/server.js');
  assert.match(server,/function siteBase\(req\) \{[\s\S]*?return resolvePublicBaseUrl\(\{/);
  const startup = read('src/startup-config.js');
  assert.match(startup,/const protocolAllowed = requireHttps \? url\.protocol === 'https:'/);
  assert.match(startup,/if \(!developmentMode && localHost\) return '';[\s\S]*requestHost/);
  assert.ok(server.includes("if(!base) return res.status(503).type('text/plain').send('Sitemap unavailable until BASE_URL is configured.');"));
  assert.ok(server.includes('const sitemap=base?`Sitemap: ${base}/sitemap.xml'));
});


test('early CSRF rejections have safe shared-view defaults before rendering the error page',()=>{
  const server=read('src/server.js');
  const defaults=server.indexOf('// Early middleware can reject a request before the database-backed storefront');
  const attach=server.indexOf('app.use(attachAuth);');
  const csrf=server.indexOf('app.use(csrfToken);',attach);
  const guard=server.indexOf('return verifyCsrf(req,res,next);',csrf);
  assert.ok(defaults>=0&&defaults<attach&&attach<csrf&&csrf<guard,
    'safe error-view defaults must exist before a failed CSRF check can render a response');
  const block=server.slice(defaults,attach);
  assert.match(block,/const fallbackLocale=SUPPORTED_UI_LOCALES\.includes\(cookieLocale\)\?cookieLocale:getDefaultUiLocale\(process\.env\.DEFAULT_LOCALE\)/,
    'early error pages should keep a valid language cookie when available');
  for(const local of [
    'storeName:storeNameFallback','locale:fallbackLocale',
    'availableUiLocales:SUPPORTED_UI_LOCALES','uiLocaleOptions:UI_LOCALE_OPTIONS',
    "csrf:''",'cartCount:0','wishlistCount:0','navCategories:[]',
    "canonicalBase:''",'isAdminRoute:requestPath.startsWith',
    'isCheckoutRoute:requestPath.startsWith','returnTo:'
  ]) assert.ok(block.includes(local),`early error rendering is missing safe local ${local}`);
});

test('all non-multipart state-changing routes are protected by global CSRF validation',()=>{
  const server=read('src/server.js');
  const auth=server.indexOf('app.use(attachAuth);');
  const csrf=server.indexOf('app.use(csrfToken);',auth);
  const guard=server.indexOf("return verifyCsrf(req,res,next);",csrf);
  const dynamicRoutes=server.indexOf("app.post('/language'",guard);
  assert.ok(auth>=0&&csrf>auth&&guard>csrf&&dynamicRoutes>guard,
    'global CSRF guard must run after session/CSRF token setup and before mutation routes');
  const guardBlock=server.slice(csrf,dynamicRoutes);
  assert.match(guardBlock,/req\.method==='POST'\s*&&\s*req\.is\('multipart\/form-data'\)\s*&&\s*\['\/admin\/categories\/save','\/admin\/products\/save','\/admin\/stories\/save','\/admin\/branding','\/admin\/appearance'\]\.includes\(req\.path\)/,
    'only explicitly listed multipart uploads may defer global CSRF validation until Multer parses the token; each route must validate CSRF afterward');
  for (const [route, upload] of [['categories/save',"upload.single('image')"],['stories/save',"upload.single('image')"],['branding',"upload.single('heroImage')"],['appearance',"upload.single('shopLogo')"]]) {
    assert.ok(server.includes("app.post('/admin/"+route+"',requireManager,"+upload+",verifyCsrf,"),route+' must require Manager and validate CSRF after parsing');
  }
  assert.match(server,/app\.post\('\/admin\/products\/save',requireManager,upload\.fields\([^\n]+?\),verifyCsrf,/);
  assert.match(guardBlock,/req\.method\s*===\s*'POST'\s*&&\s*req\.path\s*===\s*'\/payments\/mollie\/webhook'/, 'the Mollie server-to-server webhook is the only deliberate non-browser CSRF exception');
  assert.match(guardBlock,/return verifyCsrf\(req,res,next\)/);
  assert.doesNotMatch(server,/app\.use\(\(req,res,next\)=>req\.is\('multipart\/form-data'\)\?next\(\):verifyCsrf\(req,res,next\)\);/,
    'the older broad multipart bypass must not duplicate the global CSRF guard');
  assert.equal((server.match(/return verifyCsrf\(req,res,next\)/g)||[]).length,1,
    'the source should have exactly one global guard call; upload routes validate after Multer');
  for (const route of [
    "app.post('/admin/categories/save'", "app.post('/admin/categories/delete'",
    "app.post('/admin/orders/status'", "app.post('/admin/coupons/save'",
    "app.post('/admin/coupons/delete'", "app.post('/admin/settings'",
    "app.post('/admin/branding'", "app.post('/wishlist/toggle'",
    "app.post('/checkout'", "app.post('/checkout/success/cancel'", "app.post('/logout'"
  ]) assert.ok(server.includes(route),`expected route exists: ${route}`);
});


test('customer registration has its own rate-limit bucket, separate from login brute-force protection',()=>{
  const server=read('src/server.js');
  assert.match(server,/const loginLimiter=makeRateLimiter\('login',\{windowMs:15\*60\*1000,max:10/);
  assert.match(server,/const registerLimiter=makeRateLimiter\('register',\{windowMs:15\*60\*1000,max:10/);
  assert.match(server,/app\.post\('\/login',loginLimiter,/);
  assert.match(server,/app\.post\('\/register',registerLimiter,/);
  assert.doesNotMatch(server,/app\.post\('\/register',loginLimiter,/);
});
