import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, egp, HealthBadge, Kpi, PageHeader } from "../components/ui";
import * as D from "../lib/dates";
import { isOpen, orderMetrics, riskScore, runMrp, weeklyLoad } from "../lib/scheduling";
import { useStore } from "../lib/store";

export default function Dashboard() {
  const { t, ctx, phasesByOrder } = useStore();
  const td = D.today();

  const d = useMemo(() => {
    const open = t.manufacturing_orders.filter(isOpen);
    const metrics = open.map((o) => ({ o, m: orderMetrics(o, phasesByOrder.get(o.id) ?? [], ctx) })).filter((x) => x.m);
    const late = metrics.filter((x) => x.m!.health === "late");
    const tight = metrics.filter((x) => x.m!.health === "tight");
    const mrp = runMrp(t.manufacturing_orders, t.order_phases, ctx, td);
    const overdue = mrp.filter((r) => r.state === "overdue");
    const load = t.factories.filter((f) => f.status === "Active").map((f) => {
      const cells = weeklyLoad(f.id, t.manufacturing_orders, t.order_phases, ctx, td, 8);
      const booked = cells.reduce((a, c) => a + c.booked, 0), avail = cells.reduce((a, c) => a + c.available, 0);
      return { f, util: avail ? booked / avail : 0, peak: Math.max(...cells.map((c) => c.util)), booked };
    });
    const regSoon = t.regulatory.filter((r) => r.expiry_date && D.diffDays(td, r.expiry_date) <= 180);
    const risks = t.risks.filter((r) => r.status !== "Closed").sort((a, b) => riskScore(b) - riskScore(a));
    const upcoming = [...open].filter((o) => o.agreed_delivery && o.agreed_delivery >= td).sort((a, b) => a.agreed_delivery!.localeCompare(b.agreed_delivery!)).slice(0, 6);
    const avgUtil = load.filter((l) => l.booked > 0);
    return { open, late, tight, overdue, overdueCost: overdue.reduce((a, r) => a + r.cost, 0), load, regSoon, risks, upcoming,
      avg: avgUtil.length ? avgUtil.reduce((a, l) => a + l.util, 0) / avgUtil.length : 0, attention: [...late, ...tight] };
  }, [t, ctx, phasesByOrder, td]);

  return (
    <div className="page">
      <PageHeader title="Production overview" sub={`Planning snapshot for ${D.shortDate(td)}`}>
        <Link className="btn btn-primary" to="/planner">Open Gantt planner</Link>
      </PageHeader>

      <div className="kpis">
        <Kpi label="Open orders" value={d.open.length} hint={`${t.manufacturing_orders.length} total`} />
        <Kpi label="Late" value={d.late.length} tone={d.late.length ? "red" : "teal"} hint="projected after agreed date" />
        <Kpi label="At risk" value={d.tight.length} tone={d.tight.length ? "amber" : "teal"} hint="safety buffer consumed" />
        <Kpi label="Purchases overdue" value={d.overdue.length} tone={d.overdue.length ? "red" : "teal"} hint={egp(d.overdueCost)} />
        <Kpi label="Avg. factory load" value={`${Math.round(d.avg * 100)}%`} tone={d.avg > 1 ? "red" : "blue"} hint="next 8 weeks, active factories" />
        <Kpi label="Expiring ≤ 180 d" value={d.regSoon.length} tone={d.regSoon.length ? "amber" : "teal"} hint="GMP / registrations" />
      </div>

      <div className="grid-dash">
        <Card title="Orders needing attention" right={<Link to="/orders" className="link">All orders</Link>}>
          {d.attention.length === 0 ? <div className="muted">Nothing at risk. 🎉</div> : (
            <table className="mini"><thead><tr><th>Order</th><th>Product</th><th>Agreed</th><th className="r">Float</th><th /></tr></thead>
              <tbody>{d.attention.map(({ o, m }) => (
                <tr key={o.id}><td><b>{o.id}</b></td><td>{ctx.products.get(o.product_id)?.trade_name}</td><td>{D.shortDate(o.agreed_delivery)}</td><td className="r">{m!.slack} wd</td><td><HealthBadge h={m!.health} /></td></tr>
              ))}</tbody></table>
          )}
        </Card>

        <Card title="Factory load — next 8 weeks" right={<Link to="/capacity" className="link">Details</Link>}>
          <div className="bars">
            {d.load.map(({ f, util, peak }) => (
              <div key={f.id} className="bar-row">
                <span>{f.short_name}</span>
                <div className="bar"><div style={{ width: `${Math.min(100, util * 100)}%` }} className={util > 1 ? "over" : util > 0.8 ? "hi" : ""} /></div>
                <b>{Math.round(util * 100)}%</b>
                {peak > 1 && <Badge tone="red">peak {Math.round(peak * 100)}%</Badge>}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Next deliveries">
          <table className="mini"><tbody>
            {d.upcoming.map((o) => (
              <tr key={o.id}><td><b>{D.shortDate(o.agreed_delivery)}</b></td><td>{o.id}</td><td>{ctx.products.get(o.product_id)?.trade_name}</td><td>{ctx.factories.get(o.factory_id ?? "")?.short_name}</td></tr>
            ))}
          </tbody></table>
        </Card>

        <Card title="Top open risks" right={<Link to="/risks" className="link">Risk register</Link>}>
          <table className="mini"><tbody>
            {d.risks.slice(0, 5).map((r) => (
              <tr key={r.id}><td><Badge tone={riskScore(r) >= 12 ? "red" : riskScore(r) >= 6 ? "amber" : "green"}>{riskScore(r)}</Badge></td><td>{r.category}</td><td>{r.description}</td><td>{r.status}</td></tr>
            ))}
          </tbody></table>
        </Card>
      </div>
    </div>
  );
}
