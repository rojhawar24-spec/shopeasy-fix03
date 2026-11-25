import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/build-cloudflare.mjs'], {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

test('concurrent Cloudflare builds serialize and leave a complete output tree', async () => {
  const results = await Promise.all([runBuild(), runBuild()]);
  for (const [index, result] of results.entries()) {
    assert.equal(
      result.code,
      0,
      `Cloudflare build ${index + 1} failed (signal=${result.signal})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  const databasePath = path.join(root, '.cloudflare-build', 'src', 'database.js');
  const workerPath = path.join(root, '.cloudflare-build', 'src', 'worker.js');
  const bundlePath = path.join(root, 'generated', 'cloudflare-views.js');
  assert.ok(fs.statSync(databasePath).size > 100, 'database adapter must be a complete file');
  assert.ok(fs.statSync(workerPath).size > 100, 'Cloudflare worker entry must be a complete file');
  const bundle = fs.readFileSync(bundlePath, 'utf8');
  assert.match(bundle, /export default Object\.freeze\(views\)/);
  assert.match(bundle, /login\.ejs/);
});
