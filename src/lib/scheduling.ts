/**
 * Planning engine. Classic production-planning techniques, all pure functions (no I/O):
 *  1. Backward scheduling (due-date driven, just-in-time) with lead-time offsetting and a safety buffer.
 *  2. Net-requirements MRP: BOM explosion → gross − stock = net, lead-time offset to an "order by" date.
 *  3. Finite-capacity loading per factory (priority-dispatch rule: priority, then earliest due date).
 *  4. Float / slack per order (CPM-style) and an earliest-feasible-delivery forward pass.
 */
import {
  BomLine, DEFAULT_SETTINGS, Factory, Item, MfgOrder, OrderMaterial, OrderPhase, PHASES, PhaseKind,
  PlanSettings, Product, Supplier, SupplierQuote, Tables,
} from "./types";
import * as D from "./dates";

export interface Ctx {
  products: Map<string, Product>;
  items: Map<string, Item>;
  suppliers: Map<string, Supplier>;
  factories: Map<string, Factory>;
  bomByProduct: Map<string, BomLine[]>;
  quotesByItem: Map<string, SupplierQuote[]>;
  materials: OrderMaterial[];
  settings: PlanSettings;
}

export function buildCtx(t: Tables): Ctx {
  const bomByProduct = new Map<string, BomLine[]>();
  for (const b of t.bom_lines) {
    const a = bomByProduct.get(b.product_id) ?? [];
    a.push(b);
    bomByProduct.set(b.product_id, a);
  }
  const quotesByItem = new Map<string, SupplierQuote[]>();
  for (const q of t.supplier_quotes) {
    if (!q.item_id || (q.status && q.status !== "Active")) continue;
    const a = quotesByItem.get(q.item_id) ?? [];
    a.push(q);
    quotesByItem.set(q.item_id, a);
  }
  return {
    products: new Map(t.products.map((x) => [x.id, x])),
    items: new Map(t.items.map((x) => [x.id, x])),
    suppliers: new Map(t.suppliers.map((x) => [x.id, x])),
    factories: new Map(t.factories.map((x) => [x.id, x])),
    bomByProduct, quotesByItem,
    materials: t.order_materials,
    settings: t.plan_settings[0] ?? DEFAULT_SETTINGS,
  };
}

export const isOpen = (o: MfgOrder) => (o.status ?? "").toLowerCase() !== "completed" && (o.status ?? "").toLowerCase() !== "cancelled";
export const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const prio = (o: MfgOrder) => PRIORITY_RANK[(o.priority ?? "normal").toLowerCase()] ?? 2;
const inProgress = (o: MfgOrder) => ["in production", "late", "partial"].includes((o.status ?? "").toLowerCase());

/* ---------- lead times & prices ---------- */
export function bestQuote(item: Item, ctx: Ctx): SupplierQuote | undefined {
  const qs = ctx.quotesByItem.get(item.id) ?? [];
  return qs.filter((q) => q.price != null).sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0];
}
/** calendar-day lead time: cheapest active quote → supplier master → null (unknown) */
export function itemLeadDays(item: Item, ctx: Ctx): number | null {
  const q = bestQuote(item, ctx);
  if (q?.lead_time_days) return q.lead_time_days;
  const sid = q?.supplier_id ?? item.supplier_id;
  const s = sid ? ctx.suppliers.get(sid) : undefined;
  return s?.lead_time_days ?? null;
}
export const itemPrice = (item: Item, ctx: Ctx) => bestQuote(item, ctx)?.price ?? item.price_per_kg ?? 0;

/* ---------- durations ---------- */
export type Durations = Record<PhaseKind, number>;

export function orderDurations(o: MfgOrder, ctx: Ctx): Durations {
  const s = ctx.settings;
  let proc = s.procurement_days;
  for (const b of ctx.bomByProduct.get(o.product_id) ?? []) {
    const it = ctx.items.get(b.item_id);
    const lead = it ? itemLeadDays(it, ctx) : null;
    if (lead) proc = Math.max(proc, Math.ceil((lead * 5) / 7));
  }
  const batch = ctx.products.get(o.product_id)?.min_batch ?? 0;
  const batches = batch > 0 ? Math.max(1, Math.ceil(o.qty_ordered / batch)) : 1;
  return {
    procurement: proc,
    manufacturing: s.manufacturing_days * batches,
    qc: s.qc_days,
    release: s.release_days,
    delivery: s.delivery_days,
  };
}

