import { useMemo } from "react";
import { X } from "lucide-react";
import * as D from "../lib/dates";
import { useStore } from "../lib/store";
import { cascade, orderMetrics, runMrp } from "../lib/scheduling";
import { MfgOrder, OrderPhase, PHASES, PHASE_LABEL, PhaseKind } from "../lib/types";
import { Badge, egp, Field, HealthBadge, PHASE_COLOR, qty } from "./ui";

export const ORDER_STATUSES = ["Not started", "Materials pending", "In production", "Partial", "Late", "Completed", "Cancelled"];
export const PRIORITIES = ["Low", "Normal", "High", "Urgent"];

export default function OrderDrawer({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { t, ctx, phasesByOrder, upsert, autoSchedule } = useStore();
  const o = t.manufacturing_orders.find((x) => x.id === orderId);
  const phases = useMemo(
    () => PHASES.map((k) => (phasesByOrder.get(orderId) ?? []).find((p) => p.phase === k)).filter(Boolean) as OrderPhase[],
    [phasesByOrder, orderId],
  );
  const wd = ctx.settings.working_days_per_week;
  const met = o ? orderMetrics(o, phases, ctx) : null;
  const shortages = useMemo(
    () => runMrp(t.manufacturing_orders, t.order_phases, ctx, D.today()).filter((r) => r.orderId === orderId && r.net > 0).sort((a, b) => b.cost - a.cost),
    [t, ctx, orderId],
  );
  if (!o) return null;
  const prod = ctx.products.get(o.product_id);
  const fac = o.factory_id ? ctx.factories.get(o.factory_id) : undefined;

  const setOrder = (patch: Partial<MfgOrder>) => upsert("manufacturing_orders", [{ ...o, ...patch }]);
  const editPhase = (k: PhaseKind, patch: Partial<OrderPhase>) => {
    const next = phases.map((p) => (p.phase === k ? { ...p, ...patch, locked: true } : { ...p }));
    const target = next.find((p) => p.phase === k)!;
    if (target.end_date < target.start_date) target.end_date = target.start_date;
    upsert("order_phases", cascade(next, orderId, wd));
  };

  return (
    <aside className="drawer">
      <header>
        <div>
          <small>{o.id} · {o.batch_ref ?? "no batch"}</small>
          <h3>{prod?.trade_name ?? o.product_id}</h3>
          <div className="muted">{prod?.dosage_form} · {fac?.short_name ?? "No factory"}</div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </header>

      {met && (
        <div className="drawer-metrics">
          <div><small>Health</small><HealthBadge h={met.health} /></div>
          <div><small>Float</small><b>{met.slack} wd</b></div>
          <div><small>Projected finish</small><b>{D.shortDate(met.finish)}</b></div>
          <div><small>Agreed</small><b>{D.shortDate(met.agreed)}</b></div>
        </div>
      )}

      <div className="grid2">
        <Field label="Status">
          <select value={o.status ?? ""} onChange={(e) => setOrder({ status: e.target.value })}>
            {ORDER_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select value={o.priority ?? "Normal"} onChange={(e) => setOrder({ priority: e.target.value })}>
            {PRIORITIES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Qty ordered"><input type="number" value={o.qty_ordered} onChange={(e) => setOrder({ qty_ordered: Number(e.target.value) })} /></Field>
        <Field label="Qty received"><input type="number" value={o.qty_received ?? 0} onChange={(e) => setOrder({ qty_received: Number(e.target.value) })} /></Field>
        <Field label="Agreed delivery"><input type="date" value={o.agreed_delivery ?? ""} onChange={(e) => setOrder({ agreed_delivery: e.target.value || null })} /></Field>
        <Field label="Order value"><input disabled value={egp((o.unit_price ?? 0) * o.qty_ordered)} /></Field>
      </div>

      <h4>Phases</h4>
      <div className="phase-list">
        {phases.map((p) => (
          <div key={p.phase} className="phase-edit">
            <div className="ph-title"><i style={{ background: PHASE_COLOR[p.phase] }} />{PHASE_LABEL[p.phase]}{p.locked && <Badge tone="gray">manual</Badge>}</div>
            <input type="date" value={p.start_date} onChange={(e) => e.target.value && editPhase(p.phase, { start_date: e.target.value })} />
            <input type="date" value={p.end_date} onChange={(e) => e.target.value && editPhase(p.phase, { end_date: e.target.value })} />
            <div className="prog-edit">
              <input type="range" min={0} max={100} step={5} value={p.progress} onChange={(e) => editPhase(p.phase, { progress: Number(e.target.value) })} />
              <span>{p.progress}%</span>
            </div>
          </div>
        ))}
      </div>
      <div className="row-actions">
        <button className="btn" onClick={() => autoSchedule({ force: true, orderIds: [o.id] })}>Re-schedule backward from delivery</button>
      </div>

      <h4>Material shortages <small>({shortages.length})</small></h4>
      {shortages.length === 0 ? <div className="muted">No open net requirements — all BOM lines are covered by stock or already issued.</div> : (
        <table className="mini">
          <thead><tr><th>Item</th><th className="r">Net</th><th>Order by</th></tr></thead>
          <tbody>
            {shortages.slice(0, 8).map((r) => (
              <tr key={r.itemId}>
                <td title={r.itemName}>{r.itemName.slice(0, 34)}</td>
                <td className="r">{qty(r.net)} {r.uom}</td>
                <td><span className={r.state === "overdue" ? "txt-red" : ""}>{D.shortDate(r.orderBy)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </aside>
  );
}
