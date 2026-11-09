import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, PageHeader } from "../components/ui";
import * as D from "../lib/dates";
import { weeklyLoad } from "../lib/scheduling";
import { useStore } from "../lib/store";

const WEEKS = 16;
const tone = (u: number) => (u === 0 ? "c0" : u > 1 ? "c-over" : u > 0.8 ? "c-hi" : u > 0.4 ? "c-mid" : "c-lo");

export default function Capacity() {
  const { t, ctx, levelCapacity } = useStore();
  const td = D.today();
  const data = useMemo(() => t.factories.map((f) => ({ f, cells: weeklyLoad(f.id, t.manufacturing_orders, t.order_phases, ctx, td, WEEKS) })), [t, ctx, td]);
  const overloaded = data.flatMap(({ f, cells }) => cells.filter((c) => c.util > 1).map((c) => ({ f, c })));

  return (
    <div className="page">
      <PageHeader title="Factory capacity" sub={`Booked manufacturing workdays vs. available (${ctx.settings.line_capacity_orders} parallel order(s) per factory). Weeks start Sunday.`}>
        <button className="btn btn-primary" onClick={levelCapacity}>Level capacity (finite loading)</button>
      </PageHeader>

      <Card pad={false}><div className="table-wrap">
        <table className="heat">
          <thead><tr><th>Factory</th>{data[0]?.cells.map((c) => <th key={c.weekStart} className="r">{D.shortDate(c.weekStart).slice(0, 6)}</th>)}</tr></thead>
          <tbody>
            {data.map(({ f, cells }) => (
              <tr key={f.id}>
                <td><b>{f.short_name}</b><div className="muted small">{f.production_lines ?? "—"}</div></td>
                {cells.map((c) => <td key={c.weekStart} className={`cell ${tone(c.util)}`} title={`${c.booked} of ${c.available} workdays`}>{c.util ? Math.round(c.util * 100) + "%" : ""}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div></Card>

      <div className="legend legend-row">
        <span><i className="c-lo" />&lt; 40%</span><span><i className="c-mid" />40–80%</span><span><i className="c-hi" />80–100%</span><span><i className="c-over" />overloaded &gt; 100%</span>
      </div>

      <Card title={`Overloaded factory-weeks (${overloaded.length})`}>
        {overloaded.length === 0 ? <div className="muted">No overloads. Capacity is feasible with the current plan.</div> : (
          <>
            <p className="muted">More than one order is being manufactured at the same time on a factory with limited lines. Use <b>Level capacity</b> to sequence them by priority and due date (the plan may then push deliveries — check the <Link to="/orders" className="link">orders</Link> list), or raise “Orders a factory can run in parallel” in Master data → Planning parameters if the CMO has more lines.</p>
            <div className="chips">{overloaded.map(({ f, c }) => <span key={f.id + c.weekStart} className="chip">{f.short_name} · wk {D.shortDate(c.weekStart).slice(0, 6)} · {Math.round(c.util * 100)}%</span>)}</div>
          </>
        )}
      </Card>
    </div>
  );
}
