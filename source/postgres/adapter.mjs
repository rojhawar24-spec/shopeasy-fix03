// Experimental PostgreSQL adapter foundation. Not selected by the production runtime.
// SQL must be explicitly ported to PostgreSQL before calling these methods.
const SAFE_INT_OIDS = new Set([20, 21, 23]);
function normalizeResult(result) {
  const numeric = new Set((result.fields || []).filter(f => SAFE_INT_OIDS.has(f.dataTypeID)).map(f => f.name));
  const rows = (result.rows || []).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (!numeric.has(key) || value === null) return [key, value];
    const n = Number(value);
    if (!Number.isSafeInteger(n)) throw new RangeError('Unsafe integer returned by PostgreSQL: ' + key);
    return [key, n];
  })));
  return { rows, rowsAffected: result.rowCount ?? 0 };
}
function statement(sql, args = []) {
  if (typeof sql !== 'string' || !sql.trim() || !Array.isArray(args)) throw new TypeError('Expected native PostgreSQL SQL and a positional parameter array');
  return { text: sql, values: args };
}
export function createPostgresAdapter(pool) {
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('A PostgreSQL pool is required');
  async function transaction(mode = 'write') {
    if (!['write', 'read'].includes(mode)) throw new Error('Unsupported transaction mode');
    const client = await pool.connect();
    let closed = false;
    try {
      await client.query(mode === 'write' ? 'BEGIN' : 'BEGIN READ ONLY');
      // All adapter writes, including standalone ones, take the same transaction lock.
      // This preserves SQLite's single-writer assumption while the SQL port is validated.
      if (mode === 'write') await client.query('SELECT pg_advisory_xact_lock(183624, 289503)');
      await client.query('SET LOCAL search_path = pg_catalog, shopeasy, extensions');
      await client.query("SET LOCAL TIME ZONE 'UTC'");
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      client.release(true);
      throw error;
    }
    async function finish(commit) {
      if (closed) throw new Error('Transaction already closed');
      closed = true;
      try { await client.query(commit ? 'COMMIT' : 'ROLLBACK'); }
      catch (error) { client.release(true); throw error; }
      client.release();
    }
    return {
      async execute(sql, args = []) {
        if (closed) throw new Error('Transaction already closed');
        return normalizeResult(await client.query(statement(sql, args)));
      },
      commit: () => finish(true),
      rollback: () => finish(false),
      async close() { if (!closed) await finish(false); }
    };
  }
  async function execute(sql, args = [], mode = 'write') {
    const tx = await transaction(mode);
    try {
      const result = await tx.execute(sql, args);
      await tx.commit();
      return result;
    } catch (error) {
      try { await tx.close(); } catch {}
      throw error;
    }
  }
  return { transaction, execute };
}
