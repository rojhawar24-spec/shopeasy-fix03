from pathlib import Path
import sqlite3,re, tempfile, concurrent.futures, secrets
s=(Path(__file__).resolve().parents[1] / 'src' / 'db.js').read_text()
head=s.index('await executeMultiple(`')+len('await executeMultiple(`')
tail=s.index('`);',head)
sql=s[head:tail]
print('DDL characters',len(sql),'DDL contains interpolation', '${' in sql)
with tempfile.TemporaryDirectory() as d:
 path=d+'/shop.db'
 con=sqlite3.connect(path,timeout=5,check_same_thread=False)
 con.execute('PRAGMA foreign_keys=ON');con.executescript(sql)
 # Idempotent schema replay
 con.executescript(sql)
 tables={r[0] for r in con.execute("select name from sqlite_master where type='table'")}
 print('SQLite actual schema PASS; table count',len(tables))
 assert {'gift_cards','gift_card_ledger','peppol_submissions','orders','settings','products'}.issubset(tables)
 con.execute("INSERT INTO users(id,email,password_hash,role) VALUES(1,'manager@test.invalid','hash','manager')")
 card_code_hash=secrets.token_hex(32)
 con.execute("INSERT INTO gift_cards(id,code_hash,currency,original_amount_cents,balance_cents,issued_by_user_id) VALUES (1,?,'EUR',5000,5000,1)",(card_code_hash,))
 con.commit();con.close()
 # 16 concurrent workers all attempt to debit 3000, only one succeeds because balance is insufficient for two.
 def debit(_):
  db=sqlite3.connect(path,timeout=10,isolation_level=None)
  db.execute('PRAGMA busy_timeout=10000')
  try:
   db.execute('BEGIN IMMEDIATE')
   updated=db.execute("UPDATE gift_cards SET balance_cents=balance_cents-3000 WHERE id=1 AND balance_cents>=3000").rowcount
   db.execute('COMMIT')
   return updated
  except Exception as e:
   try:db.execute('ROLLBACK')
   except:pass
   raise
  finally:db.close()
 with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool: outcomes=list(pool.map(debit,range(16)))
 assert sum(outcomes)==1,(outcomes,sum(outcomes))
 con=sqlite3.connect(path)
 assert con.execute('SELECT balance_cents FROM gift_cards WHERE id=1').fetchone()[0]==2000
 print('Concurrent balance withdrawal CAS PASS — 16 attempts, 1 debit, final €20.00')
 # uniqueness of event for a single order, requiring valid FK
 con.execute('INSERT INTO orders(id,email,shipping_name,shipping_address,shipping_city,shipping_postal_code,shipping_country,subtotal_cents,total_cents,currency,client_token,terms_accepted_at,terms_locale,payment_provider) VALUES(1,?,?,?,?,?, ?, ?, ?, ?, ?, ?, ?, ?)', ('customer@test.invalid','Customer','Street 1','City','1000','Belgium',3000,3000,'EUR','one-off-unique-token','2026-11-04T00:00:00Z','en','gift_card'))
 con.execute("INSERT INTO gift_card_ledger(gift_card_id,order_id,event,amount_cents) VALUES(1,1,'redeem',3000)")
 try:
  con.execute("INSERT INTO gift_card_ledger(gift_card_id,order_id,event,amount_cents) VALUES(1,1,'redeem',3000)")
  raise AssertionError('double redeem incorrectly accepted')
 except sqlite3.IntegrityError:pass
 print('Gift redemption uniqueness PASS')
 con.close()
