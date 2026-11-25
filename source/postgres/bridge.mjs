import {createPostgresAdapter} from './adapter.mjs';
import {compileLegacyQuery} from './legacy-query.mjs';

// Explicit opt-in bridge for staging integration tests, not a production switch.
// The caller owns the pool, its credentials and its shutdown lifecycle.
export function createLegacyBridge(pool, {runtime = false} = {}) {
  const native = createPostgresAdapter(pool);
  function compile(input) {
    return typeof input === 'string' ? compileLegacyQuery(input, [], {runtime}) : compileLegacyQuery(input.sql,input.args ?? [], {runtime});
  }
  function wrap(tx) {
    return {
      execute(input) { const q=compile(input); return tx.execute(q.text,q.values); },
      commit:()=>tx.commit(),
      rollback:()=>tx.rollback(),
      close:()=>tx.close()
    };
  }
  return {
    close:()=>pool.end(),
    execute(input) { const q=compile(input); return native.execute(q.text,q.values); },
    async transaction(mode='write') { return wrap(await native.transaction(mode)); },
    async batch(statements,mode='write') {
      const tx=wrap(await native.transaction(mode));
      try {
        const result=[];
        for(const statement of statements) result.push(await tx.execute(statement));
        await tx.commit();
        return result;
      } catch(error) {
        try{await tx.close();}catch{}
        throw error;
      }
    }
  };
}
