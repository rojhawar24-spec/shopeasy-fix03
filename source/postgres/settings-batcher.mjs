// Coalesce concurrent settings reads only; do not cache values across batches.
export function createSettingsBatcher(readMany) {
  let pending=new Map();
  let scheduled=false;
  async function flush(){
    const batch=pending;
    pending=new Map();
    scheduled=false;
    const keys=[...batch.keys()];
    for(let i=0;i<keys.length;i+=64){
      const chunk=keys.slice(i,i+64);
      try {
        const values=await readMany(chunk);
        for(const key of chunk){
          const value=values.get(key);
          for(const item of batch.get(key)) item.resolve(value??item.fallback);
        }
      } catch(error) {
        for(const key of chunk) for(const item of batch.get(key)) item.reject(error);
      }
    }
  }
  return (key,fallback='')=>new Promise((resolve,reject)=>{
    if(!pending.has(key))pending.set(key,[]);
    pending.get(key).push({resolve,reject,fallback});
    if(!scheduled){scheduled=true;queueMicrotask(flush);}
  });
}
