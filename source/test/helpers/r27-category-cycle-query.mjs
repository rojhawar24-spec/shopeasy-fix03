// Child-process watchdog target. Only disposable test DB paths are supplied.
import { pathToFileURL } from 'node:url';
process.env.DATABASE_URL=pathToFileURL(process.argv[2]).href;
process.env.SHOP_DATABASE_URL=process.env.DATABASE_URL;
process.env.CLOUDFLARE_WORKER='0';
process.env.SEED_DEMO_DATA='false';
process.env.MANAGER_EMAIL='';
process.env.MANAGER_PASSWORD='';
const store=await import('../../src/db.js');
try {
  const rows=await store.listProducts({category:process.argv[3]});
  const count=await store.countProducts({category:process.argv[3]});
  console.log(JSON.stringify({listed:rows.length,count,uniqueIds:new Set(rows.map(row=>Number(row.id))).size}));
} finally { store.default.close(); }
