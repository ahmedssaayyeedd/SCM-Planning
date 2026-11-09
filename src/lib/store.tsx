import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { deleteRows, loadAll, resetDemoData, saveLocal, upsertRows } from "./db";
import { buildCtx, Ctx, backwardSchedule, levelFiniteCapacity } from "./scheduling";
import { MfgOrder, OrderPhase, TableName, Tables } from "./types";

interface Store {
  t: Tables;
  ctx: Ctx;
  phasesByOrder: Map<string, OrderPhase[]>;
  loading: boolean;
  error: string | null;
  upsert: <K extends TableName>(table: K, rows: Tables[K]) => Promise<void>;
  remove: (table: TableName, ids: string[]) => Promise<void>;
  /** (re)build the Gantt phases by backward scheduling. force=false keeps hand-edited (locked) orders. */
  autoSchedule: (opts?: { force?: boolean; orderIds?: string[] }) => Promise<void>;
  levelCapacity: () => Promise<void>;
  resetDemo: () => void;
  reload: () => Promise<void>;
}

const StoreCtx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(StoreCtx);

export function DataProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<Tables | null>(null);
  const [error, setError] = useState<string | null>(null);
  const booted = useRef(false);
  const tRef = useRef<Tables | null>(null);
  tRef.current = t;

  const reload = useCallback(async () => {
    try {
      setError(null);
      setT(await loadAll());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const upsert = useCallback(async <K extends TableName>(table: K, rows: Tables[K]) => {
    const cur = tRef.current!;
    const map = new Map((cur[table] as { id: string }[]).map((r) => [r.id, r]));
    for (const r of rows as { id: string }[]) map.set(r.id, r);
    const full = [...map.values()] as Tables[K];
    const next = { ...cur, [table]: full } as Tables;
    setT(next);
    tRef.current = next;
    await upsertRows(table, rows as { id: string }[], full as { id: string }[]);
  }, []);

  const remove = useCallback(async (table: TableName, ids: string[]) => {
    const cur = tRef.current!;
    const set = new Set(ids);
    const full = (cur[table] as { id: string }[]).filter((r) => !set.has(r.id));
    let next = { ...cur, [table]: full } as Tables;
    if (table === "manufacturing_orders") {
      next = {
        ...next,
        order_phases: next.order_phases.filter((p) => !set.has(p.order_id)),
        order_materials: next.order_materials.filter((m) => !m.order_id || !set.has(m.order_id)),
        batches: next.batches.filter((b) => !b.order_id || !set.has(b.order_id)),
      };
      for (const k of ["order_phases", "order_materials", "batches"] as TableName[]) saveLocal(k, next[k]);
    }
    setT(next);
    tRef.current = next;
    await deleteRows(table, ids, full as { id: string }[]);
  }, []);

  const ctx = useMemo(() => (t ? buildCtx(t) : (null as unknown as Ctx)), [t]);
  const phasesByOrder = useMemo(() => {
    const m = new Map<string, OrderPhase[]>();
    for (const p of t?.order_phases ?? []) m.set(p.order_id, [...(m.get(p.order_id) ?? []), p]);
    return m;
  }, [t]);

  const autoSchedule = useCallback(async (opts: { force?: boolean; orderIds?: string[] } = {}) => {
    const cur = tRef.current!;
    const c = buildCtx(cur);
    const out: OrderPhase[] = [];
    for (const o of cur.manufacturing_orders) {
      if (opts.orderIds && !opts.orderIds.includes(o.id)) continue;
      const existing = cur.order_phases.filter((p) => p.order_id === o.id);
      if (!opts.force && existing.some((p) => p.locked)) continue;
      out.push(...backwardSchedule(o, c, existing));
    }
    await upsert("order_phases", out);
  }, [upsert]);

  const levelCapacity = useCallback(async () => {
    const cur = tRef.current!;
    const c = buildCtx(cur);
    const leveled = levelFiniteCapacity(cur.manufacturing_orders, cur.order_phases, c);
    await upsert("order_phases", leveled);
  }, [upsert]);

  // first load: build the plan from the Excel data so the Gantt is never empty
  useEffect(() => {
    if (!t || booted.current) return;
    booted.current = true;
    const missing = t.manufacturing_orders.filter(
      (o: MfgOrder) => o.agreed_delivery && !t.order_phases.some((p) => p.order_id === o.id),
    );
    if (missing.length) autoSchedule({ orderIds: missing.map((o) => o.id) });
  }, [t, autoSchedule]);

  const resetDemo = () => { resetDemoData(); booted.current = false; reload(); };

  if (!t || !ctx) return <div className="boot">{error ? <div className="err-box"><b>Could not load data</b><br />{error}</div> : "Loading plan…"}</div>;
  return (
    <StoreCtx.Provider value={{ t, ctx, phasesByOrder, loading: false, error, upsert, remove, autoSchedule, levelCapacity, resetDemo, reload }}>
      {children}
    </StoreCtx.Provider>
  );
}
