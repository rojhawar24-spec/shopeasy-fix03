#!/usr/bin/env python3
"""Self-contained SQL-DDL evidence only. Not an application integration test."""
from pathlib import Path
import re,sqlite3
root=Path(__file__).resolve().parents[1]
source=(root/'src/db.js').read_text()
blocks=re.findall(r'await executeMultiple\(`([\s\S]*?)`\);',source)
assert len(blocks)==3, f"Expected 3 DDL blocks, got {len(blocks)}"
con=sqlite3.connect(':memory:')
con.execute('PRAGMA foreign_keys = ON')
for _ in range(2):
    for block in blocks: con.executescript(block)
num_tables=con.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
num_indexes=con.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='index'").fetchone()[0]
assert num_tables>=30 and num_indexes>=40,(num_tables,num_indexes)
assert con.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not con.execute('PRAGMA foreign_key_check').fetchall()
checks=[]
def reject(label,operation):
    try: operation();con.commit()
    except sqlite3.IntegrityError:con.rollback();checks.append(label);return
    raise AssertionError('Expected SQL constraint rejection: '+label)
con.execute("INSERT INTO products(name,slug,price_cents,sku,stock) VALUES ('Audit product','audit-product',1234,'AUDIT-1',1)")
con.commit()
reject('negative product stock',lambda:con.execute('UPDATE products SET stock=-1 WHERE sku=?',('AUDIT-1',)))
reject('negative reserved stock',lambda:con.execute('UPDATE products SET reserved_stock=-1 WHERE sku=?',('AUDIT-1',)))
reject('negative product price',lambda:con.execute('UPDATE products SET price_cents=-1 WHERE sku=?',('AUDIT-1',)))
con.execute("INSERT INTO gift_cards(code_hash,currency,original_amount_cents,balance_cents) VALUES ('audit-hash','EUR',1000,1000)")
con.commit()
reject('negative gift-card balance',lambda:con.execute("UPDATE gift_cards SET balance_cents=-1 WHERE code_hash='audit-hash'"))
reject('gift-card balance above original',lambda:con.execute("UPDATE gift_cards SET balance_cents=1001 WHERE code_hash='audit-hash'"))
ins="""INSERT INTO orders(email,subtotal_cents,total_cents,shipping_name,shipping_address,shipping_city,shipping_postal_code,client_token) VALUES (?,?,?,?,?,?,?,?)"""
vals=('audit@example.invalid',1234,1234,'Audit','Street','Town','1234','AUDIT-CHECKOUT-TOKEN')
con.execute(ins,vals)
con.commit()
reject('duplicate checkout client token',lambda:con.execute(ins,vals))
print(f'SQL DDL PASS: {len(blocks)} DDL blocks x2; {num_tables} tables, {num_indexes} indexes, integrity_check ok; {len(checks)} constraint probes passed')
