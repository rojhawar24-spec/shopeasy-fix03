// Staging-only legacy SQL compatibility. Never accepts SQL from HTTP clients.
// Produces native bound PostgreSQL statements; unsupported syntax fails closed.
const identityTables = new Set(['users','categories','products','product_variants','product_images','coupons','orders','order_items','order_returns','order_status_history','audit_logs','gift_cards','gift_card_ledger','stories','product_reviews','stock_alerts','newsletter_campaigns','order_email_deliveries','peppol_submissions']);
export function compileLegacyQuery(sql, args = [], {runtime = false} = {}) {
  if (typeof sql !== 'string' || !sql.trim()) throw new TypeError('SQL required');
  if (!Array.isArray(args) && (!args || typeof args !== 'object')) throw new TypeError('SQL bindings required');
  const tokens = [];
  let i=0;
  while(i<sql.length) {
    const rest=sql.slice(i);
    if(rest.startsWith('--') || rest.startsWith('/*') || rest[0]==='$' || rest[0]===';' || rest[0]==='\\' || rest[0]==='[' || rest[0]==='\x60') throw new Error('Unsupported SQL token');
    if(rest[0]==="'" || rest[0]==='"') {
      const q=rest[0]; let j=i+1, closed=false;
      while(j<sql.length) { if(sql[j]===q) { if(sql[j+1]===q){j+=2;continue;} j++;closed=true;break; } j++; }
      if(!closed) throw new Error('Unterminated SQL quote');
      tokens.push({kind:'quoted',text:sql.slice(i,j)});i=j;continue;
    }
    const m=rest.match(/^(\s+|@[A-Za-z_][A-Za-z0-9_]*|\?|[A-Za-z_][A-Za-z0-9_]*|.)/s);
    const t=m[0]; tokens.push({kind:/^\s+$/.test(t)?'space':t==='?'||t[0]==='@'?'parameter':/^[A-Za-z_]/.test(t)?'word':'symbol',text:t});i+=t.length;
  }
  const significant=tokens.filter(t=>t.kind!=='space');
  if(!/^(SELECT|INSERT|UPDATE|DELETE|WITH)$/i.test(significant[0]?.text)) throw new Error('Unsupported SQL command');
  const values=[],named=new Map();let positional=0;
  for(const t of tokens) {
    if(t.kind!=='parameter')continue;
    if(t.text==='?'){
      if(!Array.isArray(args)||positional>=args.length)throw new Error('Missing positional binding');
      values.push(args[positional++]);t.text='$'+values.length;
    }else{
      if(Array.isArray(args))throw new Error('Expected named bindings');
      const name=t.text.slice(1);
      const key=Object.hasOwn(args,name)?name:Object.hasOwn(args,t.text)?t.text:null;
      if(key===null)throw new Error('Missing named binding: '+name);
      if(!named.has(name)){values.push(args[key]);named.set(name,values.length);}
      t.text='$'+named.get(name);
    }
  }
  if(Array.isArray(args)&&positional!==args.length)throw new Error('Unexpected positional binding');
  for(let j=0;j<significant.length;j++){
    const t=significant[j], n=significant[j+1];
    if(t.kind!=='word')continue;
    const word=t.text.toUpperCase();
    if(runtime && word==='GLOB' && significant[j-1]?.text.toUpperCase()==='NOT' && n?.text==="'*[^A-Za-z0-9_-]*'"){significant[j-1].text='';t.text='!~';n.text="'[^A-Za-z0-9_-]'";continue;}
    if(['PRAGMA','AUTOINCREMENT','GLOB','ATTACH','DETACH','VACUUM','SQLITE_MASTER'].includes(word))throw new Error('SQLite-only SQL: '+word);
    if(word==='COLLATE'&&n?.text.toUpperCase()==='BINARY'){
      if(!runtime)throw new Error('Explicit PostgreSQL collation required');
      // SQLite binary equality is case-sensitive, including credential emails.
      // Casting citext to text is essential: COLLATE C alone does not change
      // citext's case-insensitive equality operator.
      const field=significant[j-3], op=significant[j-2], param=significant[j-1];
      if(!field || !['EMAIL','MFA_SECRET'].includes(field.text.toUpperCase()) || op?.text!=='=' || param?.kind!=='parameter')throw new Error('Unsupported binary credential comparison');
      const qualifier=significant[j-4]?.text==='.'?significant[j-5]:null;
      if(qualifier){qualifier.text='CAST('+qualifier.text;field.text+=' AS TEXT)';}
      else field.text='CAST('+field.text+' AS TEXT)';
      param.text='CAST('+param.text+' AS TEXT)';
      n.text='"C"';
    }
    if(word==='COLLATE'&&n?.text.toUpperCase()==='NOCASE'){if(!runtime)throw new Error('Explicit PostgreSQL collation required');n.text='shopeasy.nocase';}
    if(word==='INSERT'&&n?.text.toUpperCase()==='OR')throw new Error('Explicit PostgreSQL conflict clause required');
    if(['MIN','MAX'].includes(word)&&n?.text==='('){
      let depth=0,commas=0,closed=false;
      for(let k=j+1;k<significant.length;k++){const x=significant[k];if(x.kind==='quoted')continue;if(x.text==='(')depth++;else if(x.text===')'){depth--;if(depth===0){closed=true;break;}}else if(x.text===','&&depth===1)commas++;}
      if(!closed)throw new Error('Unbalanced SQL function');
      if(commas>0)t.text=word==='MIN'?'LEAST':'GREATEST';
    }
    if(runtime && word==='LIKE')t.text='ILIKE';
    if(runtime && word==='INTEGER' && significant[j-1]?.text.toUpperCase()==='AS')t.text='BIGINT';
    if(['DATETIME','JULIANDAY','PRINTF','INSTR','DATE','STRFTIME','GROUP_CONCAT','IFNULL'].includes(word)&&n?.text==='('){
      if(runtime && ['DATETIME','JULIANDAY','DATE'].includes(word)) t.text='shopeasy.sqlite_'+word.toLowerCase();
      else if(runtime && word==='INSTR') t.text='strpos';
      else if(runtime && word==='PRINTF' && significant[j+2]?.text==="'/%d/'"){t.text='format';significant[j+2].text="'/%s/'";}
      else throw new Error('Explicit PostgreSQL function port required: '+word);
    }
  }
  let text=tokens.map(t=>t.text).join('');
  if(/^INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\b/i.test(text.trim())){
    const table=text.trim().match(/^INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\b/i)[1].toLowerCase();
    if(identityTables.has(table)&&!significant.some(t=>t.kind==='word'&&t.text.toUpperCase()==='RETURNING'))text+=' RETURNING id';
  }
  if(values.some(v=>v===undefined))throw new Error('Undefined SQL binding');
  return {text,values};
}
