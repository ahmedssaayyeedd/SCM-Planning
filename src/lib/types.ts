export type PhaseKind = "procurement" | "manufacturing" | "qc" | "release" | "delivery";
export const PHASES: PhaseKind[] = ["procurement", "manufacturing", "qc", "release", "delivery"];
export const PHASE_LABEL: Record<PhaseKind, string> = {
  procurement: "Procurement",
  manufacturing: "Manufacturing",
  qc: "QC testing",
  release: "QA release",
  delivery: "Delivery",
};

export interface Factory {
  id: string; name: string; short_name: string | null; country: string | null; region: string | null;
  status: string | null; production_lines: string | null; approved_forms: string | null;
  contract_start: string | null; contract_end: string | null; lead_time_days: number | null; rating: number | null;
}
export interface Supplier {
  id: string; name: string; country: string | null; type: string | null; local_imported: string | null;
  status: string | null; lead_time_days: number | null;
}
export interface Item {
  id: string; name: string; item_type: string | null; uom: string | null; std_cost: number | null;
  supplier_id: string | null; status: string | null; price_per_kg: number | null; stock_kg: number | null;
}
export interface Product {
  id: string; trade_name: string; dosage_form: string | null; active_ingredients: string | null;
  factory_id: string | null; std_cost: number | null; selling_price_unit: number | null;
  min_batch: number | null; forecast: number | null; reg_no: string | null; reg_expiry: string | null;
  status: string | null;
}
export interface BomLine {
  id: string; product_id: string; item_id: string; item_type: string | null; qty_per_unit: number; uom: string | null;
}
export interface SupplierQuote {
  id: string; item_id: string | null; supplier_id: string | null; price: number | null;
  lead_time_days: number | null; status: string | null;
}
export interface MfgOrder {
  id: string; product_id: string; factory_id: string | null; batch_ref: string | null; order_date: string | null;
  qty_ordered: number; qty_received: number | null; unit_price: number | null; agreed_delivery: string | null;
  actual_delivery: string | null; planned_start: string | null; priority: string | null; status: string | null;
  notes: string | null;
}
export interface OrderPhase {
  id: string; order_id: string; phase: PhaseKind; start_date: string; end_date: string; progress: number; locked: boolean;
}
export interface OrderMaterial {
  id: string; order_id: string | null; item_id: string | null; qty_required: number | null;
  qty_available: number | null; required_date: string | null; expected_arrival: string | null; status: string | null;
}
export interface Batch {
  id: string; batch_no: string | null; order_id: string | null; product_id: string | null; std_size: number | null;
  actual_output: number | null; qa_status: string | null; release_status: string | null; release_date: string | null;
}
export interface Risk {
  id: string; category: string | null; factory_id: string | null; product_id: string | null; order_id: string | null;
  description: string | null; impact: number | null; probability: number | null; capa: string | null;
  owner: string | null; target_close: string | null; status: string | null;
}
export interface Regulatory {
  id: string; level: string | null; product_id: string | null; factory_id: string | null; subject: string | null;
  authority: string | null; requirement_type: string | null; expiry_date: string | null; status: string | null;
}
export interface PlanSettings {
  id: string; procurement_days: number; manufacturing_days: number; qc_days: number; release_days: number;
  delivery_days: number; safety_buffer_days: number; working_days_per_week: number; line_capacity_orders: number;
}

export const DEFAULT_SETTINGS: PlanSettings = {
  id: "default", procurement_days: 30, manufacturing_days: 14, qc_days: 10, release_days: 5,
  delivery_days: 3, safety_buffer_days: 5, working_days_per_week: 5, line_capacity_orders: 1,
};

export interface Tables {
  factories: Factory[]; suppliers: Supplier[]; items: Item[]; products: Product[]; bom_lines: BomLine[];
  supplier_quotes: SupplierQuote[]; manufacturing_orders: MfgOrder[]; order_phases: OrderPhase[];
  order_materials: OrderMaterial[]; batches: Batch[]; risks: Risk[]; regulatory: Regulatory[];
  plan_settings: PlanSettings[];
}
export type TableName = keyof Tables;
