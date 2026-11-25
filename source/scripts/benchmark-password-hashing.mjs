#!/usr/bin/env node
// Run this on the actual persistent Node.js staging host. This measures the
// application's real PBKDF2 path, not Cloudflare's production runtime or CPU quota.
import { performance } from 'node:perf_hooks';
import { hashPassword, verifyPassword } from '../src/password-hashing.js';

const rounds = Number.parseInt(process.env.PASSWORD_BENCHMARK_ROUNDS || '3', 10);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) {
  console.error('PASSWORD_BENCHMARK_ROUNDS must be an integer from 1 to 10.');
  process.exit(2);
}
const password = `ShopEasy-benchmark-only-${process.pid}-not-a-real-account!`;
const hashMs = [];
const verifyGoodMs = [];
const verifyBadMs = [];
const cpuStart = process.cpuUsage();
const wallStart = performance.now();

for (let i = 0; i < rounds; i += 1) {
  let start = performance.now();
  const hash = await hashPassword(password);
  hashMs.push(performance.now() - start);
  if (!/^pbkdf2\$600000\$sha256\$/.test(hash)) throw new Error('Hash format/work factor is not the expected 600,000-iteration PBKDF2-SHA256.');

  start = performance.now();
  const accepted = await verifyPassword(password, hash);
  verifyGoodMs.push(performance.now() - start);
  if (!accepted) throw new Error('Correct password was rejected.');

  start = performance.now();
  const rejected = await verifyPassword(`${password}-wrong`, hash);
  verifyBadMs.push(performance.now() - start);
  if (rejected) throw new Error('Incorrect password was accepted.');
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    minMs: Number(sorted[0].toFixed(1)),
    medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(1)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(1))
  };
}
const cpu = process.cpuUsage(cpuStart);
console.log(JSON.stringify({
  benchmark: 'ShopEasy PBKDF2-SHA256 password path; staging-only, no account/database writes',
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  iterations: 600000,
  rounds,
  hash: stats(hashMs),
  verifyCorrectPassword: stats(verifyGoodMs),
  verifyWrongPassword: stats(verifyBadMs),
  totalWallMs: Number((performance.now() - wallStart).toFixed(1)),
  processCpuMs: Number(((cpu.user + cpu.system) / 1000).toFixed(1)),
  checks: { correctPasswordAccepted: true, wrongPasswordRejected: true, hashFormatCorrect: true },
  note: 'Run on the actual intended Node.js staging host. These timings do not certify Cloudflare Workers or a different host.'
}, null, 2));
