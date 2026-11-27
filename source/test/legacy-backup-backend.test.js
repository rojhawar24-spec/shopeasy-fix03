import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertLegacyBackupBackend} from '../scripts/legacy-backup-backend.mjs';
test('legacy backup refuses PostgreSQL before opening a database',()=>{
  for(const key of ['DATABASE_URL','SHOP_DATABASE_URL','TURSO_DATABASE_URL','SHOP_POSTGRES_URL','SHOP_POSTGRES_TEST_URL','RESTORE_DATABASE_URL']) {
    assert.throws(()=>assertLegacyBackupBackend({[key]:'postgresql://example.invalid/db'}),/unavailable for PostgreSQL/);
  }
  for(const backend of ['postgres-preview','postgres-staging','postgres']) assert.throws(()=>assertLegacyBackupBackend({SHOP_DB_BACKEND:backend}),/unavailable for PostgreSQL/);
  assert.doesNotThrow(()=>assertLegacyBackupBackend({DATABASE_URL:'file:./test.db'}));
  assert.doesNotThrow(()=>assertLegacyBackupBackend({DATABASE_URL:'libsql://example.invalid'}));
  assert.doesNotThrow(()=>assertLegacyBackupBackend({}));
});
