import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Manager MFA, staff dashboard, pending registration, approval and customer checkout integration flow completes', () => {
  const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopeasy-integration-parent-'));
  try {
    const result = spawnSync(process.execPath, ['scripts/manager-dashboard-integration.mjs'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        SHOPEASY_INTEGRATION_DATA_DIR: testDataDir,
        SHOPEASY_INTEGRATION_PARENT_CLEANUP: '1'
      }
    });
    if (result.error) throw result.error;
    assert.equal(
      result.status,
      0,
      `Full Manager/storefront integration failed (signal=${result.signal ?? 'none'}, status=${result.status}).\n` +
      `--- child stdout ---\n${result.stdout || '(empty)'}\n` +
      `--- child stderr ---\n${result.stderr || '(empty)'}`
    );
  } finally {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
    } catch (error) {
      console.error(`Integration test temp cleanup failed for ${testDataDir}:`, error);
      throw error;
    }
  }
});