type Span = { s: string; e: string };

/** lay the 5 phases back from `end`, finish-to-start, with `buffer` workdays of float before delivery */
function chainBackward(end: string, dur: Durations, buffer: number, wd: number): Record<PhaseKind, Span> {
  const out = {} as Record<PhaseKind, Span>;
  let e = D.snapWork(end, -1, wd);
  for (const k of [...PHASES].reverse()) {
    const s = D.addWork(e, -(dur[k] - 1), wd);
    out[k] = { s, e };
    e = D.addWork(s, k === "delivery" ? -(1 + buffer) : -1, wd);
  }
  return out;
}
/** forward pass from `start` (used for "earliest feasible delivery") */
function chainForward(start: string, dur: Durations, wd: number): Record<PhaseKind, Span> {
  const out = {} as Record<PhaseKind, Span>;
  let s = D.snapWork(start, 1, wd);
  for (const k of PHASES) {
    const e = D.addWork(s, dur[k] - 1, wd);
    out[k] = { s, e };
    s = D.addWork(e, 1, wd);
  }
  return out;
}

export function earliestFeasibleDelivery(o: MfgOrder, ctx: Ctx, from: string): string {
  const wd = ctx.settings.working_days_per_week;
  const start = D.maxDate(from, o.order_date ?? from);
  return chainForward(start, orderDurations(o, ctx), wd).delivery.e;
}

function initialProgress(o: MfgOrder, k: PhaseKind): number {
  const st = (o.status ?? "").toLowerCase();
  if (st === "completed") return 100;
  const pct = o.qty_ordered > 0 ? Math.min(100, Math.round(((o.qty_received ?? 0) / o.qty_ordered) * 100)) : 0;
  if (inProgress(o)) {
    if (k === "procurement") return 100;
    if (k === "manufacturing") return pct > 0 ? pct : 40;
    return 0;
  }
  if (st === "materials pending" && k === "procurement") return 50;
  return 0;
}

/** Backward-schedule one order. Keeps progress/ids of existing phases. */
export function backwardSchedule(o: MfgOrder, ctx: Ctx, existing: OrderPhase[] = []): OrderPhase[] {
  if (!o.agreed_delivery) return [];
  const s = ctx.settings;
  const wd = s.working_days_per_week;
  const end = D.snapWork(o.agreed_delivery, -1, wd);
  let dur = orderDurations(o, ctx);
  let buffer = s.safety_buffer_days;
  let ch = chainBackward(end, dur, buffer, wd);

  const anchor = o.order_date && o.order_date < end ? o.order_date : null;
  if (anchor && ch.procurement.s < anchor) {
    // not enough calendar time → compress every phase proportionally (never below 1 workday)
    const win = D.workBetween(anchor, end, wd);
    const need = PHASES.reduce((a, k) => a + dur[k], 0) + buffer;
    const f = Math.min(1, win / need);
    dur = Object.fromEntries(PHASES.map((k) => [k, Math.max(1, Math.round(dur[k] * f))])) as Durations;
    buffer = Math.round(buffer * f);
    ch = chainBackward(end, dur, buffer, wd);
  }
  return PHASES.map((k) => {
    const old = existing.find((p) => p.phase === k);
    return {
      id: `${o.id}-${k}`, order_id: o.id, phase: k, start_date: ch[k].s, end_date: ch[k].e,
      progress: old?.progress ?? initialProgress(o, k), locked: false,
    };
  });
}

