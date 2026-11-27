// The legacy logical backup format is SQLite/libSQL only. Never silently fall back.
export function assertLegacyBackupBackend(env=process.env) {
  const backend=String(env.SHOP_DB_BACKEND||'').trim().toLowerCase();
  const urls=[env.DATABASE_URL,env.SHOP_DATABASE_URL,env.TURSO_DATABASE_URL,env.SHOP_POSTGRES_URL,env.SHOP_POSTGRES_TEST_URL,env.RESTORE_DATABASE_URL];
  if(backend.startsWith('postgres')||urls.some(url=>/^postgres(?:ql)?:/i.test(String(url||'').trim()))) {
    throw new Error('Legacy SQLite backup/restore is unavailable for PostgreSQL. Use a reviewed native PostgreSQL backup and isolated restore procedure.');
  }
}
