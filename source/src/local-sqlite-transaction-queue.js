/**
 * Serializes write transactions for the local @libsql/client SQLite adapter.
 * The remote Turso client must not use this process-local queue: its concurrency
 * is managed by the service and shared across workers.
 */

const MAX_COMMIT_RETRIES = 3;
const COMMIT_RETRY_BASE_DELAY_MS = 25;

function isSqliteBusyError(error) {
  const visited = new Set();
  const pending = [error];
  while (pending.length) {
    const current = pending.pop();
    if (!current || (typeof current !== 'object' && typeof current !== 'string') || visited.has(current)) continue;
    if (typeof current === 'object') visited.add(current);
    const code = String(typeof current === 'object' ? (current.code ?? current.rawCode ?? current.sqliteCode ?? '') : '').toUpperCase();
    if (['SQLITE_BUSY', 'SQLITE_LOCKED', '5', '6'].includes(code) || current?.retryableSqliteBusy === true) return true;
    const message = typeof current === 'string' ? current : String(current.message ?? current);
    if (/\bSQLITE_(?:BUSY|LOCKED)\b|\bdatabase (?:is )?locked\b/i.test(message)) return true;
    if (typeof current === 'object') {
      if (current.cause) pending.push(current.cause);
      if (current.originalError) pending.push(current.originalError);
      if (current.error && current.error !== current) pending.push(current.error);
    }
  }
  return false;
}

export function installLocalSqliteTransactionQueue(client) {
  if (!client || typeof client.transaction !== 'function') {
    throw new TypeError('A libSQL client with transaction() is required');
  }

  let tail = Promise.resolve();
  const nativeTransaction = client.transaction.bind(client);

  async function acquireSlot() {
    const previous = tail;
    let unlock;
    tail = new Promise(resolve => { unlock = resolve; });
    await previous;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      unlock();
    };
  }

  client.transaction = async function transactionWithLocalWriteQueue(mode = 'write', ...args) {
    const isWrite = mode === 'write' || mode === 'deferred';
    const release = isWrite ? await acquireSlot() : () => {};
    let tx;
    try {
      tx = await nativeTransaction(mode, ...args);
    } catch (error) {
      release();
      throw error;
    }

    let released = false;
    const releaseOnce = () => {
      if (released) return;
      released = true;
      release();
    };

    let nativeCommit;
    let nativeRollback;
    let nativeClose;
    try {
      nativeCommit = tx.commit.bind(tx);
      nativeRollback = tx.rollback.bind(tx);
      nativeClose = typeof tx.close === 'function' ? tx.close.bind(tx) : null;
    } catch (error) {
      try {
        if (typeof tx.rollback === 'function') await tx.rollback();
      } catch {
        try { if (typeof tx.close === 'function') await tx.close(); } catch {}
      } finally {
        releaseOnce();
      }
      throw error;
    }

    return new Proxy(tx, {
      get(target, property) {
        if (property === 'commit') return async (...commitArgs) => {
          let retries = 0;
          while (true) {
            try {
              const result = await nativeCommit(...commitArgs);
              releaseOnce();
              return result;
            } catch (error) {
              const busy = isSqliteBusyError(error);
              if (busy && retries < MAX_COMMIT_RETRIES) {
                const delayMs = COMMIT_RETRY_BASE_DELAY_MS * (2 ** retries);
                retries += 1;
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue;
              }

              // After three retries, preserve the busy signal so checkout can
              // retry the complete order transaction rather than only COMMIT.
              // This also handles LibsqlError wrappers that expose the code only
              // in the message or cause chain.
              if (busy && error && typeof error === 'object') {
                try { Object.defineProperty(error, 'retryableSqliteBusy', { value: true, configurable: true }); } catch {}
              }
              // Final cleanup is mandatory before the writer slot is released.
              // Do not leave a failed transaction holding a local write slot.
              try { await nativeRollback(); } catch {}
              try { if (nativeClose) await nativeClose(); } catch {}
              finally { releaseOnce(); }
              if (error && typeof error === 'object') {
                try { Object.defineProperty(error, 'localSqliteTransactionCleanupAttempted', { value: true, configurable: true }); } catch {}
              }
              throw error;
            }
          }
        };

        if (property === 'rollback') return async (...rollbackArgs) => {
          try {
            return await nativeRollback(...rollbackArgs);
          } catch (error) {
            if (nativeClose) {
              try { await nativeClose(); } catch {}
            }
            throw error;
          } finally {
            releaseOnce();
          }
        };

        if (property === 'close' && nativeClose) return (...closeArgs) => {
          let result;
          try {
            result = nativeClose(...closeArgs);
          } catch (error) {
            releaseOnce();
            throw error;
          }
          if (result && typeof result.then === 'function') {
            return result.finally(releaseOnce);
          }
          releaseOnce();
          return result;
        };

        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  };

  return client;
}
