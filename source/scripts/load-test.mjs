import path from 'node:path';
import { fileURLToPath } from 'node:url';

const targets = ['/', '/shop', '/shop?search=a', '/stories', '/privacy', '/terms'];
function positiveInteger(value, fallback) {
  const text = String(value ?? fallback).trim();
  if (!/^[1-9][0-9]*$/.test(text)) throw new Error('LOAD_INPUTS_REQUIRE_POSITIVE_INTEGERS');
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number > 1000) throw new Error('LOAD_INPUTS_EXCEED_BOUNDS');
  return number;
}

export function loadConfiguration(environment = process.env) {
  let url;
  try { url = new URL(environment.BASE_URL || 'http://127.0.0.1:3000'); }
  catch { throw new Error('LOAD_BASE_URL_REQUIRES_HTTP_ORIGIN'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) throw new Error('LOAD_BASE_URL_REQUIRES_HTTP_ORIGIN');
  const clients = positiveInteger(environment.LOAD_CLIENTS, 25);
  const rounds = positiveInteger(environment.LOAD_ROUNDS, 8);
  if (clients * rounds > 100000) throw new Error('LOAD_TOTAL_REQUEST_LIMIT_EXCEEDED');
  return { base: url.origin, clients, rounds };
}

export async function runLoadTest(configuration, { requestTimeoutMs = 5000 } = {}) {
  const { base, clients, rounds } = loadConfiguration({ BASE_URL: configuration.base, LOAD_CLIENTS: configuration.clients, LOAD_ROUNDS: configuration.rounds });
  const checks = [];
  const blocked = targetReachable => ({targetReachable, checks, requests:0, errors:0, rateLimitedResponses:0, clientErrorResponses:0, serverErrorResponses:0, networkErrors:0, statusCodes:{}, skipped:true});
  for (const endpoint of ['/health','/ready']) {
    try {
      const response = await fetch(base + endpoint, { signal: AbortSignal.timeout(requestTimeoutMs), redirect: 'manual' });
      const status = response.status;
      await response.body?.cancel();
      checks.push({ endpoint, status });
      if (status !== 200) return blocked(true);
    } catch { checks.push({ endpoint, networkError: true }); return blocked(false); }
  }
  const samples = [];
  let requests = 0, errors = 0, rateLimitedResponses = 0, clientErrorResponses = 0, serverErrorResponses = 0, networkErrors = 0;
  const statusCodes = {};
  const start = performance.now();
  await Promise.all(Array.from({ length: clients }, async (_, client) => {
    for (let round = 0; round < rounds; round++) {
      requests++;
      const target = targets[(client + round) % targets.length];
      const started = performance.now();
      try {
        const response = await fetch(base + target, { signal: AbortSignal.timeout(requestTimeoutMs), redirect: 'manual' });
        statusCodes[response.status] = (statusCodes[response.status] || 0) + 1;
        if (response.status === 429) rateLimitedResponses++;
        if (response.status >= 400 && response.status < 500) clientErrorResponses++;
        if (response.status >= 500) serverErrorResponses++;
        await response.arrayBuffer();
        // Measure completed response bytes, not only the arrival of headers.
        samples.push(performance.now() - started);
        if (response.status >= 400) errors++;
      } catch { errors++; networkErrors++; }
    }
  }));
  const elapsed = performance.now() - start;
  samples.sort((a, b) => a - b);
  const percentile = p => samples.length ? samples[Math.max(0, Math.ceil(samples.length * p) - 1)] : null;
  const rounded = value => value === null ? null : Number(value.toFixed(1));
  return { targetReachable: true, checks, clients, rounds, requests, completedResponses: samples.length, errors,
    rateLimitedResponses, clientErrorResponses, serverErrorResponses, networkErrors, statusCodes, skipped: false,
    latencyDefinition: 'nearest-rank percentiles from request start through complete response-body consumption; failed-body requests have no latency sample',
    totalMs: Math.round(elapsed), requestsPerSecond: Number((requests / (elapsed / 1000)).toFixed(2)),
    p50Ms: rounded(percentile(.50)), p95Ms: rounded(percentile(.95)), p99Ms: rounded(percentile(.99)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const configuration = loadConfiguration();
    console.log(`Load test target: ${configuration.base} | virtual clients: ${configuration.clients} | rounds/client: ${configuration.rounds}`);
    const result = await runLoadTest(configuration);
    console.log(JSON.stringify(result, null, 2));
    if (result.skipped) {
      console.error('Load test BLOCKED: health and readiness must both return HTTP 200 before measurement.');
      process.exitCode = 2;
    } else if (result.errors) process.exitCode = 1;
  } catch {
    // Invalid origins can contain credentials; never echo input or parser errors.
    console.error('Load test refused: use an HTTP(S) origin without credentials/query/path and bounded positive integer client/round counts.');
    process.exitCode = 2;
  }
}
