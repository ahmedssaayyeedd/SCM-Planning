-- PharmaPlan schema. Run in the Supabase SQL editor BEFORE seed.sql.
-- Column names are snake_case and match src/lib/types.ts one-to-one.

create table if not exists public.factories (
  id text primary key, name text not null, short_name text, country text, region text,
  status text default 'Active', production_lines text, approved_forms text,
  contract_start date, contract_end date, lead_time_days int, rating int
);
create table if not exists public.suppliers (
  id text primary key, name text not null, country text, type text, local_imported text,
  status text default 'Active', lead_time_days int
);
create table if not exists public.items (
  id text primary key, name text not null, item_type text, uom text, std_cost numeric,
  supplier_id text references public.suppliers(id), status text default 'Active',
  price_per_kg numeric, stock_kg numeric
);
create table if not exists public.products (
  id text primary key, trade_name text not null, dosage_form text, active_ingredients text,
  factory_id text references public.factories(id), std_cost numeric, selling_price_unit numeric,
  min_batch numeric, forecast numeric, reg_no text, reg_expiry date, status text default 'Active'
);
create table if not exists public.bom_lines (
  id text primary key, product_id text not null references public.products(id) on delete cascade,
  item_id text not null references public.items(id), item_type text,
  qty_per_unit numeric not null,        -- kg (or pieces for packaging) per finished unit
  uom text
);
create table if not exists public.supplier_quotes (
  id text primary key, item_id text references public.items(id), supplier_id text references public.suppliers(id),
  price numeric, lead_time_days int, status text default 'Active'
);
create table if not exists public.manufacturing_orders (
  id text primary key, product_id text not null references public.products(id),
  factory_id text references public.factories(id), batch_ref text, order_date date,
  qty_ordered numeric not null default 0, qty_received numeric default 0, unit_price numeric,
  agreed_delivery date, actual_delivery date, planned_start date, priority text default 'Normal',
  status text default 'Not started', notes text
);
-- The Gantt tasks: one row per phase of an order.
create table if not exists public.order_phases (
  id text primary key, order_id text not null references public.manufacturing_orders(id) on delete cascade,
  phase text not null check (phase in ('procurement','manufacturing','qc','release','delivery')),
  start_date date not null, end_date date not null,
  progress int not null default 0 check (progress between 0 and 100),
  locked boolean not null default false         -- true once a planner has moved it by hand
);
create table if not exists public.order_materials (
  id text primary key, order_id text references public.manufacturing_orders(id) on delete cascade,
  item_id text references public.items(id), qty_required numeric, qty_available numeric,
  required_date date, expected_arrival date, status text
);
create table if not exists public.batches (
  id text primary key, batch_no text, order_id text references public.manufacturing_orders(id) on delete cascade,
  product_id text references public.products(id), std_size numeric, actual_output numeric,
  qa_status text, release_status text, release_date date
);
create table if not exists public.risks (
  id text primary key, category text, factory_id text, product_id text, order_id text,
  description text, impact int, probability int, capa text, owner text, target_close date, status text
);
create table if not exists public.regulatory (
  id text primary key, level text, product_id text, factory_id text, subject text, authority text,
  requirement_type text, expiry_date date, status text
);
-- Planner parameters (durations in working days). One row, id = 'default'.
create table if not exists public.plan_settings (
  id text primary key default 'default',
  procurement_days int not null default 30,
  manufacturing_days int not null default 14,
  qc_days int not null default 10,
  release_days int not null default 5,
  delivery_days int not null default 3,
  safety_buffer_days int not null default 5,
  working_days_per_week int not null default 5,
  line_capacity_orders int not null default 1      -- orders a factory can run in parallel
);
insert into public.plan_settings (id) values ('default') on conflict do nothing;

-- ---------- Row Level Security: any signed-in user can read and write ----------
do $$
declare t text;
begin
  foreach t in array array['factories','suppliers','items','products','bom_lines','supplier_quotes',
    'manufacturing_orders','order_phases','order_materials','batches','risks','regulatory','plan_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "auth all" on public.%I', t);
    execute format('create policy "auth all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

create index if not exists idx_phases_order on public.order_phases(order_id);
create index if not exists idx_bom_product on public.bom_lines(product_id);
create index if not exists idx_orders_factory on public.manufacturing_orders(factory_id);
