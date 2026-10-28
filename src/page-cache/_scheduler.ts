// When pages are drawn: at most two at a time, whatever wants them. The screen's pages (`now`) go
// first, then `ahead`, then `later`, which also waits while any `now` draw is queued or running.
// Two requests for the same key share one draw, which is cancelled when every requester has
// aborted, and not before.

import type { Priority } from './types';

/** Draws at once: two overlap well (the worker reads one while the other is painted); more only use up memory. */
const AT_ONCE = 2;
const ORDER: Priority[] = ['now', 'ahead', 'later'];

interface Job {
  key: string;
  priority: Priority;
  controller: AbortController;
  requesters: number;
  run: (signal: AbortSignal) => Promise<unknown>;
  promise: Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  started: boolean;
  settled: boolean;
}

const fresh = () => ({
  jobs: new Map<string, Job>(),
  queues: { now: [], ahead: [], later: [] } as Record<Priority, Job[]>,
  running: 0,
  runningNow: 0,
});
let state = fresh();
type State = typeof state;

const abortError = () => new DOMException('Aborted', 'AbortError');

/** Start queued jobs while there is room, the most urgent first. */
function pump(s: State) {
  while (s.running < AT_ONCE) {
    const job = s.queues.now.shift() ?? s.queues.ahead.shift() ?? (s.runningNow ? undefined : s.queues.later.shift());
    if (!job) return;
    start(s, job);
  }
}

function start(s: State, job: Job) {
  job.started = true;
  s.running++;
  if (job.priority === 'now') s.runningNow++;
  void (async () => job.run(job.controller.signal))().then(job.resolve, job.reject).finally(() => {
    job.settled = true;
    s.running--;
    if (job.priority === 'now') s.runningNow--;
    if (s.jobs.get(job.key) === job) s.jobs.delete(job.key);
    pump(s);
  });
}

/** Every requester has gone: stop the draw, and let the next request for the key start its own. */
function cancel(s: State, job: Job) {
  if (s.jobs.get(job.key) === job) s.jobs.delete(job.key);
  if (job.started) job.controller.abort();
  else {
    const q = s.queues[job.priority];
    q.splice(q.indexOf(job), 1);
    job.settled = true;
    job.reject(abortError());
  }
}

/**
 * Draw `key` with `run`, when there is a turn: the result of a draw already queued or running for
 * the key if there is one. Rejects with an AbortError once `signal` aborts, whether or not the
 * draw is cancelled; `run` gets a signal that aborts when every requester has.
 */
export function schedule<T>(key: string, priority: Priority, signal: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const s = state;
  if (signal?.aborted) return Promise.reject(abortError());
  let job = s.jobs.get(key);
  if (job) {
    job.requesters++;
    if (!job.started && ORDER.indexOf(priority) < ORDER.indexOf(job.priority)) {
      const q = s.queues[job.priority];
      q.splice(q.indexOf(job), 1);
      job.priority = priority;
      s.queues[priority].push(job);
      pump(s);
    }
  } else {
    let resolve!: Job['resolve'], reject!: Job['reject'];
    const promise = new Promise<unknown>((a, b) => { resolve = a; reject = b; });
    promise.catch(() => {}); // each requester handles it
    job = { key, priority, controller: new AbortController(), requesters: 1, run, promise, resolve, reject, started: false, settled: false };
    s.jobs.set(key, job);
    s.queues[priority].push(job);
    pump(s);
  }
  const mine = job;
  return new Promise<T>((resolve, reject) => {
    let left = false;
    const onAbort = () => {
      if (left) return;
      left = true;
      reject(abortError());
      if (--mine.requesters === 0 && !mine.settled) cancel(s, mine);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    mine.promise.then(
      (v) => { if (!left) { left = true; signal?.removeEventListener('abort', onAbort); resolve(v as T); } },
      (e) => { if (!left) { left = true; signal?.removeEventListener('abort', onAbort); reject(e); } },
    );
  });
}

/** For tests: cancel everything queued and running, and start afresh. */
export function resetScheduler() {
  const old = state;
  state = fresh();
  for (const job of old.jobs.values()) {
    if (job.started) job.controller.abort();
    job.settled = true;
    job.reject(abortError());
  }
}