/* ---------- finite capacity leveling ---------- */
export function levelFiniteCapacity(orders: MfgOrder[], phases: OrderPhase[], ctx: Ctx): OrderPhase[] {
  const wd = ctx.settings.working_days_per_week;
  const cap = Math.max(1, ctx.settings.line_capacity_orders);
  const byOrder = new Map<string, OrderPhase[]>();
  for (const p of phases) byOrder.set(p.order_id, [...(byOrder.get(p.order_id) ?? []), { ...p }]);
  const get = (id: string, k: PhaseKind) => byOrder.get(id)?.find((p) => p.phase === k);

  const factoryIds = [...new Set(orders.filter(isOpen).map((o) => o.factory_id).filter(Boolean))] as string[];
  for (const fid of factoryIds) {
    const todo = orders.filter((o) => isOpen(o) && o.factory_id === fid && get(o.id, "manufacturing"));
    const lanes: string[] = Array(cap).fill("0000-01-01");
    const remaining = [...todo].sort((a, b) => get(a.id, "manufacturing")!.start_date.localeCompare(get(b.id, "manufacturing")!.start_date));
    while (remaining.length) {
      let li = 0;
      lanes.forEach((x, i) => { if (x < lanes[li]) li = i; });
      let t = lanes[li];
      let ready = remaining.filter((o) => get(o.id, "manufacturing")!.start_date <= t);
      if (!ready.length) {
        t = remaining.reduce((m, o) => D.minDate(m, get(o.id, "manufacturing")!.start_date), "9999-12-31");
        ready = remaining.filter((o) => get(o.id, "manufacturing")!.start_date <= t);
      }
      ready.sort((a, b) => {
        const pa = inProgress(a) ? -1 : prio(a), pb = inProgress(b) ? -1 : prio(b);
        return pa - pb || (a.agreed_delivery ?? "").localeCompare(b.agreed_delivery ?? "");
      });
      const pick = ready[0];
      remaining.splice(remaining.indexOf(pick), 1);
      const m = get(pick.id, "manufacturing")!;
      const len = D.workBetween(m.start_date, m.end_date, wd);
      const start = inProgress(pick) ? m.start_date : D.maxDate(m.start_date, lanes[li]);
      if (start > m.start_date) {
        m.start_date = start;
        m.end_date = D.addWork(start, len - 1, wd);
      }
      lanes[li] = D.addWork(m.end_date, 1, wd);
      // push successors only when the logic requires it (finish-to-start)
      let prevEnd = m.end_date;
      for (const k of ["qc", "release", "delivery"] as PhaseKind[]) {
        const p = get(pick.id, k);
        if (!p) continue;
        const need = D.addWork(prevEnd, 1, wd);
        if (p.start_date < need) {
          const l = D.workBetween(p.start_date, p.end_date, wd);
          p.start_date = need;
          p.end_date = D.addWork(need, l - 1, wd);
        }
        prevEnd = p.end_date;
      }
    }
  }
  return [...byOrder.values()].flat();
}

/** keep finish-to-start logic after one phase was moved by hand: push successors, never pull */
export function cascade(phases: OrderPhase[], orderId: string, wd: number): OrderPhase[] {
  const mine = PHASES.map((k) => phases.find((p) => p.order_id === orderId && p.phase === k)).filter(Boolean).map((p) => ({ ...p! }));
  for (let i = 1; i < mine.length; i++) {
    const need = D.addWork(mine[i - 1].end_date, 1, wd);
    if (mine[i].start_date < need) {
      const l = D.workBetween(mine[i].start_date, mine[i].end_date, wd);
      mine[i].start_date = need;
      mine[i].end_date = D.addWork(need, Math.max(l, 1) - 1, wd);
    }
  }
  return mine;
}

/* ---------- float / health ---------- */
export type Health = "done" | "late" | "tight" | "ok";
export interface OrderMetrics {
  start: string; finish: string; agreed: string | null; slack: number; lateDays: number; health: Health; progress: number;
}
export function orderMetrics(o: MfgOrder, ph: OrderPhase[], ctx: Ctx): OrderMetrics | null {
  if (!ph.length) return null;
  const wd = ctx.settings.working_days_per_week;
  const sorted = PHASES.map((k) => ph.find((p) => p.phase === k)).filter(Boolean) as OrderPhase[];
  const start = sorted[0].start_date;
  const del = sorted[sorted.length - 1];
  const rel = sorted.find((p) => p.phase === "release") ?? del;
  const agreed = o.agreed_delivery;
  const dlen = D.workBetween(del.start_date, del.end_date, wd);
  let slack = 0, lateDays = 0;
  if (agreed) {
    const ref = rel.end_date <= agreed ? D.workBetween(rel.end_date, agreed, wd) - 1 : -(D.workBetween(agreed, rel.end_date, wd) - 1);
    slack = ref - dlen;
    lateDays = del.end_date > agreed ? D.workBetween(agreed, del.end_date, wd) - 1 : 0;
  }
  const total = sorted.reduce((a, p) => a + D.workBetween(p.start_date, p.end_date, wd), 0);
  const done = sorted.reduce((a, p) => a + (D.workBetween(p.start_date, p.end_date, wd) * p.progress) / 100, 0);
  let health: Health = "ok";
  if (!isOpen(o)) health = "done";
  else if (slack < 0 || lateDays > 0) health = "late";
  else if (slack < ctx.settings.safety_buffer_days) health = "tight";
  return { start, finish: del.end_date, agreed, slack, lateDays, health, progress: total ? Math.round((done / total) * 100) : 0 };
}

