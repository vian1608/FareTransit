import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function requestMetricsContext(req, res, next) {
  const store = {
    supabaseCalls: 0,
    supabaseTables: new Map()
  };
  storage.run(store, next);
}

export function recordSupabaseCall(table) {
  const store = storage.getStore();
  if (!store) return;
  store.supabaseCalls += 1;
  const key = String(table || 'unknown');
  store.supabaseTables.set(key, (store.supabaseTables.get(key) || 0) + 1);
}

export function getRequestMetrics() {
  const store = storage.getStore();
  if (!store) return { supabaseCalls: 0, supabaseTables: {} };
  return {
    supabaseCalls: store.supabaseCalls,
    supabaseTables: Object.fromEntries(store.supabaseTables.entries())
  };
}

export default requestMetricsContext;
