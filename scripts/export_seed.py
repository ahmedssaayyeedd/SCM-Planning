"""Export Pharma_SupplyChain_DB_v10.xlsx -> src/data/seed.json + supabase/seed.sql
Usage: python scripts/export_seed.py path/to/Pharma_SupplyChain_DB_v10.xlsx"""
import sys, json, math
import pandas as pd

XLSX = sys.argv[1] if len(sys.argv) > 1 else "Pharma_SupplyChain_DB_v10.xlsx"


def load(sheet, key):
    df = pd.read_excel(XLSX, sheet_name=sheet, header=4).iloc[:, 1:]
    df = df.dropna(how="all")
    return df[df[key].notna()].reset_index(drop=True)


def clean(v):
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, pd.Timestamp):
        return v.strftime("%Y-%m-%d")
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, str):
        v = v.strip() or None
    return v


def rows(df, mapping):
    return [
        {dst: clean(r[src]) if src in df.columns else None for dst, src in mapping.items()}
        for _, r in df.iterrows()
    ]


T = {}
T["factories"] = rows(load("Factories", "Factory ID"), {
    "id": "Factory ID", "name": "Factory Name", "short_name": "Short Name", "country": "Country",
    "region": "Region", "status": "Status", "production_lines": "Production Lines",
    "approved_forms": "Approved Dosage Forms", "contract_start": "Contract Start",
    "contract_end": "Contract End", "lead_time_days": "Lead Time (days)", "rating": "Rating (1-5)"})
T["suppliers"] = rows(load("Suppliers", "Supplier ID"), {
    "id": "Supplier ID", "name": "Supplier Name", "country": "Country", "type": "Type",
    "local_imported": "Local / Imported", "status": "Status", "lead_time_days": "Lead Time (days)"})
T["items"] = rows(load("Items Master", "Item ID"), {
    "id": "Item ID", "name": "Item Name", "item_type": "Item Type", "uom": "UoM",
    "std_cost": "Std Cost / Unit", "supplier_id": "Supplier ID", "status": "Status",
    "price_per_kg": "Price per kg / pc", "stock_kg": "In stock (kg)"})
T["products"] = rows(load("Products", "Product ID"), {
    "id": "Product ID", "trade_name": "Trade Name", "dosage_form": "Dosage Form",
    "active_ingredients": "Active Ingredients", "factory_id": "Factory ID", "std_cost": "Std Cost / Unit",
    "selling_price_unit": "Selling Price / Unit", "min_batch": "Min Batch (units)",
    "forecast": "Forecast (units)", "reg_no": "Registration No", "reg_expiry": "Reg. Expiry",
    "status": "Status"})
T["bom_lines"] = rows(load("Product BOM", "BOM Line"), {
    "id": "BOM Line", "product_id": "Product ID", "item_id": "Item ID", "item_type": "Type",
    "qty_per_unit": "Qty per unit (kg or pcs)", "uom": "UoM"})
T["supplier_quotes"] = rows(load("Supplier Quotes", "Quote ID"), {
    "id": "Quote ID", "item_id": "Item ID", "supplier_id": "Supplier ID", "price": "Price per kg / pc",
    "lead_time_days": "Lead time (days)", "status": "Status"})
T["manufacturing_orders"] = rows(load("Manufacturing Orders", "Order ID"), {
    "id": "Order ID", "product_id": "Product ID", "factory_id": "Factory ID", "batch_ref": "Batch/Lot Ref",
    "order_date": "Order Date", "qty_ordered": "Qty Ordered", "qty_received": "Qty Received",
    "unit_price": "Unit Price", "agreed_delivery": "Agreed Delivery", "actual_delivery": "Actual Delivery",
    "planned_start": "Planned Start", "priority": "Priority", "status": "Status", "notes": "Notes"})
T["order_materials"] = rows(load("Order Materials", "Line ID"), {
    "id": "Line ID", "order_id": "Order ID", "item_id": "Item ID", "qty_required": "Qty Required",
    "qty_available": "Qty Available", "required_date": "Required Date",
    "expected_arrival": "Expected Arrival", "status": "Status"})
