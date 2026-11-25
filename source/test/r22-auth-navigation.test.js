import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {authDestination,managerMustCompleteMfa} from '../src/auth-navigation.js';
import {registrationNotice} from '../src/registration-copy.js';

const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
const loginTemplate=readFileSync(new URL('../views/login.ejs',import.meta.url),'utf8');
const header=readFileSync(new URL('../views/partials/header.ejs',import.meta.url),'utf8');
const footer=readFileSync(new URL('../views/partials/footer.ejs',import.meta.url),'utf8');

function routeCallback(prefix,terminator, context){
 const start=server.indexOf(prefix);
 assert.notEqual(start,-1,`Missing route ${prefix}`);
 const end=server.indexOf(terminator,start+prefix.length);
 assert.ok(end>start,`Missing route terminator: ${prefix}`);
 const inner=server.slice(start+prefix.length,end);
 return vm.runInNewContext(`(async (req,res)=>{${inner}\n})`,context,{timeout:2000});
}

const redirections=[
 ['customer','/checkout?from=cart','/checkout?from=cart'],
 ['customer','/wishlist','/wishlist'],
 ['customer','/account/order/12','/account/order/12'],
 ['customer','/admin/settings','/account'],
 ['customer','/login','/account'],
 ['customer','/./login','/account'],
 ['customer','/public/../admin/settings','/account'],
 ['customer','/%2e%2e/login','/account'],
 ['customer','/register','/account'],
 ['customer','/mfa/verify','/account'],
 ['customer','//outside.example','/account'],
 ['customer','https://outside.example','/account'],
 ['customer','/%2f%2foutside.example','/account'],
 ['customer','/\\evil.example','/account'],
 ['customer','/cart%0aSet-Cookie:x','/account'],
 ['manager','/admin/products/3/edit','/admin/products/3/edit'],
 ['manager','/checkout','/admin'],
 ['admin','/admin/staff','/admin'],
 ['admin','/admin','/admin'],
 ['customer','/cart', '/cart']
];
for(const [role,from,expected] of redirections){
 test(`post-login destination ${role}: ${from}`,()=>{
  assert.equal(authDestination(role,from),expected);
 });
}

test('login and registration share a safe return target without exposing external redirects',()=>{
 assert.match(loginTemplate,/name="next" value="<%= next\|\|'\/account' %>"/);
 assert.match(loginTemplate,/action="\/login"[\s\S]*?name="next"/);
 assert.match(loginTemplate,/`\/register\?next=\$\{encodeURIComponent\(next\)\}`/);
 assert.match(loginTemplate,/`\/login\?next=\$\{encodeURIComponent\(next\)\}`/);
 assert.match(footer,/href="\/login\?next=%2Fwishlist"/);
});

