#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hashPassword } from '../src/password-hashing.js';
import { isStrongEnoughPassword } from '../src/security.js';

const role = String(process.argv[2] || '').trim().toLowerCase();
const options = process.argv.slice(3);
const localMode = options.includes('--local');
const invalidOptions = options.some(option => option !== '--local');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localDatabasePath = path.join(root, 'data', 'shop.db');

if (role !== 'manager' || invalidOptions) {
  console.error('Usage: npm run staff:create -- manager [--local]');
  console.error('This recovery/provisioning command can create only a Manager; restricted Admin accounts must be created from the Manager screen at /admin/staff.');
  console.error('Use --local for this extracted project folder\'s existing data/shop.db; without it, an explicit Turso target is required.');
  process.exitCode = 2;
} else {
  let databaseUrl = '';
  let authToken = '';
  let parsedUrl;
  let targetLabel = '';
  let setupError = '';

  if (localMode) {
    // Local mode is explicit and must always resolve to the same database that
    // src/database.js uses for local Node development. Do not create an empty DB
    // by accident: first start ShopEasy once so its schema and initial Manager exist.
    try {
      const stats = fs.lstatSync(localDatabasePath);
      if (stats.isSymbolicLink() || !stats.isFile() || stats.size === 0) setupError = 'The local database file is empty or is not a regular file.';
      else targetLabel = `local SQLite database: ${localDatabasePath}`;
    } catch {
      setupError = `Local database file not found: ${localDatabasePath}. Start ShopEasy once from this project folder first, then stop the server and retry.`;
    }
  } else {
    databaseUrl = String(process.env.TURSO_DATABASE_URL || '').trim();
    authToken = String(process.env.TURSO_AUTH_TOKEN || '').trim();
    try { parsedUrl = new URL(databaseUrl); } catch {}
    if (!databaseUrl || !authToken || !parsedUrl || !['libsql:', 'https:'].includes(parsedUrl.protocol)) {
      setupError = 'Refusing to run: set TURSO_DATABASE_URL (libsql:// or https:// URL) and TURSO_AUTH_TOKEN for the exact target database. No local database fallback is allowed unless --local is explicitly supplied.';
    } else {
      targetLabel = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname === '/' ? '' : parsedUrl.pathname.replace(/\/+$/, '')}`;
    }
  }

  if (setupError) {
    console.error(setupError);
    process.exitCode = 2;
  } else {
    let db;
    let lineReader;
    try {
      // Keep a persistent line reader plus a tiny queue so sequential prompts do
      // not drop lines when stdin has already buffered input (e.g. automated QA).
      const pendingLines = [];
      const lineWaiters = [];
      lineReader = createInterface({ input: stdin, output: stdout });
      lineReader.on('line', line => {
        const waiter = lineWaiters.shift();
        if (waiter) waiter.resolve(String(line).trim());
        else pendingLines.push(String(line));
      });
      lineReader.on('close', () => {
        for (const waiter of lineWaiters.splice(0)) waiter.reject(new Error('Input closed before a response was received.'));
      });
      function askLine(prompt) {
        stdout.write(prompt);
        if (!lineReader) return Promise.reject(new Error('Text prompt is unavailable.'));
        if (pendingLines.length) return Promise.resolve(String(pendingLines.shift()).trim());
        return new Promise((resolve, reject) => lineWaiters.push({ resolve, reject }));
      }

      function askSecret(prompt) {
        if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
          lineReader?.close();
          lineReader = null;
          return Promise.reject(new Error('A real interactive terminal is required so the password can be hidden while typing.'));
        }
        // Readline and raw key handling must never compete for the same input stream.
        lineReader?.close();
        lineReader = null;
        return new Promise((resolve, reject) => {
          let value = '';
          let done = false;
          const cleanup = () => {
            if (done) return;
            done = true;
            stdin.off('data', onData);
            stdin.setRawMode(false);
            stdin.pause();
            stdout.write('\n');
          };
          const onData = chunk => {
            for (const ch of chunk.toString('utf8')) {
              if (ch === '\u0003') { cleanup(); reject(new Error('Cancelled by user.')); return; }
              if (ch === '\r' || ch === '\n') { cleanup(); resolve(value); return; }
              if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
              else if (ch >= ' ') value += ch;
            }
          };
          stdout.write(prompt);
          stdin.setRawMode(true);
          stdin.resume();
          stdin.on('data', onData);
        });
      }

      // Do all prompting and input validation before importing src/db.js. That module
      // runs schema DDL on import, so rejection/cancellation must not touch any DB.
      console.log(`Target database (credentials omitted): ${targetLabel}`);
      const targetConfirmation = await askLine('Type the exact target database label to continue: ');
      if (targetConfirmation !== targetLabel) throw new Error('Database target confirmation did not match. Nothing was created or initialized.');
      const roleConfirmation = await askLine(`Type "${role.toUpperCase()}" to confirm the privilege level: `);
      if (roleConfirmation !== role.toUpperCase()) throw new Error('Role confirmation did not match. Nothing was created or initialized.');

      const fullName = await askLine('Staff full name: ');
      const email = (await askLine('Staff email: ')).toLowerCase();
      if (!fullName || fullName.length > 120) throw new Error('Enter a name between 1 and 120 characters.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new Error('Enter a valid email address (maximum 120 characters).');
      const password = await askSecret('New password (hidden, 15–200 characters; avoid common/repeated passwords): ');
      const confirm = await askSecret('Repeat password (hidden): ');
      if (!isStrongEnoughPassword(password)) throw new Error('Use a password with 15–200 characters that is not common or repeated.');
      if (password !== confirm) throw new Error('Passwords do not match. Nothing was created or initialized.');

      // Select the DB adapter only after exact target, role and password confirmation.
      // --local deliberately removes any inherited remote override so it cannot point
      // at a different database than this project's data/shop.db.
      if (localMode) {
        // DATABASE_URL has priority over every compatibility alias in database.js.
        // Pin it to the exact file already checked above so an inherited remote or
        // alternate local DATABASE_URL cannot redirect Manager creation.
        process.env.DATABASE_URL = pathToFileURL(localDatabasePath).href;
        delete process.env.TURSO_DATABASE_URL;
        delete process.env.TURSO_AUTH_TOKEN;
        delete process.env.SHOP_DATABASE_URL;
        delete process.env.CLOUDFLARE_WORKER;
      } else {
        // The primary DATABASE_URL wins over SHOP_DATABASE_URL in database.js.
        // Remove it so this explicitly confirmed remote Turso target is the one used.
        delete process.env.DATABASE_URL;
        process.env.SHOP_DATABASE_URL = databaseUrl;
        process.env.TURSO_AUTH_TOKEN = authToken;
        delete process.env.TURSO_DATABASE_URL;
        delete process.env.CLOUDFLARE_WORKER;
      }
      const database = await import('../src/database.js');
      db = database.db;
      const { createUser, getUserAuthByEmail, createAudit } = await import('../src/db.js');
      if (await getUserAuthByEmail(email)) throw new Error('An account with this email already exists. No account or role was changed.');
      const { getRow } = await import('../src/database.js');
      if (await getRow("SELECT id FROM users WHERE role='manager' LIMIT 1")) throw new Error('A Manager account already exists. Use /admin/staff to manage Admins and change the existing Manager credentials. This command will not create an additional Manager.');

      async function safeAudit(...args) {
        try { await createAudit(...args); }
        catch { console.error('Staff account created, but its audit log entry could not be stored.'); }
      }

      const userId = await createUser(email, await hashPassword(password), role, fullName, null);
      await safeAudit(null, 'staff_account_created', 'user', userId, { email, role, source: localMode ? 'one-time-cli-local' : 'one-time-cli-turso' });
      console.log(`Created ${role} account for ${email} (user ID ${userId}) in the ${localMode ? 'local SQLite' : 'configured Turso'} database.`);
      console.log('Next: test sign-in, verify role access, and remove any temporary database credentials from local files.');
    } catch (error) {
      console.error(`Staff provisioning failed: ${error?.message || 'Unknown error'}`);
      process.exitCode = 1;
    } finally {
      try { lineReader?.close(); } catch {}
      try { await db?.close?.(); } catch {}
    }
  }
}
