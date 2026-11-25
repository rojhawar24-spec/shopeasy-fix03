#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true, debug: false });

function configuredLocalDatabasePath() {
  const configured = String(process.env.DATABASE_URL || process.env.SHOP_DATABASE_URL || '').trim();
  if (!configured) return path.join(root, 'data', 'shop.db');
  if (!/^file:/i.test(configured)) {
    throw new Error('Refusing remote database target. This emergency CLI is local-SQLite-only; set DATABASE_URL=file:... for the intended local database.');
  }
  const raw = configured.slice(configured.indexOf(':') + 1);
  const decoded = decodeURIComponent(raw.split(/[?#]/, 1)[0]);
  return path.resolve(root, decoded);
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let db;
let tx;
const rl = createInterface({ input: stdin, output: stdout });
try {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('A real interactive SSH terminal is required. Non-interactive execution is refused.');
  const databasePath = configuredLocalDatabasePath();
  let stats;
  try { stats = fs.lstatSync(databasePath); } catch { throw new Error(`Database file not found: ${databasePath}. Start ShopEasy once and verify DATABASE_URL.`); }
  if (stats.isSymbolicLink() || !stats.isFile() || stats.size === 0) throw new Error('Database target must be a non-empty regular file, not a symlink.');

  const email = String(await rl.question('Manager e-mailadres: ')).trim().toLowerCase();
  if (!emailPattern.test(email) || email.length > 120) throw new Error('Enter a valid Manager email address. Nothing was changed.');
  console.log(`Database: ${databasePath}`);
  const confirmation = String(await rl.question('Type exactly "RESET MFA" to continue: ')).trim();
  if (confirmation !== 'RESET MFA') throw new Error('Confirmation did not match. MFA was not changed.');

  // Import only after interactive confirmation. Force the exact checked local file
  // so inherited aliases or remote credentials cannot silently redirect the action.
  process.env.DATABASE_URL = pathToFileURL(databasePath).href;
  delete process.env.SHOP_DATABASE_URL;
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  delete process.env.CLOUDFLARE_WORKER;
  const database = await import('../src/database.js');
  db = database.db;
  const target = (await db.execute({
    sql: "SELECT id,email,role FROM users WHERE lower(email)=? AND role='manager' LIMIT 1",
    args: [email]
  })).rows[0];
  if (!target) throw new Error(`No Manager account found for ${email}. Nothing was changed.`);

  tx = await db.transaction('write');
  const updated = await tx.execute({
    sql: "UPDATE users SET mfa_secret=NULL,mfa_enabled=0,mfa_recovery_codes_hash=NULL,mfa_last_totp_step=NULL WHERE id=? AND role='manager'",
    args: [Number(target.id)]
  });
  if (Number(updated.rowsAffected) !== 1) throw new Error('Manager MFA state was not updated. Transaction rolled back.');

  const challengeCountBefore = await tx.execute({ sql: 'SELECT COUNT(*) AS count FROM mfa_login_challenges WHERE user_id=?', args: [Number(target.id)] });
  const revokedPendingSessions = await tx.execute({
    sql: 'DELETE FROM sessions WHERE id IN (SELECT session_id FROM mfa_login_challenges WHERE user_id=?)',
    args: [Number(target.id)]
  });
  const revokedManagerSessions = await tx.execute({ sql: 'DELETE FROM sessions WHERE user_id=?', args: [Number(target.id)] });
  const challenges = await tx.execute({ sql: 'DELETE FROM mfa_login_challenges WHERE user_id=?', args: [Number(target.id)] });
  await tx.execute({ sql: 'DELETE FROM mfa_rate_limits WHERE user_id=?', args: [Number(target.id)] });

  const actor = String(process.env.SUDO_USER || process.env.SSH_USER || process.env.USER || 'unknown-shell-user').slice(0, 120);
  const meta = JSON.stringify({ email: target.email, source: 'ssh-cli', actor, revokedPendingSessions: Number(revokedPendingSessions.rowsAffected || 0), revokedManagerSessions: Number(revokedManagerSessions.rowsAffected || 0), deletedChallenges: Number(challengeCountBefore.rows[0]?.count || 0) });
  await tx.execute({
    sql: "INSERT INTO audit_logs(user_id,action,target_type,target_id,meta_json) VALUES(NULL,'manager_mfa_reset_cli','manager',?,?)",
    args: [String(target.id), meta]
  });
  await tx.commit();
  tx = null;
  console.log(`MFA gereset voor ${target.email}. Manager moet opnieuw MFA setupen bij volgende login.`);
  console.log(`Audit trail opgeslagen; uitvoerder: ${actor}.`);
} catch (error) {
  try { await tx?.rollback(); } catch {}
  console.error(`MFA reset mislukt: ${String(error?.message || 'Onbekende fout').slice(0, 300)}`);
  process.exitCode = 1;
} finally {
  rl.close();
  try { await db?.close?.(); } catch {}
}
