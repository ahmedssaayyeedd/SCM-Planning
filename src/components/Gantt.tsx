import { PointerEvent as RPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import * as D from "../lib/dates";
import { cascade, Ctx, orderMetrics } from "../lib/scheduling";
import { MfgOrder, OrderPhase, PHASES, PHASE_LABEL, PhaseKind } from "../lib/types";
import { PHASE_COLOR } from "./ui";

export type Zoom = "day" | "week" | "month";
export const ZOOM_PX: Record<Zoom, number> = { day: 30, week: 12, month: 4.5 };

export interface GanttGroup {
  id: string; label: string; sub?: string; orders: MfgOrder[];
  milestones?: { date: string; label: string; tone: "red" | "amber" }[];
}
interface Props {
  groups: GanttGroup[];
  phasesByOrder: Map<string, OrderPhase[]>;
  ctx: Ctx;
  zoom: Zoom;
  expanded: Set<string>;
  selected: string | null;
  onToggle: (orderId: string) => void;
  onSelect: (orderId: string) => void;
  onCommit: (phases: OrderPhase[]) => void;
}

const LEFT = 310, HEAD = 54, H_GROUP = 34, H_ORDER = 40, H_PHASE = 28;
type Row =
  | { type: "group"; g: GanttGroup; y: number; h: number }
  | { type: "order"; o: MfgOrder; y: number; h: number }
  | { type: "phase"; o: MfgOrder; k: PhaseKind; y: number; h: number };
type Mode = "order" | "move" | "resize-l" | "resize-r";

const sortPhases = (ph: OrderPhase[]) =>
  PHASES.map((k) => ph.find((p) => p.phase === k)).filter(Boolean).map((p) => ({ ...p! }));

function applyDrag(orig: OrderPhase[], mode: Mode, phase: PhaseKind | undefined, delta: number, wd: number): OrderPhase[] {
  const ph = sortPhases(orig);
  if (delta === 0) return ph;
  const shift = (p: OrderPhase, d: number) => {
    p.start_date = D.snapWork(D.addDays(p.start_date, d), 1, wd);
    p.end_date = D.snapWork(D.addDays(p.end_date, d), -1, wd);
    if (p.end_date < p.start_date) p.end_date = p.start_date;
    p.locked = true;
  };
  if (mode === "order") { ph.forEach((p) => shift(p, delta)); return ph; }
  const i = ph.findIndex((p) => p.phase === phase);
  if (i < 0) return ph;
  const p = ph[i];
  const prev = ph[i - 1];
  const minStart = prev ? D.addDays(prev.end_date, 1) : "0000-01-01";
  if (mode === "move") {
    const d = Math.max(delta, D.diffDays(p.start_date, minStart));
    shift(p, d);
  } else if (mode === "resize-r") {
    p.end_date = D.snapWork(D.addDays(p.end_date, delta), -1, wd);
    if (p.end_date < p.start_date) p.end_date = p.start_date;
    p.locked = true;
  } else {
    p.start_date = D.maxDate(minStart, D.snapWork(D.addDays(p.start_date, delta), 1, wd));
    if (p.start_date > p.end_date) p.start_date = p.end_date;
    p.locked = true;
  }
  const out = cascade(ph, ph[0].order_id, wd);
  return out.map((x) => ({ ...x, locked: x.locked || ph.find((q) => q.phase === x.phase)!.locked }));
}

export default function Gantt({ groups, phasesByOrder, ctx, zoom, expanded, selected, onToggle, onSelect, onCommit }: Props) {
  const dayW = ZOOM_PX[zoom];
  const wd = ctx.settings.working_days_per_week;
  const td = D.today();
  const scroller = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{ orderId: string; phases: OrderPhase[] } | null>(null);

  const phasesFor = (id: string) => (preview?.orderId === id ? preview.phases : phasesByOrder.get(id) ?? []);

  /* ---- time range ---- */
  const { rangeStart, totalDays } = useMemo(() => {
    let min = D.addDays(td, -21), max = D.addDays(td, 90);
    for (const g of groups) for (const o of g.orders) {
      for (const p of phasesByOrder.get(o.id) ?? []) { min = D.minDate(min, p.start_date); max = D.maxDate(max, p.end_date); }
      if (o.agreed_delivery) max = D.maxDate(max, o.agreed_delivery);
    }
    const rs = D.startOfWeek(D.addDays(min, -7));
    return { rangeStart: rs, totalDays: D.diffDays(rs, D.addDays(max, 21)) + 1 };
  }, [groups, phasesByOrder, td]);
  const totalW = totalDays * dayW;
  const x = (date: string) => D.diffDays(rangeStart, date) * dayW;
  const w = (s: string, e: string) => (D.diffDays(s, e) + 1) * dayW;

  /* ---- rows ---- */
  const { rows, totalH } = useMemo(() => {
    const rows: Row[] = [];
    let y = 0;
    for (const g of groups) {
      if (!g.orders.length) continue;
      rows.push({ type: "group", g, y, h: H_GROUP }); y += H_GROUP;
      for (const o of g.orders) {
        rows.push({ type: "order", o, y, h: H_ORDER }); y += H_ORDER;
        if (expanded.has(o.id)) for (const k of PHASES) { rows.push({ type: "phase", o, k, y, h: H_PHASE }); y += H_PHASE; }
      }
    }
    return { rows, totalH: y };
  }, [groups, expanded]);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = Math.max(0, x(td) - 180);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, rangeStart]);

  /* ---- header ---- */
  const months = useMemo(() => {
    const out: { label: string; days: number }[] = [];
    let cur = rangeStart, count = 0, label = D.monthName(rangeStart);
    for (let i = 0; i < totalDays; i++) {
      const d = D.addDays(rangeStart, i);
      const l = D.monthName(d);
      if (l !== label) { out.push({ label, days: count }); label = l; count = 0; }
      count++; cur = d;
    }
    void cur;
    out.push({ label, days: count });
    return out;
  }, [rangeStart, totalDays]);

  const weekendDays = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < totalDays; i++) if (!D.isWorkday(D.addDays(rangeStart, i), wd)) out.push(i);
    return out;
  }, [rangeStart, totalDays, wd]);

  /* ---- dragging ---- */
  const startDrag = (e: RPointerEvent, orderId: string, mode: Mode, phase?: PhaseKind) => {
    e.preventDefault();
    e.stopPropagation();
    const orig = sortPhases(phasesByOrder.get(orderId) ?? []);
    const startX = e.clientX;
    let moved = false;
    const calc = (ev: PointerEvent) => Math.round((ev.clientX - startX) / dayW);
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - startX) > 3) moved = true;
      if (moved) setPreview({ orderId, phases: applyDrag(orig, mode, phase, calc(ev), wd) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) { setPreview(null); onSelect(orderId); return; }
      const final = applyDrag(orig, mode, phase, calc(ev), wd);
      setPreview(null);
      onCommit(final);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* ---- dependency arrows (expanded orders) ---- */
  const arrows: string[] = [];
  for (const r of rows) {
    if (r.type !== "order" || !expanded.has(r.o.id)) continue;
    const ph = sortPhases(phasesFor(r.o.id));
    for (let i = 0; i < ph.length - 1; i++) {
      const a = ph[i], b = ph[i + 1];
      const ya = r.y + H_ORDER + i * H_PHASE + H_PHASE / 2;
      const yb = r.y + H_ORDER + (i + 1) * H_PHASE + H_PHASE / 2;
      const x1 = x(a.end_date) + dayW, x2 = x(b.start_date);
      arrows.push(`M${x1},${ya} H${x1 + 6} V${yb} H${Math.max(x2 - 4, x1 + 6)} `);
      arrows.push(`M${x2},${yb} l-5,-3.5 v7 z`);
    }
  }

  const timelineHeight = totalH + 12;
  return (
    <div className="gantt-scroll" ref={scroller}>
      <div className="gantt" style={{ width: LEFT + totalW }}>
        {/* header */}
        <div className="g-head" style={{ height: HEAD }}>
          <div className="g-corner" style={{ width: LEFT }}>Factory · Order · Phase</div>
          <div style={{ width: totalW }}>
            <div className="g-months">
              {months.map((m, i) => <div key={i} style={{ width: m.days * dayW }}>{m.days * dayW > 50 ? m.label : ""}</div>)}
            </div>
            <div className="g-days">
              {Array.from({ length: totalDays }).map((_, i) => {
                const d = D.addDays(rangeStart, i);
                const dd = D.parse(d);
                const show = zoom === "day" || (zoom === "week" && dd.getDay() === 0);
                return (
                  <div key={i} style={{ width: dayW }} className={!D.isWorkday(d, wd) ? "we" : d === td ? "today" : ""}>
                    {show ? String(dd.getDate()).padStart(2, "0") : ""}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* body */}
        <div className="g-body" style={{ height: timelineHeight }}>
          <svg className="g-bg" style={{ left: LEFT, width: totalW, height: timelineHeight }}>
            {weekendDays.map((i) => <rect key={i} x={i * dayW} y={0} width={dayW} height={timelineHeight} className="g-we" />)}
            {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, i) => <line key={i} x1={i * 7 * dayW} x2={i * 7 * dayW} y1={0} y2={timelineHeight} className="g-wk" />)}
          </svg>

          {rows.map((r, idx) => {
            if (r.type === "group") {
              return (
                <div key={`g${r.g.id}`} className="g-row g-group" style={{ top: r.y, height: r.h }}>
                  <div className="g-left" style={{ width: LEFT }}>
                    <b>{r.g.label}</b><span>{r.g.sub}</span>
                  </div>
                  <div className="g-track" style={{ width: totalW }}>
                    {r.g.milestones?.map((m, i) => (
                      <div key={i} className={`g-ms ms-${m.tone}`} style={{ left: x(m.date) + dayW / 2 - 6 }} title={`${m.label} — ${D.shortDate(m.date)}`} />
                    ))}
                  </div>
                </div>
              );
            }
            if (r.type === "order") {
              const ph = sortPhases(phasesFor(r.o.id));
              const met = orderMetrics(r.o, ph, ctx);
              const isExp = expanded.has(r.o.id);
              return (
                <div key={`o${r.o.id}`} className={`g-row g-order ${selected === r.o.id ? "sel" : ""}`} style={{ top: r.y, height: r.h }}>
                  <div className="g-left" style={{ width: LEFT }} onClick={() => onSelect(r.o.id)}>
                    <button className="g-chev" onClick={(e) => { e.stopPropagation(); onToggle(r.o.id); }} aria-label="Expand phases">
                      {isExp ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                    <i className={`dot dot-${met?.health ?? "ok"}`} />
                    <div className="g-name">
                      <b>{r.o.id}</b>
                      <span>{ctx.products.get(r.o.product_id)?.trade_name ?? r.o.product_id}</span>
                    </div>
                    <em>{met ? `${met.progress}%` : ""}</em>
                  </div>
                  <div className="g-track" style={{ width: totalW }}>
                    {ph.map((p) => (
                      <div
                        key={p.phase}
                        className="g-seg"
                        style={{ left: x(p.start_date), width: w(p.start_date, p.end_date), background: PHASE_COLOR[p.phase] }}
                        title={`${PHASE_LABEL[p.phase]}: ${D.shortDate(p.start_date)} → ${D.shortDate(p.end_date)} · ${p.progress}%`}
                        onPointerDown={(e) => startDrag(e, r.o.id, "order")}
                      >
                        <div className="g-prog" style={{ width: `${p.progress}%` }} />
                      </div>
                    ))}
                    {r.o.agreed_delivery && (
                      <div className={`g-ms ms-${met?.health === "late" ? "red" : "dark"}`} style={{ left: x(r.o.agreed_delivery) + dayW / 2 - 6 }}
                        title={`Agreed delivery ${D.shortDate(r.o.agreed_delivery)}${met && met.lateDays ? ` — projected ${met.lateDays} workdays late` : ""}`} />
                    )}
                  </div>
                </div>
              );
            }
            const p = sortPhases(phasesFor(r.o.id)).find((x) => x.phase === r.k);
            return (
              <div key={`p${r.o.id}${r.k}${idx}`} className="g-row g-phase" style={{ top: r.y, height: r.h }}>
                <div className="g-left" style={{ width: LEFT }}>
                  <i className="sw" style={{ background: PHASE_COLOR[r.k] }} />
                  <span>{PHASE_LABEL[r.k]}</span>
                  <em>{p ? `${D.shortDate(p.start_date).slice(0, 6)} → ${D.shortDate(p.end_date).slice(0, 6)}` : ""}</em>
                  {p?.locked && <Lock size={11} className="lockic" />}
                </div>
                <div className="g-track" style={{ width: totalW }}>
                  {p && (
                    <div className="g-seg g-seg-phase" style={{ left: x(p.start_date), width: w(p.start_date, p.end_date), background: PHASE_COLOR[r.k] }}
                      title={`${PHASE_LABEL[r.k]}: ${D.shortDate(p.start_date)} → ${D.shortDate(p.end_date)} · ${p.progress}%`}
                      onPointerDown={(e) => startDrag(e, r.o.id, "move", r.k)}>
                      <div className="g-prog" style={{ width: `${p.progress}%` }} />
                      <span className="g-handle l" onPointerDown={(e) => startDrag(e, r.o.id, "resize-l", r.k)} />
                      <span className="g-handle r" onPointerDown={(e) => startDrag(e, r.o.id, "resize-r", r.k)} />
                      {w(p.start_date, p.end_date) > 80 && <b>{D.shortDate(p.start_date).slice(0, 6)} → {D.shortDate(p.end_date).slice(0, 6)}</b>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <svg className="g-fg" style={{ left: LEFT, width: totalW, height: timelineHeight }}>
            {arrows.map((d, i) => <path key={i} d={d} className={d.startsWith("M") && d.includes("l-5") ? "g-arrowhead" : "g-arrow"} />)}
            <line x1={x(td) + dayW / 2} x2={x(td) + dayW / 2} y1={0} y2={timelineHeight} className="g-today" />
          </svg>
        </div>
      </div>
    </div>
  );
}
