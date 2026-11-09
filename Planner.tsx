import { useMemo, useState } from "react";
import { Gauge, Layers, RefreshCcw } from "lucide-react";
import Gantt, { GanttGroup, Zoom } from "../components/Gantt";
import OrderDrawer from "../components/OrderDrawer";
import { PageHeader, PHASE_COLOR } from "../components/ui";
import * as D from "../lib/dates";
import { isOpen, orderMetrics } from "../lib/scheduling";
import { useStore } from "../lib/store";
import { PHASES, PHASE_LABEL } from "../lib/types";

export default function Planner() {
  const { t, ctx, phasesByOrder, upsert, autoSchedule, levelCapacity } = useStore();
  const [zoom, setZoom] = useState<Zoom>("week");
  const [factory, setFactory] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [riskOnly, setRiskOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const groups: GanttGroup[] = useMemo(() => {
    const td = D.today();
    return t.factories
      .filter((f) => factory === "all" || f.id === factory)
      .map((f) => {
        const orders = t.manufacturing_orders
          .filter((o) => o.factory_id === f.id && (showDone || isOpen(o)))
          .filter((o) => {
            if (!riskOnly) return true;
            const m = orderMetrics(o, phasesByOrder.get(o.id) ?? [], ctx);
            return m?.health === "late" || m?.health === "tight";
          })
          .sort((a, b) => (phasesByOrder.get(a.id)?.[0]?.start_date ?? "").localeCompare(phasesByOrder.get(b.id)?.[0]?.start_date ?? ""));
        const milestones = t.regulatory
          .filter((r) => r.factory_id === f.id && r.expiry_date)
          .map((r) => ({
            date: r.expiry_date as string,
            label: `${r.requirement_type ?? "Regulatory"} expiry`,
            tone: (D.diffDays(td, r.expiry_date as string) < 120 ? "red" : "amber") as "red" | "amber",
          }));
        return { id: f.id, label: f.short_name ?? f.name, sub: `${orders.length} orders`, orders, milestones };
      });
  }, [t, ctx, phasesByOrder, factory, showDone, riskOnly]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allIds = groups.flatMap((g) => g.orders.map((o) => o.id));

  return (
    <div className="page page-fill">
      <PageHeader title="Gantt planner" sub="Drag a bar to re-plan. Expand an order to move or resize individual phases — successors are pushed automatically.">
        <button className="btn" disabled={busy} onClick={() => run(() => autoSchedule())} title="Backward-schedule every order from its agreed delivery date (hand-edited orders are kept)">
          <RefreshCcw size={15} /> Auto-schedule
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={() => run(levelCapacity)} title="Resolve factory overloads by priority, then earliest due date">
          <Gauge size={15} /> Level capacity
        </button>
      </PageHeader>

      <div className="toolbar">
        <div className="seg">
          {(["day", "week", "month"] as Zoom[]).map((z) => <button key={z} className={zoom === z ? "on" : ""} onClick={() => setZoom(z)}>{z[0].toUpperCase() + z.slice(1)}</button>)}
        </div>
        <select value={factory} onChange={(e) => setFactory(e.target.value)}>
          <option value="all">All factories</option>
          {t.factories.map((f) => <option key={f.id} value={f.id}>{f.short_name ?? f.name}</option>)}
        </select>
        <label className="chk"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show completed</label>
        <label className="chk"><input type="checkbox" checked={riskOnly} onChange={(e) => setRiskOnly(e.target.checked)} /> At-risk only</label>
        <button className="btn btn-sm" onClick={() => setExpanded(expanded.size ? new Set() : new Set(allIds))}>
          <Layers size={14} /> {expanded.size ? "Collapse all" : "Expand all"}
        </button>
        <div className="legend">
          {PHASES.map((k) => <span key={k}><i style={{ background: PHASE_COLOR[k] }} />{PHASE_LABEL[k]}</span>)}
          <span><i className="diamond" />Agreed delivery</span>
          <span><i className="diamond amber" />GMP / licence expiry</span>
        </div>
      </div>

      <div className={`gantt-layout ${selected ? "with-drawer" : ""}`}>
        <div className="gantt-card">
          {allIds.length === 0 ? <div className="empty">No orders match the filters.</div> : (
            <Gantt groups={groups} phasesByOrder={phasesByOrder} ctx={ctx} zoom={zoom} expanded={expanded} selected={selected}
              onToggle={toggle} onSelect={setSelected} onCommit={(p) => upsert("order_phases", p)} />
          )}
        </div>
        {selected && <OrderDrawer orderId={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}