/* ---------- MRP ---------- */
export interface MrpRow {
  orderId: string; productName: string; itemId: string; itemName: string; itemType: string; uom: string;
  gross: number; fromStock: number; net: number; leadDays: number; leadKnown: boolean; needBy: string; orderBy: string;
  supplier: string; unitPrice: number; cost: number; state: "covered" | "order" | "overdue";
}

export function runMrp(orders: MfgOrder[], phases: OrderPhase[], ctx: Ctx, todayStr: string): MrpRow[] {
  const pool = new Map<string, number>();
  for (const it of ctx.items.values()) pool.set(it.id, it.stock_kg ?? 0);
  const rows: MrpRow[] = [];
  const open = orders.filter(isOpen).sort((a, b) => (a.agreed_delivery ?? "9999").localeCompare(b.agreed_delivery ?? "9999"));
  for (const o of open) {
    const prod = ctx.products.get(o.product_id);
    const mfg = phases.find((p) => p.order_id === o.id && p.phase === "manufacturing");
    const needBy = mfg?.start_date ?? (o.agreed_delivery ? D.addDays(o.agreed_delivery, -45) : todayStr);
    const remaining = Math.max(0, o.qty_ordered - (o.qty_received ?? 0));
    for (const b of ctx.bomByProduct.get(o.product_id) ?? []) {
      const it = ctx.items.get(b.item_id);
      if (!it) continue;
      const gross = remaining * b.qty_per_unit;
      const reported = ctx.materials.find((m) => m.order_id === o.id && m.item_id === it.id);
      // production already running → materials were issued, only lines with a reported shortage matter
      if (inProgress(o) && !reported) continue;
      let fromStock: number;
      if (reported && reported.qty_available != null) fromStock = Math.min(gross, reported.qty_available);
      else {
        fromStock = Math.min(gross, pool.get(it.id) ?? 0);
        pool.set(it.id, (pool.get(it.id) ?? 0) - fromStock);
      }
      const net = Math.max(0, gross - fromStock);
      const known = itemLeadDays(it, ctx);
      const leadDays = known ?? Math.ceil((ctx.settings.procurement_days * 7) / 5);
      const orderBy = D.addDays(needBy, -leadDays);
      const q = bestQuote(it, ctx);
      const sup = ctx.suppliers.get(q?.supplier_id ?? it.supplier_id ?? "");
      const unitPrice = itemPrice(it, ctx);
      rows.push({
        orderId: o.id, productName: prod?.trade_name ?? o.product_id, itemId: it.id, itemName: it.name,
        itemType: it.item_type ?? "", uom: b.uom === "pcs" || it.item_type === "Packaging" ? "pcs" : "kg",
        gross, fromStock, net, leadDays, leadKnown: known != null, needBy, orderBy,
        supplier: sup?.name ?? "— no supplier —", unitPrice, cost: net * unitPrice,
        state: net <= 1e-9 ? "covered" : orderBy < todayStr ? "overdue" : "order",
      });
    }
  }
  return rows;
}

/* ---------- capacity ---------- */
export interface LoadCell { weekStart: string; booked: number; available: number; util: number }
export function weeklyLoad(
  factoryId: string, orders: MfgOrder[], phases: OrderPhase[], ctx: Ctx, from: string, weeks: number,
): LoadCell[] {
  const wd = ctx.settings.working_days_per_week;
  const cap = Math.max(1, ctx.settings.line_capacity_orders);
  const mine = phases.filter((p) => p.phase === "manufacturing" && orders.find((o) => o.id === p.order_id)?.factory_id === factoryId);
  const out: LoadCell[] = [];
  let ws = D.startOfWeek(from);
  for (let i = 0; i < weeks; i++) {
    const we = D.addDays(ws, 6);
    let booked = 0;
    for (const p of mine) {
      const s = D.maxDate(p.start_date, ws), e = D.minDate(p.end_date, we);
      if (s <= e) booked += D.workBetween(s, e, wd);
    }
    const available = cap * D.workBetween(ws, we, wd);
    out.push({ weekStart: ws, booked, available, util: available ? booked / available : 0 });
    ws = D.addDays(ws, 7);
  }
  return out;
}

export const riskScore = (r: { impact: number | null; probability: number | null }) => (r.impact ?? 0) * (r.probability ?? 0);
