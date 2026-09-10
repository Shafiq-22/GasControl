import { readAllRows } from '@/lib/supabase/pagination';
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
      readAllRows('departments', (from, to) => supabase.from('departments').select('*').order('sort_order').order('code').range(from, to)),
      readAllRows('gas_items', (from, to) => supabase.from('gas_items').select('*').order('sort_order').order('item_code').range(from, to)),
      readAllRows('cost_codes', (from, to) => supabase.from('cost_codes').select('*').order('code').range(from, to)),
      readAllRows('personnel', (from, to) => supabase.from('personnel').select('*').order('name').order('employee_no').range(from, to)),
      readAllRows('suppliers', (from, to) => supabase.from('suppliers').select('*').order('vendor_no').range(from, to)),
      readAllRows('purchases', (from, to) => supabase.from('purchases').select('*').order('po_date').order('transaction_id').range(from, to)),
      readAllRows('movements', (from, to) => supabase.from('movements').select('*').order('moved_on').order('transaction_id').range(from, to)),
    ]);

  if (settings.error) {
    throw new Error(`Settings are not configured: ${settings.error.message}`);
  }

  return {
    settings: settings.data as Settings,
    departments: departments as Department[],
    items: items as GasItem[],
    costCodes: costCodes as CostCode[],
    personnel: personnel as Person[],
    suppliers: suppliers as Supplier[],
    purchases: purchases as Purchase[],
    movements: movements as Movement[],
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
  return readAllRows<Posting>('postings', (from, to) => supabase.from('postings').select('*').order('report_month', { ascending: false }).order('id').range(from, to));
});

export function canRecord(profile: Profile | null): boolean {
  return profile?.role === 'admin' || profile?.role === 'custodian';
}

export function isAdmin(profile: Profile | null): boolean {
  return profile?.role === 'admin';
}
