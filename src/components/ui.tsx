import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";
import { Health } from "../lib/scheduling";
import { PhaseKind } from "../lib/types";

export const PHASE_COLOR: Record<PhaseKind, string> = {
  procurement: "#f59e0b", manufacturing: "#0f766e", qc: "#6366f1", release: "#0ea5e9", delivery: "#16a34a",
};
export const HEALTH_LABEL: Record<Health, string> = { done: "Completed", late: "Late", tight: "At risk", ok: "On track" };

export const num = (n: number | null | undefined, d = 0) =>
  n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const qty = (n: number) => (n >= 100 ? num(n, 0) : n >= 1 ? num(n, 2) : num(n, 4));
export const egp = (n: number | null | undefined) => (n == null ? "—" : "EGP " + num(n, 0));

export function Badge({ tone, children }: { tone: "green" | "amber" | "red" | "blue" | "gray" | "teal"; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export const HealthBadge = ({ h }: { h: Health }) => (
  <Badge tone={h === "late" ? "red" : h === "tight" ? "amber" : h === "done" ? "gray" : "green"}>{HEALTH_LABEL[h]}</Badge>
);

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}

export function Kpi({ label, value, hint, tone = "teal" }: { label: string; value: ReactNode; hint?: string; tone?: "teal" | "red" | "amber" | "blue" }) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

export function Card({ title, right, children, pad = true }: { title?: string; right?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <section className="card">
      {(title || right) && (
        <header className="card-head">
          <h3>{title}</h3>
          <div>{right}</div>
        </header>
      )}
      <div className={pad ? "card-body" : ""}>{children}</div>
    </section>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const blob = new Blob(["\ufeff" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