test('auth notices are not displayed as invalid-credentials errors',()=>{
 assert.match(loginTemplate,/typeof notice !== 'undefined'/);
 assert.match(loginTemplate,/role="status"><%= pageText\(notice\) %>/);
 assert.match(loginTemplate,/role="alert"[^>]*><%= pageText\(error\) %>/);
 assert.match(server,/notice:'If this account needs verification/);
});

test('registration with email disabled stays pending and preserves the checkout return target (executable handler)',async()=>{
 const calls=[];
 const context={
  cleanText:(v,n)=>String(v??'').trim().slice(0,n),
  isStrongEnoughPassword:v=>typeof v==='string'&&v.length>=8&&v.length<=200,
  authDestination,registrationNotice,emailEnabled:()=>false,
  hashPassword:async()=> 'stored-hash',
  getUserAuthByEmail:async()=> null,
  createUser:async(email,hash,role,name,time,verified)=>{calls.push({kind:'create',email,hash,role,name,verified});return 17;},
  login:async()=>{throw new Error('Pending registration must not authenticate');},
  render:(res,view,model)=>{calls.push({kind:'render',view,model});return res;},
  logOperationalFailure:()=>{}
 };
 const handler=routeCallback("app.post('/register',registerLimiter,async(req,res)=>{","\n});\napp.get('/verify-email'",context);
 const res={locals:{locale:'en'},redirect:()=>{throw new Error('Pending registration must keep a neutral response');},status:()=>res,render:()=>res};
 await handler({body:{email:'new@shop.example',fullName:'Customer Test',password:'Good-password-2026',confirmPassword:'Good-password-2026',termsAccepted:'on',next:'/checkout'}},res);
 assert.deepEqual(calls.map(x=>x.kind),['create','render']);
 assert.equal(calls[0].verified,false);
 assert.equal(calls[0].role,'customer');
 assert.equal(calls[1].view,'login');
 assert.equal(calls[1].model.mode,'login');
 assert.equal(calls[1].model.next,'/checkout');
 assert.equal(calls[1].model.notice,registrationNotice('en',false));
});

test('duplicate registration stays neutral and never authenticates (executable handler)',async()=>{
 const calls=[];
 const context={
  cleanText:(v,n)=>String(v??'').trim().slice(0,n),
  isStrongEnoughPassword:v=>typeof v==='string'&&v.length>=8&&v.length<=200,
  authDestination,registrationNotice,emailEnabled:()=>false,
  hashPassword:async()=> 'stored-hash',
  getUserAuthByEmail:async()=>({id:1}),
  createUser:async()=>{throw Error('duplicate must not create')},
  login:async()=>{throw Error('duplicate must not authenticate')},
  render:(res,view,model)=>{calls.push({view,model});return res;},
  logOperationalFailure:()=>{}
 };
 const handler=routeCallback("app.post('/register',registerLimiter,async(req,res)=>{","\n});\napp.get('/verify-email'",context);
 const res={locals:{locale:'en'},status:()=>res,render:()=>res,redirect:()=>{throw Error('duplicate redirect forbidden')}};
 await handler({body:{email:'existing@shop.example',fullName:'Customer Test',password:'Good-password-2026',confirmPassword:'Good-password-2026',termsAccepted:'on',next:'/wishlist'}},res);
 assert.equal(calls.length,1);
 assert.equal(calls[0].view,'login');
 assert.equal(calls[0].model.mode,'login');
 assert.equal(calls[0].model.notice,registrationNotice('en',false));
 assert.equal(calls[0].model.next,'/wishlist');
});

test('logged-in login POST cannot silently switch accounts (executable handler)',async()=>{
 const handler=routeCallback("app.post('/login',loginLimiter,async(req,res)=>{","\n});\napp.get('/mfa/setup'",{authDestination,managerMustCompleteMfa});
 const out=[];
 const res={redirect:(code,path)=>{out.push([code,path]);return res;}};
 await handler({user:{id:5,role:'admin'},body:{next:'/admin/staff',email:'another@example.com',password:'x'}},res);
 assert.deepEqual(out,[[303,'/admin']]);
});

test('logout is POST-only and uses session revocation and homepage redirect',()=>{
 assert.match(server,/app\.post\('\/logout',async\(req,res\)=>\{await logout\(req,res\);res\.redirect\(303,'\/'\)\}\)/);
 assert.doesNotMatch(server,/app\.get\('\/logout'/);
 assert.match(header,/form class="inline-form nav-logout" method="post" action="\/logout"/);
 assert.match(header,/form class="admin-header-logout" method="post" action="\/logout"/);
});


test('an unfinished Manager MFA session is never redirected in a login loop',()=>{
 assert.equal(managerMustCompleteMfa({role:'manager',mfa_enabled:0}),true);
 assert.equal(managerMustCompleteMfa({role:'manager',mfa_enabled:1}),false);
 assert.equal(managerMustCompleteMfa({role:'admin',mfa_enabled:0}),false);
 assert.match(server,/app\.get\('\/login',[\s\S]*?req\.user&&!managerMustCompleteMfa\(req\.user\)/);
 assert.match(server,/app\.get\('\/register',[\s\S]*?if\(managerMustCompleteMfa\(req\.user\)\)return res\.redirect\(303,'\/login\?mfa=required'\)/);
 assert.match(server,/app\.post\('\/login',[\s\S]*?req\.user&&!managerMustCompleteMfa\(req\.user\)/);
});


test('registration POST cannot silently switch an already authenticated account',async()=>{
 const handler=routeCallback("app.post('/register',registerLimiter,async(req,res)=>{","\n});\napp.get('/verify-email'",{authDestination,managerMustCompleteMfa});
 const events=[];const res={redirect:(status,destination)=>{events.push([status,destination]);return res;}};
 await handler({user:{id:1,role:'customer'},body:{next:'/checkout'}},res);
 assert.deepEqual(events,[[303,'/checkout']]);
 events.length=0;
 await handler({user:{id:2,role:'manager',mfa_enabled:0},body:{next:'/checkout'}},res);
 assert.deepEqual(events,[[303,'/login?mfa=required']]);
});

test('Manager MFA-required login GET renders the sign-in screen rather than redirecting (executable handler)',async()=>{
 const contexts=[];
 const cb=routeCallback("app.get('/login',(req,res)=>{","});\napp.get('/register'",{
   managerMustCompleteMfa,authDestination,
   safeNavigationTarget:(v)=>typeof v==='string'&&v.startsWith('/')?v:'/account',
   cleanText:(v,n)=>String(v??'').trim().slice(0,n),
   render:(res,view,locals)=>{contexts.push({view,locals});return res;}
 });
 const res={redirect:()=>{throw Error('MFA-required login must not redirect')}};
 await cb({user:{id:20,role:'manager',mfa_enabled:0},query:{mfa:'required',next:'/admin/staff'}},res);
 assert.equal(contexts[0].view,'login');
 assert.match(contexts[0].locals.error,/authenticator setup/);
 assert.equal(contexts[0].locals.next,'/admin/staff');
});

test('verification-enabled registration stays pending, shows neutral next step, and never signs in',async()=>{
 const calls=[];
 const context={
  cleanText:(v,n)=>String(v??'').trim().slice(0,n),
  isStrongEnoughPassword:v=>typeof v==='string'&&v.length>=8&&v.length<=200,
  authDestination,registrationNotice,emailEnabled:()=>true,
  hashPassword:async()=> 'stored-hash',
  getUserAuthByEmail:async()=>null,
  createUser:async(email,hash,role,name,time,verified)=>{calls.push({kind:'create',verified});return 20;},
  login:async()=>{throw Error('pending email must not sign in')},
  siteBase:()=>'',
  render:(res,view,model)=>{calls.push({kind:'render',view,model});return res;},
  console:{error:()=>{}},
  logOperationalFailure:()=>{}
 };
 const handler=routeCallback("app.post('/register',registerLimiter,async(req,res)=>{","\n});\napp.get('/verify-email'",context);
 const res={locals:{locale:'en'},status:()=>res,render:()=>res,redirect:()=>{throw Error('verification pending must not redirect')}};
 await handler({body:{email:'pending@example.test',fullName:'Test',password:'Good-password-2026',confirmPassword:'Good-password-2026',termsAccepted:'on',next:'/checkout'}},res);
 assert.deepEqual(calls.map(x=>x.kind),['create','render']);
 assert.equal(calls[0].verified,false);
 assert.equal(calls[1].model.notice,registrationNotice('en',true));
 assert.equal(calls[1].model.next,'/checkout');
});

test('customer login returns to wishlist while Manager sign-in always starts MFA',async()=>{
 const messages=[];
 let role='customer';
 const context={
  crypto:{randomUUID:()=> 'request-id',createHash:()=>({update:()=>({digest:()=> 'email-hash'})})},
  cleanText:(v,n=200)=>String(v??'').trim().slice(0,n),
  managerMustCompleteMfa,authDestination,
  isAccountLoginBlocked:async()=>false,
  authenticate:async()=>({id:33,role}),
  clearAccountLoginFailures:async()=>{},
  login:async(req,res,id)=>messages.push(['session',id]),
  beginManagerMfaChallenge:async(req,res,user,options)=>{messages.push(['challenge',options.nextPath]);return res.redirect(303,'/mfa/verify')},
  render:()=>{throw Error('successful sign-in should not re-render login')},
  recordLoginFailure:()=>{},logOperationalFailure:()=>{}
 };
 const handler=routeCallback("app.post('/login',loginLimiter,async(req,res)=>{","\n});\napp.get('/mfa/setup'",context);
 const res={set:()=>res,redirect:(code,target)=>{messages.push(['redirect',code,target]);return res;}};
 await handler({user:null,body:{email:'test@example.com',password:'safe',next:'/wishlist'}},res);
 assert.deepEqual(messages,[['session',33],['redirect',303,'/wishlist']]);
 role='manager';messages.length=0;
 await handler({user:null,body:{email:'manager@example.com',password:'safe',next:'/admin/orders'}},res);
 assert.deepEqual(messages,[['challenge','/admin/orders'],['redirect',303,'/mfa/verify']]);
});

test('password reset returns to the original checkout after successful code verification',async()=>{
 const events=[];
 const context={
  safeNavigationTarget:v=>typeof v==='string'&&v.startsWith('/')&&!v.startsWith('//')?v:'/account',
  cleanText:(v,n)=>String(v??'').trim().slice(0,n),
  isStrongEnoughPassword:v=>v.length>=8,
  resetPasswordWithCode:async()=>({ok:true,userId:90}),
  resetCodeDigest:()=> 'digest',
  hashPassword:async()=> 'password-hash',
  safeAudit:async()=>events.push('audit'),
  render:()=>{throw Error('reset success must redirect')},
  console:{error:()=>{}},
  emailEnabled:()=>false,resetCodePepper:()=>'',
 };
 const handler=routeCallback("app.post('/forgot-password',passwordResetLimiter,async(req,res)=>{","\n});\napp.get('/order-lookup'",context);
 const res={status:()=>res,render:()=>res,redirect:(status,url)=>{events.push([status,url]);return res;}};
 await handler({body:{action:'reset',email:'member@example.com',code:'123456',password:'NewPassword2026',confirmPassword:'NewPassword2026',next:'/checkout'}},res);
 assert.deepEqual(events,['audit',[303,'/login?reset=1&next=%2Fcheckout']]);
});

test('password recovery displays the correct next-step forms without losing checkout intent',()=>{
 const forgot=readFileSync(new URL('../views/forgot-password.ejs',import.meta.url),'utf8');
 assert.equal((forgot.match(/name="next" value=/g)||[]).length,2);
 assert.match(forgot,/\/login\?next=\$\{encodeURIComponent\(next\)\}/);
 assert.match(loginTemplate,/\/forgot-password\?next=\$\{encodeURIComponent\(next\)\}/);
});


test('anonymous wishlist action returns to the exact product or listing after sign-in',()=>{
 const appJs=readFileSync(new URL('../public/js/app.js',import.meta.url),'utf8');
 assert.match(appJs,/const currentPath = `\$\{window\.location\.pathname\}\$\{window\.location\.search\}`/);
 assert.match(appJs,/window\.location\.assign\(`\/login\?next=\$\{encodeURIComponent\(safeReturn\)\}`\)/);
 assert.doesNotMatch(appJs,/window\.location\.href = '\/login'/);
});
