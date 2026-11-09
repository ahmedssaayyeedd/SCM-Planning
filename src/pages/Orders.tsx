import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import OrderDrawer, { ORDER_STATUSES, PRIORITIES } from "../components/OrderDrawer";
import { Badge, Field, HealthBadge, Modal, PageHeader, num } from "../components/ui";
import * as D from "../lib/dates";
import { earliestFeasibleDelivery, orderMetrics } from "../lib/scheduling";
import { useStore } from "../lib/store";
import { MfgOrder } from "../lib/types";

export default function Orders() {
  const { t, ctx, phasesByOrder, upsert, remove, autoSchedule } = useStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const rows = useMemo(() => {
    return t.manufacturing_orders
      .filter((o) => status === "all" || o.status === status)
      .filter((o) => (o.id + (ctx.products.get(o.product_id)?.trade_name ?? "")).toLowerCase().includes(q.toLowerCase()))
      .map((o) => ({ o, m: orderMetrics(o, phasesByOrder.get(o.id) ?? [], ctx) }))
      .sort((a, b) => (a.o.agreed_delivery ?? "").localeCompare(b.o.agreed_delivery ?? ""));
  }, [t, ctx, phasesByOrder, q, status]);

  return (
    <div className="page">
      <PageHeader title="Manufacturing orders" sub="Orders placed on contract manufacturers. Creating an order schedules it automatically on the Gantt.">
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> New order</button>
      </PageHeader>
      <div className="toolbar">
        <input className="search" placeholder="Search order or product…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="card"><div className="table-wrap">
        <table>
          <thead><tr>
            <th>Order</th><th>Product</th><th>Factory</th><th className="r">Qty</th><th>Priority</th><th>Status</th>
            <th>Agreed</th><th>Projected</th><th className="r">Float (wd)</th><th>Earliest feasible</th><th>Plan</th><th />
          </tr></thead>
          <tbody>
            {rows.map(({ o, m }) => {
              const earliest = o.status !== "Completed" ? earliestFeasibleDelivery(o, ctx, D.today()) : null;
              const infeasible = earliest && o.agreed_delivery && earliest > o.agreed_delivery;
              return (
                <tr key={o.id} onClick={() => setSelected(o.id)} className="clickable">
                  <td><b>{o.id}</b>{o.notes?.startsWith("demo") && <Badge tone="gray">demo</Badge>}</td>
                  <td>{ctx.products.get(o.product_id)?.trade_name}</td>
                  <td>{o.factory_id ? ctx.factories.get(o.factory_id)?.short_name : "—"}</td>
                  <td className="r">{num(o.qty_ordered)}</td>
                  <td>{o.priority ?? "Normal"}</td>
                  <td>{o.status}</td>
                  <td>{D.shortDate(o.agreed_delivery)}</td>
                  <td>{m ? D.shortDate(m.finish) : "—"}</td>
                  <td className="r">{m ? m.slack : "—"}</td>
                  <td>{earliest ? <span className={infeasible ? "txt-red" : ""}>{D.shortDate(earliest)}</span> : "—"}</td>
                  <td>{m ? <HealthBadge h={m.health} /> : <Badge tone="gray">unscheduled</Badge>}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="icon-btn" title="Delete order" onClick={() => confirm(`Delete ${o.id}?`) && remove("manufacturing_orders", [o.id])}><Trash2 size={15} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No orders.</div>}
      </div></div>
      <p className="muted small">“Earliest feasible” is a forward pass from today using the standard phase durations (Master data → Planning parameters). Red = the agreed date cannot be met even if everything starts now.</p>

      {selected && <div className="drawer-fixed"><OrderDrawer orderId={selected} onClose={() => setSelected(null)} /></div>}
      {creating && <NewOrder onClose={() => setCreating(false)} onCreate={async (o) => { await upsert("manufacturing_orders", [o]); await autoSchedule({ orderIds: [o.id] }); setCreating(false); setSelected(o.id); }} />}
    </div>
  );
}

function NewOrder({ onClose, onCreate }: { onClose: () => void; onCreate: (o: MfgOrder) => void }) {
  const { t, ctx } = useStore();
  const products = t.products.filter((p) => p.status !== "In development" && p.factory_id);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [qtyOrdered, setQty] = useState(100000);
  const [due, setDue] = useState(D.addDays(D.today(), 120));
  const [priority, setPriority] = useState("Normal");
  const prod = ctx.products.get(productId);
  const year = new Date().getFullYear();
  const n = t.manufacturing_orders.filter((o) => o.id.startsWith(`MO-${year}-`)).map((o) => Number(o.id.split("-")[2])).reduce((a, b) => Math.max(a, b), 0) + 1;
  const id = `MO-${year}-${String(n).padStart(3, "0")}`;

  return (
    <Modal title="New manufacturing order" onClose={onClose}>
      <div className="grid2">
        <Field label="Product">
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.trade_name} — {p.dosage_form}</option>)}
          </select>
        </Field>
        <Field label="Factory"><input disabled value={prod?.factory_id ? ctx.factories.get(prod.factory_id)?.name ?? "" : ""} /></Field>
        <Field label="Quantity (units)"><input type="number" min={1} value={qtyOrdered} onChange={(e) => setQty(Number(e.target.value))} /></Field>
        <Field label="Priority"><select value={priority} onChange={(e) => setPriority(e.target.value)}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Required delivery date"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Order ID"><input disabled value={id} /></Field>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!prod || !due || qtyOrdered <= 0} onClick={() => onCreate({
          id, product_id: productId, factory_id: prod!.factory_id, batch_ref: `B-${String(n).padStart(3, "0")}`,
          order_date: D.today(), qty_ordered: qtyOrdered, qty_received: 0, unit_price: prod!.std_cost ? Math.round(prod!.std_cost * 1.3 * 10000) / 10000 : null,
          agreed_delivery: due, actual_delivery: null, planned_start: null, priority, status: "Not started", notes: null,
        })}>Create &amp; schedule</button>
      </div>
    </Modal>
  );
}
