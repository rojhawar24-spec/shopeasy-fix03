-- Isolated smoke checks against the PostgreSQL staging schema.
-- The inner subtransaction deliberately rolls back all fixture changes.
DO $test$
DECLARE _path TEXT; p BIGINT; o BIGINT; i INTEGER; before_bytes BIGINT; after_bytes BIGINT;
BEGIN
  BEGIN
    INSERT INTO shopeasy.products(name,slug,sku,price_cents,stock) VALUES('SQL verification fixture','sql-check-'||gen_random_uuid(),'sql-check-'||gen_random_uuid(),1000,5) RETURNING id INTO p;
    FOR i IN 1..6 LOOP
      INSERT INTO shopeasy.product_images(product_id,image_url) VALUES(p,'/sql-check-'||i);
    END LOOP;
    BEGIN
      INSERT INTO shopeasy.product_images(product_id,image_url) VALUES(p,'/sql-check-7');
      RAISE EXCEPTION 'Gallery accepted seventh image';
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM <> 'IMAGE_GALLERY_LIMIT' THEN RAISE; END IF;
    END;
    INSERT INTO shopeasy.orders(email,subtotal_cents,total_cents,shipping_name,shipping_address,shipping_city,shipping_postal_code) VALUES('sql-check@example.invalid',1000,1000,'Fixture','Fixture','Fixture','0000') RETURNING id INTO o;
    IF (SELECT count(*) FROM shopeasy.order_status_history WHERE order_id=o AND to_status='pending')<>1 THEN RAISE EXCEPTION 'Missing initial order history'; END IF;
    UPDATE shopeasy.orders SET status='cancelled', cancellation_reason='SQL verification' WHERE id=o;
    IF (SELECT count(*) FROM shopeasy.order_status_history WHERE order_id=o AND from_status='pending' AND to_status='cancelled' AND note='SQL verification')<>1 THEN RAISE EXCEPTION 'Missing cancellation history'; END IF;
    INSERT INTO shopeasy.asset_storage_quota(id,used_bytes,max_bytes) VALUES(1,0,67108864) ON CONFLICT(id) DO NOTHING;
    UPDATE shopeasy.asset_storage_quota SET used_bytes=used_bytes+3 WHERE id=1 RETURNING used_bytes INTO before_bytes;
    INSERT INTO shopeasy.uploaded_assets(path,content_type,data) VALUES('/sql-check-'||gen_random_uuid(),'image/png',decode('010203','hex')) RETURNING path INTO STRICT _path;
    DELETE FROM shopeasy.uploaded_assets WHERE path=_path;
    SELECT used_bytes INTO after_bytes FROM shopeasy.asset_storage_quota WHERE id=1;
    IF after_bytes<>before_bytes-3 THEN RAISE EXCEPTION 'Asset quota trigger failed'; END IF;
    RAISE EXCEPTION USING ERRCODE='Z0001', MESSAGE='Fixture rollback';
  EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
  END;
END $test$;
SELECT 'PASS' AS result, 'gallery limit, order history, asset quota, fixture rollback' AS checks;