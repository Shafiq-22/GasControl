-- Gas Control — core schema
-- Mirrors the "SHARED GAS STORE | Monthly financial control" workbook:
-- settings, masters, and the two append-only registers (purchases, movements).
-- Everything else in the workbook is derived and is computed by the app engine.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums

create type movement_type as enum (
  'ISSUE',          -- STORE -> department
  'RETURN_EMPTY',   -- department -> STORE (empty cylinder back)
  'RETURN_UNUSED',  -- department -> STORE (still full; credits the source layer)
  'TRANSFER',       -- department -> department
  'TO_SUPPLIER',    -- STORE -> SUPPLIER (empties collected)
  'ADJUSTMENT'      -- loss / damage / correction
);

create type valuation_method as enum ('FIFO_MONTHLY', 'WAC', 'STD');
create type charge_trigger   as enum ('ON_ISSUE', 'ON_ISSUE_MONTH_END', 'ON_RETURN');
create type rounding_rule    as enum ('NEAREST', 'UP', 'DOWN');
create type delivery_alloc   as enum ('PER_CYLINDER', 'PER_LINE');
create type empty_policy     as enum ('ASSUME_ALL_OUT', 'IGNORE');
create type app_role         as enum ('admin', 'custodian', 'viewer');

-- ---------------------------------------------------------------- people

create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  full_name   text,
  role        app_role not null default 'viewer',
  created_at  timestamptz not null default now()
);

comment on table profiles is
  'One row per signed-in user. Role drives write access: admin edits settings and masters, custodian records purchases and movements, viewer is read-only.';

-- ---------------------------------------------------------------- settings

create table settings (
  id                      boolean primary key default true check (id),

  company_name            text not null default 'CONFIGURE COMPANY',
  store_name              text not null default 'SHARED GAS STORE',
  custodian               text not null default 'CONFIGURE CUSTODIAN',

  currency_code           text not null default 'AED',
  posting_decimals        smallint not null default 2 check (posting_decimals between 0 and 4),
  rounding                rounding_rule not null default 'NEAREST',

  fy_start_month          smallint not null default 1 check (fy_start_month between 1 and 12),
  report_month            date not null default date_trunc('month', current_date)::date,
  history_start           date not null default date_trunc('month', current_date)::date,
  lock_date               date,

  purchase_vat_rate       numeric(6,4) not null default 0.05 check (purchase_vat_rate between 0 and 1),
  purchase_includes_vat   boolean not null default false,
  backcharge_vat_rate     numeric(6,4) not null default 0 check (backcharge_vat_rate between 0 and 1),
  backcharge_uplift       numeric(6,4) not null default 0 check (backcharge_uplift between 0 and 1),

  valuation               valuation_method not null default 'FIFO_MONTHLY',
  honour_po_link          boolean not null default true,
  trigger_rule            charge_trigger not null default 'ON_ISSUE_MONTH_END',
  delivery_allocation     delivery_alloc not null default 'PER_CYLINDER',

  purchasing_department   text,
  require_cost_code       boolean not null default true,
  require_receiver        boolean not null default true,
  allow_negative_stock    boolean not null default false,
  max_backdating_days     smallint not null default 7,
  empty_state_policy      empty_policy not null default 'ASSUME_ALL_OUT',

  posting_account         text not null default 'CONFIGURE ACCOUNT',
  tolerance               numeric(10,6) not null default 0.005,
  stock_unit              text not null default 'cyl',
  store_code              text not null default 'STORE',
  supplier_code           text not null default 'SUPPLIER',
  loss_code               text not null default 'LOSS',

  updated_at              timestamptz not null default now()
);

comment on column settings.report_month is
  'First day of the reporting month. Drives the backcharge report, department statements and the dayworks export.';
comment on column settings.lock_date is
  'Movements and receipts dated on or before this are flagged for review, never blocked.';

-- ---------------------------------------------------------------- masters

create table departments (
  code        text primary key,
  full_name   text not null,
  cost_centre text not null,
  contact     text,
  active      boolean not null default true,
  sort_order  smallint not null default 0
);

create table gas_items (
  item_code       text primary key,
  description     text not null,
  gas_type        text,
  cylinder_size   text,
  unit            text not null default 'cyl',
  nominal_content text,
  standard_rate   numeric(14,4) not null default 0,
  hazard_class    text,
  active          boolean not null default true,
  -- operating limits (workbook 01_SETTINGS item limits block)
  reorder_point    numeric(12,2) not null default 0,
  minimum_stock    numeric(12,2) not null default 0,
  max_dept_holding numeric(12,2) not null default 0,
  sort_order      smallint not null default 0
);

