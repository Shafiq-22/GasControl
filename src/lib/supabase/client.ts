'use client';

import { requireSupabaseConfig } from './config';

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const { url, key } = requireSupabaseConfig();
  return createBrowserClient(
    url,
    key,
  );
}