T["batches"] = rows(load("Batches & Release", "Batch ID"), {
    "id": "Batch ID", "batch_no": "Batch No", "order_id": "Order ID", "product_id": "Product ID",
    "std_size": "Std Batch Size", "actual_output": "Actual Output", "qa_status": "QA Status",
    "release_status": "Release Status", "release_date": "Release Date"})
T["risks"] = rows(load("Risks & CAPA", "Risk ID"), {
    "id": "Risk ID", "category": "Category", "factory_id": "Factory ID", "product_id": "Product ID",
    "order_id": "Order ID", "description": "Description", "impact": "Impact (1-5)",
    "probability": "Probability (1-5)", "capa": "CAPA", "owner": "Owner", "target_close": "Target Close",
    "status": "Status"})
T["regulatory"] = rows(load("Regulatory", "Reg ID"), {
    "id": "Reg ID", "level": "Level", "product_id": "Product ID", "factory_id": "Factory ID",
    "subject": "Subject", "authority": "Authority", "requirement_type": "Requirement Type",
    "expiry_date": "Expiry Date", "status": "Status"})

# ---- clearly labelled DEMO orders so the Gantt has content (the workbook only holds 2 orders) ----
demo = [
    ("MO-2026-003", "PROD-006", "FAC-001", "B-003", "2026-09-15", 200000, "2026-12-10", "High", "In production"),
    ("MO-2026-004", "PROD-006", "FAC-001", "B-004", "2026-10-05", 300000, "2027-01-10", "Urgent", "Materials pending"),
    ("MO-2026-005", "PROD-002", "FAC-001", "B-005", "2026-10-20", 60000, "2027-01-25", "Normal", "Not started"),
    ("MO-2026-006", "PROD-007", "FAC-002", "B-006", "2026-10-25", 40000, "2027-02-05", "Normal", "Not started"),
    ("MO-2026-007", "PROD-010", "FAC-004", "B-007", "2026-09-25", 150000, "2026-12-18", "High", "In production"),
    ("MO-2026-008", "PROD-003", "FAC-004", "B-008", "2026-11-01", 80000, "2027-02-20", "Normal", "Not started"),
    ("MO-2026-009", "PROD-008", "FAC-001", "B-009", "2026-11-05", 90000, "2027-03-10", "Low", "Not started"),
]
cost = {p["id"]: p["std_cost"] or 0 for p in T["products"]}
for (i, p, f, b, od, q, ad, pr, st) in demo:
    T["manufacturing_orders"].append({
        "id": i, "product_id": p, "factory_id": f, "batch_ref": b, "order_date": od, "qty_ordered": q,
        "qty_received": 0, "unit_price": round(cost[p] * 1.3, 4), "agreed_delivery": ad,
        "actual_delivery": None, "planned_start": None, "priority": pr, "status": st,
        "notes": "demo (planned)"})

json.dump(T, open("src/data/seed.json", "w"), ensure_ascii=False, indent=1)


def lit(v):
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


order = ["factories", "suppliers", "items", "products", "bom_lines", "supplier_quotes",
         "manufacturing_orders", "order_materials", "batches", "risks", "regulatory"]
with open("supabase/seed.sql", "w", encoding="utf-8") as f:
    f.write("-- Generated by scripts/export_seed.py from Pharma_SupplyChain_DB_v10.xlsx\n")
    f.write("-- MO-2026-003..009 are DEMO orders (notes = 'demo (planned)'). Delete them if unwanted.\nbegin;\n")
    for t in order:
        rs = T[t]
        if not rs:
            continue
        cols = list(rs[0].keys())
        f.write(f"\n-- {t} ({len(rs)})\ninsert into public.{t} ({', '.join(cols)}) values\n")
        f.write(",\n".join("  (" + ", ".join(lit(r[c]) for c in cols) + ")" for r in rs))
        f.write("\non conflict (id) do nothing;\n")
    f.write("\ncommit;\n")
print({k: len(v) for k, v in T.items()})
