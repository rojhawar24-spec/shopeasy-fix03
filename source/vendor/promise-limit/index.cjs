'use strict';

// Newly authored R27 first-party implementation, not copied upstream code.
// The npm override supplies the callable interface used by @libsql/client.
module.exports = function createTaskLimiter(concurrency = 0) {
  const capacity = concurrency === 0 || concurrency === Infinity ? Infinity : concurrency;
  if (typeof capacity !== 'number' || (capacity !== Infinity && (!Number.isSafeInteger(capacity) || capacity < 1))) {
    throw new RangeError('Task concurrency must be a nonnegative safe integer or Infinity.');
  }
  let active = 0;
  let queue = [];
  let cursor = 0;

  function drain() {
    while (active < capacity && cursor < queue.length) {
      const job = queue[cursor++];
      active++;
      Promise.resolve().then(job.run).then(
        value => finish(job, true, value),
        error => finish(job, false, error)
      );
    }
    if (cursor === queue.length) { queue = []; cursor = 0; }
    else if (cursor > 1024 && cursor * 2 > queue.length) { queue = queue.slice(cursor); cursor = 0; }
  }
  function finish(job, succeeded, result) {
    active--;
    if (succeeded) job.resolve(result); else job.reject(result);
    drain();
  }
  function limit(run) {
    if (typeof run !== 'function') return Promise.reject(new TypeError('A task function is required.'));
    return new Promise((resolve, reject) => { queue.push({ run, resolve, reject }); drain(); });
  }
  Object.defineProperty(limit, 'queue', { enumerable: true, get: () => queue.length - cursor });
  return limit;
};
