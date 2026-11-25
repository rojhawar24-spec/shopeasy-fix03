-- Compatibility helpers for the PostgreSQL staging runtime.
CREATE COLLATION shopeasy.nocase (provider = icu, locale = 'und-u-ks-level2', deterministic = true);
CREATE FUNCTION shopeasy.sqlite_timestamp(value text) RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog SET TimeZone = 'UTC' AS $$
BEGIN
  IF value IS NULL OR btrim(value) = '' THEN RETURN NULL; END IF;
  IF value = 'now' THEN RETURN statement_timestamp(); END IF;
  IF value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}([ T].*)?$' THEN RETURN NULL; END IF;
  RETURN value::timestamptz;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN NULL;
END; $$;
CREATE FUNCTION shopeasy.sqlite_datetime(value text) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
SELECT to_char(shopeasy.sqlite_timestamp(value) AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')
$$;
CREATE FUNCTION shopeasy.sqlite_julianday(value text) RETURNS numeric
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
SELECT extract(epoch FROM shopeasy.sqlite_timestamp(value))/86400 + 2440587.5
$$;
CREATE FUNCTION shopeasy.sqlite_date(value text) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
SELECT left(shopeasy.sqlite_datetime(value),10)
$$;
REVOKE ALL ON FUNCTION shopeasy.sqlite_timestamp(text), shopeasy.sqlite_datetime(text), shopeasy.sqlite_julianday(text), shopeasy.sqlite_date(text) FROM PUBLIC, anon, authenticated, service_role;
