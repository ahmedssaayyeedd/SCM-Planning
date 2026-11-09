import { useState } from "react";
import { Card, Field, PageHeader, num } from "../components/ui";
import * as D from "../lib/dates";
import { useStore } from "../lib/store";
import { PlanSettings } from "../lib/types";

type Tab = "settings" | "products" | "bom" | "items" | "suppliers" | "factories";
const TABS: [Tab, string][] = [["settings", "Planning parameters"], ["products", "Products"], ["bom", "BOM"], ["items", "Items"], ["suppliers", "Suppliers"], ["factories", "Factories"]];

export default function MasterData() {
  const [tab, setTab] = useState<Tab>("settings");
  return (
    <div className="page">
      <PageHeader title="Master data" sub="Imported from Pharma_SupplyChain_DB_v10.xlsx. Edit rows in the Supabase table editor, or re-run the seed script." />
      <div className="seg seg-wide">{TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "settings" && <Settings />}
      {tab === "products" && <Products />}
      {tab === "bom" && <Bom />}
      {tab === "items" && <Items />}
      {tab === "suppliers" && <Suppliers />}
      {tab === "factories" && <Factories />}
    </div>
  );
}

function Settings() {
  const { ctx, upsert, autoSchedule } = useStore();
  const [s, setS] = useState<PlanSettings>(ctx.settings);
  const [saved, setSaved] = useState(false);
  const f = (k: keyof PlanSettings, label: string, hint: string) => (
    <Field label={label}>
      <input type="number" min={0} value={s[k] as number} onChange={(e) => { setSaved(false); setS({ ...s, [k]: Number(e.target.value) }); }} />
      <small>{hint}</small>
    </Field>
  );
  return (
    <Card title="Planning parameters" right={saved && <span className="txt-green">Saved</span>}>
      <p className="muted">Standard phase durations in <b>workdays</b>. They drive backward scheduling from each agreed delivery date. Procurement is raised automatically when a BOM item has a longer supplier lead time.</p>
      <div className="grid3">
        {f("procurement_days", "Procurement", "API / excipient / packaging purchasing")}
        {f("manufacturing_days", "Manufacturing", "per batch at the CMO")}
        {f("qc_days", "QC testing", "release analysis turnaround")}
        {f("release_days", "QA release", "batch record review & release")}
        {f("delivery_days", "Delivery", "transport to warehouse")}
        {f("safety_buffer_days", "Safety buffer", "float kept before delivery")}
        {f("working_days_per_week", "Working days / week", "5 = Fri–Sat off, 6 = Fri off")}
        {f("line_capacity_orders", "Parallel orders per factory", "finite-capacity limit")}
      </div>
      <div className="row-actions">
        <button className="btn btn-primary" onClick={async () => { await upsert("plan_settings", [s]); setSaved(true); }}>Save parameters</button>
        <button className="btn" onClick={async () => { await upsert("plan_settings", [s]); await autoSchedule(); setSaved(true); }}>Save &amp; re-schedule all</button>
      </div>
    </Card>
  );
}

function Products() {
  const { t, ctx } = useStore();
  return <Card pad={false}><div className="table-wrap"><table>
    <thead><tr><th>ID</th><th>Product</th><th>Form</th><th>Factory</th><th className="r">Std cost / unit</th><th>Registration</th><th>Reg. expiry</th><th>Status</th></tr></thead>
    <tbody>{t.products.map((p) => <tr key={p.id}><td><b>{p.id}</b></td><td>{p.trade_name}</td><td>{p.dosage_form}</td><td>{ctx.factories.get(p.factory_id ?? "")?.short_name ?? "—"}</td>
      <td className="r">{num(p.std_cost, 4)}</td><td>{p.reg_no}</td><td>{D.shortDate(p.reg_expiry)}</td><td>{p.status}</td></tr>)}</tbody></table></div></Card>;
}

function Bom() {
  const { t, ctx } = useStore();
  const [pid, setPid] = useState(t.products[0]?.id ?? "");
  const lines = ctx.bomByProduct.get(pid) ?? [];
  return <>
    <div className="toolbar"><select value={pid} onChange={(e) => setPid(e.target.value)}>{t.products.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.trade_name}</option>)}</select></div>
    <Card pad={false}><div className="table-wrap"><table>
      <thead><tr><th>Item</th><th>Name</th><th>Type</th><th className="r">Qty / unit (kg or pcs)</th></tr></thead>
      <tbody>{lines.map((b) => <tr key={b.id}><td>{b.item_id}</td><td>{ctx.items.get(b.item_id)?.name}</td><td>{b.item_type}</td><td className="r">{b.qty_per_unit.toExponential(3)}</td></tr>)}</tbody></table></div></Card></>;
}

function Items() {
  const { t, ctx } = useStore();
  const [q, setQ] = useState("");
  const rows = t.items.filter((i) => (i.id + i.name).toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  return <>
    <div className="toolbar"><input className="search" placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
    <Card pad={false}><div className="table-wrap tall"><table>
      <thead><tr><th>ID</th><th>Name</th><th>Type</th><th>UoM</th><th className="r">Price / kg or pc</th><th className="r">Stock (kg)</th><th>Supplier</th></tr></thead>
      <tbody>{rows.map((i) => <tr key={i.id}><td><b>{i.id}</b></td><td>{i.name}</td><td>{i.item_type}</td><td>{i.uom}</td><td className="r">{num(i.price_per_kg, 2)}</td><td className="r">{num(i.stock_kg, 2)}</td><td>{ctx.suppliers.get(i.supplier_id ?? "")?.name ?? "—"}</td></tr>)}</tbody></table></div></Card></>;
}

function Suppliers() {
  const { t } = useStore();
  return <Card pad={false}><div className="table-wrap"><table>
    <thead><tr><th>ID</th><th>Supplier</th><th>Country</th><th>Type</th><th>Local / imported</th><th className="r">Lead time (d)</th><th>Status</th></tr></thead>
    <tbody>{t.suppliers.map((s) => <tr key={s.id}><td><b>{s.id}</b></td><td>{s.name}</td><td>{s.country}</td><td>{s.type}</td><td>{s.local_imported}</td><td className="r">{s.lead_time_days ?? "—"}</td><td>{s.status}</td></tr>)}</tbody></table></div></Card>;
}

function Factories() {
  const { t } = useStore();
  return <Card pad={false}><div className="table-wrap"><table>
    <thead><tr><th>ID</th><th>Factory</th><th>Region</th><th>Lines</th><th>Approved forms</th><th>Contract end</th><th>Status</th></tr></thead>
    <tbody>{t.factories.map((f) => <tr key={f.id}><td><b>{f.id}</b></td><td>{f.name}</td><td>{f.region ?? "—"}</td><td>{f.production_lines ?? "—"}</td><td>{f.approved_forms}</td><td>{D.shortDate(f.contract_end)}</td><td>{f.status}</td></tr>)}</tbody></table></div></Card>;
}
