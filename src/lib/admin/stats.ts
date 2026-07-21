import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'

export interface AdminDashboardStats {
  profiles: number | null
  paid_users: number | null
  published_models: number | null
}

export async function fetchAdminDashboardStats(): Promise<AdminDashboardStats> {
  if (!isSupabaseConfigured()) {
    return { profiles: null, paid_users: null, published_models: null }
  }
  const supabase = getSupabase()
  if (!supabase) {
    return { profiles: null, paid_users: null, published_models: null }
  }

  const { data, error } = await supabase.rpc('admin_dashboard_stats')
  if (error) {
    console.warn('admin_dashboard_stats', error.message)
    // Fallback: admin RLS may allow profile counts; gallery models remain readable
    const [profilesRes, paidRes, modelsRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_paid', true),
      supabase.from('gallery_models').select('id', { count: 'exact', head: true }),
    ])
    return {
      profiles: profilesRes.count ?? null,
      paid_users: paidRes.count ?? null,
      published_models: modelsRes.count ?? null,
    }
  }

  const row = data as AdminDashboardStats
  return {
    profiles: row.profiles ?? null,
    paid_users: row.paid_users ?? null,
    published_models: row.published_models ?? null,
  }
}
