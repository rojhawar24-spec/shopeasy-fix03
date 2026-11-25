import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const auth=fs.readFileSync('src/auth.js','utf8');
test('role guards share a fresh database user lookup and clear stale session users',()=>{
 assert.match(auth,/const freshUser = await getUserById\(req\.session\.user_id\);\s*req\.user = freshUser \|\| null;/);
 assert.match(auth,/res\.locals\.user = req\.user;\s*res\.locals\.isLoggedIn = Boolean\(req\.user\);/);
 assert.equal((auth.match(/const freshUser = await getUserById\(req\.session\.user_id\)/g)||[]).length,1);
 for(const name of ['requireManager','requireDashboardAccess','requireAdmin']) assert.match(auth,new RegExp(`export async function ${name}[\\s\\S]*?refreshSessionUser\\(req, res, next\\)`));
});
