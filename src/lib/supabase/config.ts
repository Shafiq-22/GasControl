/**
 * The store's own Supabase project.
 *
 * Both values are publishable: the URL is an address and the key is designed
 * to ship inside the browser bundle. Neither grants anything on its own —
 * row level security is the boundary, every policy requires a signed-in user
 * with an approved role, and a new signup can read nothing until an
 * administrator promotes it. Keeping them here means a fresh deployment works
 * without a dashboard step; an environment variable still overrides them, so
 * pointing a deployment at a different project needs no code change.
 */
const DEFAULTS = {
  url: 'https://yzhhspaoavafwvtdxahw.supabase.co',
  key: 'sb_publishable_ZzTPs3_hkrhE33MtTRqDEQ_0X_4PfWo',
} as const;

/** Public connection settings only. Never read a service-role key here. */
export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || DEFAULTS.url;
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim() || DEFAULTS.key;
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
