import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('pending orders have no automatic time limit or reservation-hours setting',()=>{
  const db=read('src/db.js');
  const server=read('src/server.js');
  const settings=read('views/admin/settings.ejs');
  const order=read('views/admin/order-cash.ejs');
  assert.doesNotMatch(server,/reservation_hours|reservationHours|reservationMinutes|Expired checkout reservation/);
  assert.doesNotMatch(db,/isValidReservationMinutes|reservationMinutes=|Checkout reservation expired|Reservation expired before manager acceptance/);
  assert.doesNotMatch(settings,/Time reserved for a new order|reservationHours|Pending-order stock hold/);
  assert.match(db,/status='processing'.*status='pending'.*payment_provider='cash_on_delivery'/);
  assert.match(order,/There is no automatic time limit/);
});

test('manager order pages display relative age and preserve the exact timestamp as a tooltip',()=>{
  const server=read('src/server.js');
  const list=read('views/admin/orders.ejs');
  const detail=read('views/admin/order-cash.ejs');
  assert.match(server,/app\.locals\.formatRelativeTime/);
  assert.match(list,/formatRelativeTime\(o\.created_at\)/);
  assert.match(detail,/formatRelativeTime\(order\.created_at\)/);
  assert.match(list,/formatDateTimeDisplay\(o\.created_at,storeTimeZone\)/);
});
