-- Shared request protection for the server-side ShopEasy runtime.
CREATE TABLE shopeasy.request_rate_limits (
  actor_key text PRIMARY KEY CHECK (actor_key ~ '^[0-9a-f]{64}$'),
  expires_ms bigint NOT NULL,
  hits bigint NOT NULL CHECK (hits >= 1)
);
CREATE INDEX request_rate_limits_expiry ON shopeasy.request_rate_limits(expires_ms);
ALTER TABLE shopeasy.request_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE shopeasy.request_rate_limits FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION shopeasy.consume_request_limit(p_key text, p_limit bigint, p_window bigint)
RETURNS TABLE(allowed boolean, remaining bigint, reset_at bigint)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  v_now bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_hits bigint;
  v_expiry bigint;
BEGIN
  IF p_key IS NULL OR p_key !~ '^[0-9a-f]{64}$' OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100000 OR p_window IS NULL OR p_window < 1000 OR p_window > 86400000 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters';
  END IF;
  -- Separate transaction lock makes the maximum number of active keys a hard bound.
  PERFORM pg_advisory_xact_lock(183624, 289504);
  DELETE FROM shopeasy.request_rate_limits WHERE expires_ms <= v_now;
  IF NOT EXISTS (SELECT 1 FROM shopeasy.request_rate_limits WHERE actor_key=p_key)
     AND (SELECT count(*) FROM shopeasy.request_rate_limits) >= 50000 THEN
    RAISE EXCEPTION 'Shared request limit capacity exhausted';
  END IF;
  INSERT INTO shopeasy.request_rate_limits(actor_key, expires_ms, hits)
  VALUES (p_key, v_now+p_window, 1)
  ON CONFLICT(actor_key) DO UPDATE SET hits=least(shopeasy.request_rate_limits.hits+1,p_limit+1)
  RETURNING hits, expires_ms INTO v_hits, v_expiry;
  RETURN QUERY SELECT v_hits <= p_limit, greatest(0::bigint,p_limit-v_hits), (v_expiry+999)/1000;
END;
$$;
REVOKE ALL ON FUNCTION shopeasy.consume_request_limit(text,bigint,bigint) FROM PUBLIC, anon, authenticated, service_role;
