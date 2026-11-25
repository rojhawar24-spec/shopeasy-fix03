#!/usr/bin/env node
// Generates a 128-bit random identifier for LICENSE_KEY. This is not a signed token
// and does not prove ownership or enforce a license; keep the value private.
import { randomBytes } from 'node:crypto';
process.stdout.write(`${randomBytes(16).toString('hex')}\n`);
