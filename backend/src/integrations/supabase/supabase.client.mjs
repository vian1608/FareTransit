import { supabase } from '../../config/supabase.mjs';
import { recordSupabaseCall } from '../../observability/request-metrics.mjs';

if (!supabase.__tfsEgressInstrumentation) {
  const originalFrom = supabase.from.bind(supabase);
  supabase.from = relation => {
    recordSupabaseCall(relation);
    return originalFrom(relation);
  };

  Object.defineProperty(supabase, '__tfsEgressInstrumentation', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
}

export default supabase;
export { supabase };
