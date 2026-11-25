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
    // This one fixed, fully qualified function owns its independent database
    // transaction lock. PostgreSQL commits the single statement atomically.
    // Never expose a general-purpose lock-free write entry point.
    async consumeRequestLimit(actorKey,max,windowMs) {
      if(typeof actorKey!=='string'||!/^[a-f0-9]{64}$/.test(actorKey)||!Number.isSafeInteger(max)||max<1||max>100000||!Number.isSafeInteger(windowMs)||windowMs<1000||windowMs>86400000)throw new TypeError('Invalid request limit');
      const result=await pool.query({text:'SELECT * FROM shopeasy.consume_request_limit($1::text,$2::bigint,$3::bigint)',values:[actorKey,max,windowMs]});
      const row=result.rows?.[0];
      if(!row||typeof row.allowed!=='boolean'||row.remaining==null||row.reset_at==null)throw new Error('Invalid request limit response');
      const remaining=Number(row.remaining),reset_at=Number(row.reset_at);
      if(!Number.isSafeInteger(remaining)||remaining<0||remaining>max||!Number.isSafeInteger(reset_at)||reset_at<0)throw new Error('Invalid request limit response');
      return {allowed:row.allowed,remaining,reset_at};
    },
    close:()=>pool.end(),
    execute(input) { const q=compile(input); return native.execute(q.text,q.values); },
    executeRead(input) { const q=compile(input); return native.execute(q.text,q.values,'read'); },
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
