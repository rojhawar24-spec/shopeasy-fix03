-- Server-only role for ShopEasy's protected staging deployment.
-- Intentionally NOLOGIN until a dedicated password is configured securely.
CREATE ROLE shopeasy_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA shopeasy, extensions TO shopeasy_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA shopeasy TO shopeasy_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA shopeasy TO shopeasy_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA shopeasy TO shopeasy_runtime;
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='shopeasy' LOOP
    EXECUTE format('CREATE POLICY shopeasy_server_access ON shopeasy.%I FOR ALL TO shopeasy_runtime USING (true) WITH CHECK (true)',t.tablename);
  END LOOP;
END;
$$;
-- Keep uploads well below the free project's database capacity.
ALTER TABLE shopeasy.asset_storage_quota ALTER COLUMN max_bytes SET DEFAULT 67108864;
INSERT INTO shopeasy.asset_storage_quota(id,used_bytes,max_bytes)
VALUES (1,0,67108864) ON CONFLICT (id) DO NOTHING;
