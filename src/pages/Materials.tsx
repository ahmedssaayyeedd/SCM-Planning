import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Badge, Card, downloadCsv, egp, Kpi, PageHeader, qty } from "../components/ui";
import * as D from "../lib/dates";
import { runMrp } from "../lib/scheduling";
import { useStore } from "../lib/store";

export default function Materials() {
  const { t, ctx } = useStore();
  const [orderId, setOrderId] = useState("all");
  const [state, setState] = useState<"needed" | "all" | "overdue">("needed");
  const [q, setQ] = useState("");
  const td = D.today();

  const all = useMemo(() => runMrp(t.manufacturing_orders, t.order_phases, ctx, td), [t, ctx, td]);
  const rows = useMemo(() => all
    .filter((r) => orderId === "all" || r.orderId === orderId)
    .filter((r) => (state === "all" ? true : state === "overdue" ? r.state === "overdue" : r.net > 0))
    .filter((r) => r.itemName.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.orderBy.localeCompare(b.orderBy)), [all, orderId, state, q]);

  const spend = rows.reduce((a, r) => a + r.cost, 0);
  const openOrders = [...new Set(all.map((r) => r.orderId))];

  return (
    <div className="page">
      <PageHeader title="Material plan (MRP)" sub="BOM explosion of every open order: gross requirement − stock on hand = net requirement, offset by supplier lead time to an order-by date.">
        <button className="btn" onClick={() => downloadCsv("purchase-plan.csv", [
          ["Order", "Product", "Item", "Type", "Gross", "From stock", "Net", "UoM", "Lead (days)", "Need by", "Order by", "Supplier", "Unit price (EGP)", "Cost (EGP)", "State"],
          ...rows.map((r) => [r.orderId, r.productName, r.itemName, r.itemType, r.gross, r.fromStock, r.net, r.uom, r.leadDays, r.needBy, r.orderBy, r.supplier, r.unitPrice, Math.round(r.cost), r.state]),
        ])}><Download size={15} /> Export CSV</button>
      </PageHeader>

      <div className="kpis">
        <Kpi label="Lines to buy" value={rows.filter((r) => r.net > 0).length} />
        <Kpi label="Order-by date passed" value={rows.filter((r) => r.state === "overdue").length} tone="red" hint="expedite or re-plan" />
        <Kpi label="Estimated spend" value={egp(spend)} tone="blue" hint="best active quote, else std price" />
        <Kpi label="Lead time unknown" value={rows.filter((r) => r.net > 0 && !r.leadKnown).length} tone="amber" hint="default lead time applied" />
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Search item…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
          <option value="all">All open orders</option>
          {openOrders.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select value={state} onChange={(e) => setState(e.target.value as typeof state)}>
          <option value="needed">Needs purchasing</option><option value="overdue">Overdue only</option><option value="all">Everything</option>
        </select>
      </div>

      <Card pad={false}><div className="table-wrap tall">
        <table>
          <thead><tr><th>Order</th><th>Item</th><th>Type</th><th className="r">Gross</th><th className="r">Stock</th><th className="r">Net</th><th>Lead</th><th>Need by</th><th>Order by</th><th>Supplier</th><th className="r">Cost</th><th /></tr></thead>
          <tbody>
            {rows.slice(0, 400).map((r) => (
              <tr key={r.orderId + r.itemId}>
                <td>{r.orderId}</td><td title={r.itemName}>{r.itemName.slice(0, 44)}</td><td>{r.itemType}</td>
                <td className="r">{qty(r.gross)} {r.uom}</td><td className="r">{qty(r.fromStock)}</td><td className="r"><b>{qty(r.net)}</b></td>
                <td>{r.leadDays} d{!r.leadKnown && <span className="muted"> *</span>}</td><td>{D.shortDate(r.needBy)}</td>
                <td className={r.state === "overdue" ? "txt-red" : ""}>{D.shortDate(r.orderBy)}</td>
                <td>{r.supplier.slice(0, 30)}</td><td className="r">{egp(Math.round(r.cost))}</td>
                <td>{r.state === "covered" ? <Badge tone="green">covered</Badge> : r.state === "overdue" ? <Badge tone="red">overdue</Badge> : <Badge tone="blue">to order</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">Nothing to show for this filter.</div>}
      </div></Card>
      <p className="muted small">* No lead time in Supplier Quotes / Suppliers — the standard procurement duration is used. Stock comes from Items Master “In stock (kg)” (blank = 0), allocated to orders in due-date order. Orders already in production only show lines with a reported shortage.</p>
    </div>
  );
}
