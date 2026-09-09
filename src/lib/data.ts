import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { buildReport, type Report } from '@/lib/engine';
import type {
  CostCode, Department, GasItem, Ledger, Movement, Person,
  Posting, Profile, Purchase, Settings, Supplier,
} from '@/lib/types';

/**
 * Loads the whole ledger and runs the model.
 *
 * The registers are small by design — the workbook is built for six
 * departments, 36 items and five years — so one read of everything is both
 * simpler and faster than pushing the FIFO walk into SQL, and it keeps the
 * calculation in one testable place.
 *
 * `cache` dedupes this across a single render pass.
 */
export const getReport = cache(async (): Promise<Report> => {
  const ledger = await getLedger();
  return buildReport(ledger);
});

export const getLedger = cache(async (): Promise<Ledger> => {
  const supabase = await createClient();

  const [settings, departments, items, costCodes, personnel, suppliers, purchases, movements] =
    await Promise.all([
      supabase.from('settings').select('*').single(),
      supabase.from('departments').select('*').order('sort_order').order('code'),
      supabase.from('gas_items').select('*').order('sort_order').order('item_code'),
      supabase.from('cost_codes').select('*').order('code'),
      supabase.from('personnel').select('*').order('name'),
      supabase.from('suppliers').select('*').order('vendor_no'),
      supabase.from('purchases').select('*').order('po_date').order('transaction_id'),
      supabase.from('movements').select('*').order('moved_on').order('transaction_id'),
    ]);

  if (settings.error) {
    throw new Error(`Settings are not configured: ${settings.error.message}`);
  }

  return {
    settings: settings.data as Settings,
    departments: (departments.data ?? []) as Department[],
    items: (items.data ?? []) as GasItem[],
    costCodes: (costCodes.data ?? []) as CostCode[],
    personnel: (personnel.data ?? []) as Person[],
    suppliers: (suppliers.data ?? []) as Supplier[],
    purchases: (purchases.data ?? []) as Purchase[],
    movements: (movements.data ?? []) as Movement[],
  };
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data } = await supabase.from('profiles').select('*').eq('id', auth.user.id).single();
  return (data as Profile) ?? null;
});

export const getPostings = cache(async (): Promise<Posting[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from('postings').select('*').order('report_month', { ascending: false });
  return (data ?? []) as Posting[];
});

export function canRecord(profile: Profile | null): boolean {
  return profile?.role === 'admin' || profile?.role === 'custodian';
}

export function isAdmin(profile: Profile | null): boolean {
  return profile?.role === 'admin';
}
