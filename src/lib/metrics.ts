import { supabase } from '$lib/supabase';

export async function recordMetric(metric_name: string, value: number, metadata?: Record<string, any>) {
    try {
        await supabase.from('metrics').insert({ metric_type: 'app', metric_name, value, metadata, recorded_at: new Date().toISOString() });
    } catch (e) {
        // best-effort, don't throw
        console.warn('recordMetric failed', e);
    }
}

export async function recordError(message: string, context?: Record<string, any>) {
    try {
        // Prefer RPC to bypass RLS using SECURITY DEFINER function
        await supabase.rpc('write_audit_log', { p_action: 'error', p_description: message, p_metadata: context || {} });
    } catch (e) {
        // Fallback: best-effort insert (may be blocked by RLS)
        try {
            await supabase.from('audit_logs').insert({ action: 'error', description: message, metadata: context || {}, created_at: new Date().toISOString() });
        } catch (e2) {
            console.warn('recordError failed', e, e2);
        }
    }
}