create table suppliers (
  vendor_no text primary key,
  name      text not null,
  contact   text,
  active    boolean not null default true
);

create table cost_codes (
  code              text primary key,
  description       text not null,
  owning_department text not null references departments(code) on update cascade,
  active            boolean not null default true
);

create table personnel (
  employee_no text primary key,
  name        text not null,
  department  text not null references departments(code) on update cascade,
  active      boolean not null default true
);

create index on cost_codes (owning_department);
create index on personnel (department);

-- ------------------------------------------------------------- purchases

-- One row per PO line, received in full. Each fully received row becomes a
-- cost layer that FIFO draws from.
create table purchases (
  id                uuid primary key default gen_random_uuid(),
  transaction_id    text not null unique,

  po_date           date not null,
  po_no             text not null,
  po_line           integer not null check (po_line > 0),
  vendor_no         text references suppliers(vendor_no) on update cascade,
  purchasing_department text not null references departments(code) on update cascade,
  item_code         text not null references gas_items(item_code) on update cascade,

  qty_ordered       numeric(12,2) not null check (qty_ordered > 0),
  unit_refill_rate  numeric(14,4) not null check (unit_refill_rate >= 0),
  delivery_charge   numeric(14,4) not null default 0 check (delivery_charge >= 0),
  other_charges     numeric(14,4) not null default 0 check (other_charges >= 0),

  qty_received      numeric(12,2) not null default 0 check (qty_received >= 0),
  receipt_date      date,
  received_by       text,

  remarks           text,
  entered_by        text,
  entry_date        timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  created_by        uuid references profiles(id),

  constraint purchases_po_line_unique unique (po_no, po_line),
  constraint purchases_receipt_needs_date check (qty_received = 0 or receipt_date is not null)
);

create index on purchases (item_code, receipt_date);
create index on purchases (purchasing_department);

comment on table purchases is
  'Append-only purchase register. Correct a mistake with a further row; do not overwrite history.';

-- ------------------------------------------------------------- movements

create table movements (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  text not null unique,

  moved_on        date not null,
  kind            movement_type not null,
  item_code       text not null references gas_items(item_code) on update cascade,
  quantity        numeric(12,2) not null check (quantity > 0),

  from_code       text not null,   -- department code, or STORE / SUPPLIER / LOSS
  to_code         text not null,
  receiver_name   text,
  cost_code       text references cost_codes(code) on update cascade,
  location_area   text,

  source_po_line  text,            -- e.g. 'PO1/1' — reserves that specific layer
  residual_pct    numeric(5,2) check (residual_pct between 0 and 100),
  reason          text,
  original_transaction_id text references movements(transaction_id)
                    on update cascade deferrable initially deferred,

  remarks         text,
  entry_timestamp timestamptz not null default now(),
  entered_by      text,
  created_at      timestamptz not null default now(),
  created_by      uuid references profiles(id)
);

create index on movements (item_code, moved_on);
create index on movements (kind);
create index on movements (original_transaction_id);

comment on table movements is
  'Append-only movement register: issues, returns, transfers, supplier collections and adjustments.';
comment on column movements.source_po_line is
  'Optional explicit layer reservation, formatted PO/line. When set and honour_po_link is on, the line is valued at that layer''s landed rate and credited to that layer''s owner.';

-- ------------------------------------------------- posting audit trail

-- Written once when a month's dayworks export is posted, so the same month is
-- not posted twice and the accounting reference stays with the data.
create table postings (
  id            uuid primary key default gen_random_uuid(),
  report_month  date not null unique,
  posted_at     timestamptz not null default now(),
  posted_by     uuid references profiles(id),
  reference     text not null,
  line_count    integer not null default 0,
  total_amount  numeric(16,4) not null default 0,
  notes         text
);

-- ------------------------------------------------------- id generators

-- Zero-padded human-readable ids (P-000001 / M-000001) matching the workbook.
create sequence purchase_seq;
create sequence movement_seq;

create or replace function next_purchase_id() returns text
  language sql volatile set search_path = public, pg_temp as
$$ select 'P-' || lpad(nextval('purchase_seq')::text, 6, '0') $$;

create or replace function next_movement_id() returns text
  language sql volatile set search_path = public, pg_temp as
$$ select 'M-' || lpad(nextval('movement_seq')::text, 6, '0') $$;

alter table purchases alter column transaction_id set default next_purchase_id();
alter table movements alter column transaction_id set default next_movement_id();

-- ------------------------------------------------ new-user provisioning

create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as
$$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    -- the very first account to sign up administers the store
    case when (select count(*) from public.profiles) = 0 then 'admin' else 'viewer' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
