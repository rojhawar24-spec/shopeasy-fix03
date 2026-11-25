import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('early CSRF errors render a header with AI disabled before database locals exist', () => {
  const server=fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const header=fs.readFileSync(new URL('../views/partials/header.ejs', import.meta.url), 'utf8');
  const initialLocals=server.slice(server.indexOf('app.use((req,res,next)=>{', server.indexOf('Early middleware can reject')), server.indexOf("app.use(checkoutDiagnosticStage('session-authentication'))"));
  assert.match(initialLocals, /aiEnabled:false/, 'AI must default to disabled on early error responses');
  assert.match(initialLocals, /appearance:normalizeAppearance\(\)/, 'early error responses need safe appearance defaults');
  assert.equal((header.match(/if\(typeof aiEnabled !== 'undefined' && aiEnabled\)/g)||[]).length,4,'all four search disclosures must tolerate early error rendering');
  assert.doesNotMatch(header, /if\(aiEnabled\)/, 'no unguarded EJS reference may remain');
});
