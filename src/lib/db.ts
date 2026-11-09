import { createClient, SupabaseClient } from "@supabase/supabase-js";
import seed from "../data/seed.json";
import { DEFAULT_SETTINGS, TableName, Tables } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** No Supabase env vars → demo mode: data lives in localStorage, seeded from the Excel workbook. */
export const isDemo = !url || !key;
export const supabase: SupabaseClient | null = isDemo ? null : createClient(url as string, key as string);

const LS = "pharmaplan:v2:";
export const ALL_TABLES: TableName[] = [
  "factories", "suppliers", "items", "products", "bom_lines", "supplier_quotes", "manufacturing_orders",
  "order_phases", "order_materials", "batches", "risks", "regulatory", "plan_settings",
];

export async function loadAll(): Promise<Tables> {
  const out: Record<string, unknown[]> = {};
  if (supabase) {
    await Promise.all(
      ALL_TABLES.map(async (t) => {
        const { data, error } = await supabase.from(t).select("*").limit(5000);
        if (error) throw new Error(`${t}: ${error.message}`);
        out[t] = data ?? [];
      }),
    );
  } else {
    const s = seed as unknown as Record<string, unknown[]>;
    for (const t of ALL_TABLES) {
      const raw = localStorage.getItem(LS + t);
      out[t] = raw ? JSON.parse(raw) : s[t] ?? (t === "plan_settings" ? [DEFAULT_SETTINGS] : []);
    }
  }
  return out as unknown as Tables;
}

/** `fullTable` is only used in demo mode, to persist the new state of the table. */
export async function upsertRows<T extends { id: string }>(t: TableName, rows: T[], fullTable: T[]): Promise<void> {
  if (!rows.length) return;
  if (supabase) {
    const { error } = await supabase.from(t).upsert(rows);
    if (error) throw new Error(error.message);
  } else localStorage.setItem(LS + t, JSON.stringify(fullTable));
}

export async function deleteRows<T extends { id: string }>(t: TableName, ids: string[], fullTable: T[]): Promise<void> {
  if (!ids.length) return;
  if (supabase) {
    const { error } = await supabase.from(t).delete().in("id", ids);
    if (error) throw new Error(error.message);
  } else localStorage.setItem(LS + t, JSON.stringify(fullTable));
}

export function resetDemoData() {
  for (const t of ALL_TABLES) localStorage.removeItem(LS + t);
}

/** demo mode only: persist a table after a cascading delete done in memory */
export function saveLocal(t: TableName, rows: unknown[]) {
  if (isDemo) localStorage.setItem(LS + t, JSON.stringify(rows));
}
