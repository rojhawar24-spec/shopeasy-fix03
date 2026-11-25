/** Static route and asset-reference integrity audit. Does not claim live click coverage. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const server=read('src/server.js');
const routes=[...server.matchAll(/app\.(get|post|put|patch|delete|all)\(\s*['"](\/[^'"]*)['"]/g)].map(match=>({method:match[1],path:match[2]}));
const normalize=value=>String(value).split('?')[0].split('#')[0];
const routeRegex=route=>new RegExp('^'+route.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/:[a-zA-Z][\w]*/g,'[^/]+')+'$');
const matches=(url,method)=>routes.some(route=>(route.method===method||route.method==='all')&&routeRegex(route.path).test(normalize(url)));
const viewFiles=[];
function visit(dir){for(const file of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=path.posix.join(dir,file.name);if(file.isDirectory())visit(rel);else if(file.name.endsWith('.ejs'))viewFiles.push(rel);}}
visit('views');
const findings=[],summary={views:viewFiles.length,links:0,forms:0,assets:0,dynamic:0};
for(const rel of viewFiles){
 const content=read(rel);
 for(const match of content.matchAll(/\bhref\s*=\s*['"](\/[^'"]+)['"]/g)){
  const url=match[1];
  if(url.includes('<%')){summary.dynamic++;continue;}
  if(url.startsWith('/assets/')||url.startsWith('/css/')||url.startsWith('/js/')){
   summary.assets++;
   const file=path.join(root,'public',normalize(url).slice(1));
   if(!fs.existsSync(file))findings.push({kind:'MISSING_ASSET',view:rel,url});
  }else {summary.links++;if(!matches(url,'get'))findings.push({kind:'UNKNOWN_GET',view:rel,url});}
 }
 for(const match of content.matchAll(/<form\b([^>]*)>/gs)){
  const attributes=match[1];
  const action=attributes.match(/\baction\s*=\s*['"](\/[^'"]+)['"]/);
  if(!action)continue;
  const url=action[1];
  if(url.includes('<%')){summary.dynamic++;continue;}
  const method=(attributes.match(/\bmethod\s*=\s*['"](get|post)['"]/i)?.[1]||'get').toLowerCase();
  summary.forms++;
  if(!matches(url,method))findings.push({kind:'UNKNOWN_'+method.toUpperCase(),view:rel,url});
 }
}
console.log('SOURCES: routes='+routes.length+' templates='+summary.views+' static links='+summary.links+' static forms='+summary.forms+' assets='+summary.assets+' dynamic links/forms skipped='+summary.dynamic);
console.log('Static routes are DECLARATIONS, not proof of actual navigation or authorization.');
for(const item of findings) console.log(`[FAIL] ${item.kind} ${item.view} -> ${item.url}`);
console.log('UNRESOLVED='+findings.length);
process.exitCode=findings.length?1:0;
