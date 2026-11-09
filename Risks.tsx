import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge, Card, Field, Modal, PageHeader } from "../components/ui";
import * as D from "../lib/dates";
import { riskScore } from "../lib/scheduling";
import { useStore } from "../lib/store";
import { Risk } from "../lib/types";

const CATS = ["Supply", "Delivery", "Quality", "Regulatory", "Financial", "Capacity"];

export default function RisksPage() {
  const { t, upsert, ctx } = useStore();
  const [adding, setAdding] = useState(false);
  const td = D.today();
  const risks = [...t.risks].sort((a, b) => riskScore(b) - riskScore(a));
  const cell = (i: number, p: number) => t.risks.filter((r) => r.status !== "Closed" && r.impact === i && r.probability === p).length;
  const col = (s: number) => (s >= 15 ? "c-over" : s >= 8 ? "c-hi" : s >= 4 ? "c-mid" : "c-lo");

  return (
    <div className="page">
      <PageHeader title="Risks & compliance" sub="Risk register (impact × probability) and regulatory expiry watch-list.">
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={15} /> Add risk</button>
      </PageHeader>
      <div className="grid-2">
        <Card title="Risk matrix (open)">
          <div className="matrix">
            {[5, 4, 3, 2, 1].map((i) => (
              <div key={i} className="m-row"><span className="m-lab">I{i}</span>
                {[1, 2, 3, 4, 5].map((p) => <div key={p} className={`m-cell ${col(i * p)}`}>{cell(i, p) || ""}</div>)}
              </div>
            ))}
            <div className="m-row"><span className="m-lab" />{[1, 2, 3, 4, 5].map((p) => <span key={p} className="m-lab c">P{p}</span>)}</div>
          </div>
        </Card>
        <Card title="Regulatory expiry watch-list" pad={false}>
          <table className="mini"><thead><tr><th>Subject</th><th>Type</th><th>Expiry</th><th /></tr></thead><tbody>
            {[...t.regulatory].filter((r) => r.expiry_date).sort((a, b) => a.expiry_date!.localeCompare(b.expiry_date!)).map((r) => {
              const days = D.diffDays(td, r.expiry_date!);
              return <tr key={r.id}><td>{(r.subject ?? "").slice(0, 36)}</td><td>{r.requirement_type}</td><td>{D.shortDate(r.expiry_date)}</td>
                <td><Badge tone={days < 90 ? "red" : days < 365 ? "amber" : "green"}>{days < 0 ? "expired" : `${days} d`}</Badge></td></tr>;
            })}
          </tbody></table>
        </Card>
      </div>
      <Card title="Risk register" pad={false}><div className="table-wrap"><table>
        <thead><tr><th>ID</th><th>Category</th><th>Description</th><th>Order</th><th className="r">Score</th><th>CAPA</th><th>Owner</th><th>Target</th><th>Status</th></tr></thead>
        <tbody>{risks.map((r) => (
          <tr key={r.id}><td><b>{r.id}</b></td><td>{r.category}</td><td>{r.description}</td><td>{r.order_id ?? ctx.factories.get(r.factory_id ?? "")?.short_name ?? "—"}</td>
            <td className="r"><Badge tone={riskScore(r) >= 12 ? "red" : riskScore(r) >= 6 ? "amber" : "green"}>{riskScore(r)}</Badge></td>
            <td>{r.capa}</td><td>{r.owner}</td><td>{D.shortDate(r.target_close)}</td>
            <td><select value={r.status ?? "Open"} onChange={(e) => upsert("risks", [{ ...r, status: e.target.value }])}>{["Open", "In progress", "Closed"].map((s) => <option key={s}>{s}</option>)}</select></td></tr>
        ))}</tbody></table></div></Card>
      {adding && <AddRisk onClose={() => setAdding(false)} onSave={async (r) => { await upsert("risks", [r]); setAdding(false); }} />}
    </div>
  );
}

function AddRisk({ onClose, onSave }: { onClose: () => void; onSave: (r: Risk) => void }) {
  const { t } = useStore();
  const [r, setR] = useState<Risk>({
    id: `RISK-${String(t.risks.length + 1).padStart(3, "0")}`, category: "Supply", factory_id: null, product_id: null, order_id: null,
    description: "", impact: 3, probability: 3, capa: "", owner: "", target_close: null, status: "Open",
  });
  const set = (p: Partial<Risk>) => setR({ ...r, ...p });
  return (
    <Modal title="Add risk" onClose={onClose}>
      <div className="grid2">
        <Field label="Category"><select value={r.category ?? ""} onChange={(e) => set({ category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Linked order"><select value={r.order_id ?? ""} onChange={(e) => set({ order_id: e.target.value || null })}><option value="">—</option>{t.manufacturing_orders.map((o) => <option key={o.id}>{o.id}</option>)}</select></Field>
        <Field label="Impact (1-5)"><input type="number" min={1} max={5} value={r.impact ?? 3} onChange={(e) => set({ impact: Number(e.target.value) })} /></Field>
        <Field label="Probability (1-5)"><input type="number" min={1} max={5} value={r.probability ?? 3} onChange={(e) => set({ probability: Number(e.target.value) })} /></Field>
        <Field label="Owner"><input value={r.owner ?? ""} onChange={(e) => set({ owner: e.target.value })} /></Field>
        <Field label="Target close"><input type="date" value={r.target_close ?? ""} onChange={(e) => set({ target_close: e.target.value || null })} /></Field>
      </div>
      <Field label="Description"><input value={r.description ?? ""} onChange={(e) => set({ description: e.target.value })} /></Field>
      <Field label="Corrective / preventive action"><input value={r.capa ?? ""} onChange={(e) => set({ capa: e.target.value })} /></Field>
      <div className="modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!r.description} onClick={() => onSave(r)}>Save</button></div>
    </Modal>
  );
}
