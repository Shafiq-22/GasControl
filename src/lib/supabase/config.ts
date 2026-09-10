/** Public connection settings only. Never read a service-role key here. */
export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) return null;
  try {
    if (!['https:', 'http:'].includes(new URL(url).protocol)) return null;
  } catch { return null; }
  return { url, key };
}

export function requireSupabaseConfig() {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Supabase connection settings are missing. Configure the deployment environment and redeploy.');
  return config;
}
