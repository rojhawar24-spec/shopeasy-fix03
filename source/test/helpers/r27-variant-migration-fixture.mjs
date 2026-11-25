// Local-only child fixture for actual startup migration integration tests.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const [mode,database,stockArgument]=process.argv.slice(2);
if(!['prepare','import'].includes(mode)||!database) throw new Error('FIXTURE_ARGUMENTS');
Object.assign(process.env,{
  DATABASE_URL:pathToFileURL(database).href,
  SHOP_DATABASE_URL:pathToFileURL(database).href,
  CLOUDFLARE_WORKER:'0',NODE_ENV:'test',SEED_DEMO_DATA:'false',MANAGER_EMAIL:'',MANAGER_PASSWORD:''
});
for(const key of ['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','MOLLIE_API_KEY','RESEND_API_KEY','AI_API_KEY']) delete process.env[key];

const {db}=await import(pathToFileURL(path.join(root,'src/database.js')));
let rebuildCount=0;
if(process.env.R27_MIGRATION_GATE==='1') {
  const nativeTransaction=db.transaction.bind(db);
  db.transaction=async function gatedMigrationTransaction(...args) {
    const allowed=new Promise(resolve=>process.once('message',message=>{
      if(message?.operation!=='acquire-migration-lock') throw new Error('FIXTURE_GATE_MESSAGE');
      resolve();
    }));
    process.send({waiting_for_migration_write:true});
    await allowed;
    const tx=await nativeTransaction(...args);
    return new Proxy(tx,{
      get(target,key) {
        const value=Reflect.get(target,key,target);
        if(key==='execute') return async statement=>{
          const sql=typeof statement==='string'?statement:statement.sql;
          if(/CREATE TABLE product_variants_v289_migration/i.test(sql)) rebuildCount++;
          return value.call(target,statement);
        };
        return typeof value==='function'?value.bind(target):value;
      }
    });
  };
}

try {
  const store=await import(pathToFileURL(path.join(root,'src/db.js')));
  if(mode==='prepare') {
    const productId=await store.adminCreateOrUpdateProduct({
      name:'Migration fixture',slug:'migration-fixture',sku:'MIGRATION-FIXTURE',
      shortDescription:'Disposable local fixture',description:'Disposable migration fixture only',
      imageUrl:'',galleryImages:[],priceCents:1000,costPriceCents:400,salePriceCents:null,
      automaticDiscountPercent:0,stock:3,reorderLevel:1,categoryId:null,tags:'',featured:false,active:true,variants:[]
    });
    await db.execute('DROP TABLE product_variants');
    await db.execute(`CREATE TABLE product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,
      option_name TEXT NOT NULL DEFAULT 'Size',option_value TEXT NOT NULL,
      option_name_2 TEXT DEFAULT '',option_value_2 TEXT DEFAULT '',sku TEXT NOT NULL UNIQUE,
      stock INTEGER NOT NULL DEFAULT 0,reserved_stock INTEGER NOT NULL DEFAULT 0,
      image_url TEXT DEFAULT '',sort_order INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT(datetime('now')),updated_at TEXT DEFAULT(datetime('now')),
      UNIQUE(product_id,option_value COLLATE NOCASE)
    )`);
    await db.execute({sql:"INSERT INTO product_variants(id,product_id,option_value,sku,stock) VALUES(17,?,'M','MIGRATION-LEGACY',?)",args:[productId,Number(stockArgument)]});
    console.log(JSON.stringify({prepared:true}));
  } else {
    const schema=String((await db.execute("SELECT sql FROM sqlite_master WHERE name='product_variants'")).rows[0].sql);
    const row=(await db.execute('SELECT id,product_id,stock,reserved_stock FROM product_variants WHERE id=17')).rows[0];
    console.log(JSON.stringify({
      import_resolved:true,rebuild_count:rebuildCount,
      composite_schema:/UNIQUE\s*\(\s*product_id\s*,\s*option_value\s+COLLATE\s+NOCASE\s*,\s*option_value_2\s+COLLATE\s+NOCASE\s*\)/i.test(schema),
      row:{id:Number(row.id),product_id:Number(row.product_id),stock:Number(row.stock),reserved_stock:Number(row.reserved_stock)}
    }));
  }
} catch(error) {
  // Only safe diagnostics: never serialize a database statement or fixture secret.
  console.log(JSON.stringify({import_resolved:false,code:String(error?.code||error?.name||'ERROR'),constraint_failure:/CONSTRAINT|CHECK/i.test(String(error?.code||'')+' '+String(error?.message||''))}));
  process.exitCode=1;
} finally {
  db.close();
  if(process.connected) process.disconnect();
}
