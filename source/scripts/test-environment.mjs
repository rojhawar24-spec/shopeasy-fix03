// Imported by each Node test worker before any test module can import db.js.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const directory=process.env.SHOPEASY_TEST_ROOT;
if(!directory||!path.isAbsolute(directory)||!path.basename(directory).startsWith('shopeasy-test-run-')||
   fs.realpathSync(directory)!==fs.realpathSync(os.tmpdir())||
   !fs.existsSync(path.join(directory,'.owned-test-run'))) {
  throw new Error('Test environment requires the isolated test launcher.');
}
process.env.NODE_ENV='test';
process.env.DATABASE_URL=pathToFileURL(path.join(directory,`worker-${process.pid}.db`)).href;
process.env.SHOP_DATABASE_URL=process.env.DATABASE_URL;
for(const name of ['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','MANAGER_EMAIL','MANAGER_PASSWORD','RESEND_API_KEY','MOLLIE_API_KEY','AI_API_KEY'])delete process.env[name];
process.env.SEED_DEMO_DATA='false';
process.env.CLOUDFLARE_WORKER='0';
