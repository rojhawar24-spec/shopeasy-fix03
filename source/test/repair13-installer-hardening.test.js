import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const installer = fs.readFileSync(new URL('../INSTALL-REPAIR13-WINDOWS.ps1', import.meta.url), 'utf8');

test('REPAIR13 installer refuses every running Node process, including custom-port ShopEasy servers', () => {
  assert.match(installer, /Get-Process -Name node/);
  assert.match(installer, /One or more Node\.js processes are running/);
  assert.match(installer, /Get-Content -LiteralPath \(Join-Path \$Target '\.env'\)/);
  assert.match(installer, /ConfiguredPort/);
  assert.match(installer, /Get-NetTCPConnection -LocalPort \$ConfiguredPort/);
});

test('REPAIR13 installer rejects equal and nested source/target directory paths', () => {
  assert.match(installer, /GetFullPath/);
  assert.match(installer, /SourcePrefix/);
  assert.match(installer, /TargetPrefix/);
  assert.match(installer, /may not be the same directory or contain one another/);
});

test('REPAIR13 installer creates a data backup and excludes live data/secrets from source copy', () => {
  assert.match(installer, /Assert-NoReparseTree/);
  assert.match(installer, /ReparsePoint/);
  assert.match(installer, /robocopy \$Target \$Backup[^\n]*\/XJ/);
  assert.match(installer, /SourceExcludedDirectories/);
  assert.match(installer, /Join-Path \$Source 'data'/);
  assert.match(installer, /Join-Path \$Source 'uploads'/);
  assert.match(installer, /Join-Path \$Source 'public\\uploads'/);
  assert.match(installer, /\/XF \.env \*\.log \*\.db \*\.sqlite \*\.sqlite3/);
  assert.match(installer, /npm run check/);
});
