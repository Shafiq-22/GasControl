# Gas Control

A web app for the shared gas store: refill purchases, cylinder movements, and
the monthly backcharge between departments.

It replaces the `Gas_Control.xlsx` workbook, keeping its model intact — the
same cost layers, the same FIFO valuation, the same release controls — while
moving the data into Postgres so several people can record movements at once
without passing a file around.

Excel does not go away. The original workbook imports in one step, and every
report exports back out, because month end is still reviewed, signed and
archived on paper.

## What it does

| Screen | What it is for |
| --- | --- |
| **Dashboard** | The 14 release controls, department position and reorder alerts. Any FAIL blocks the month. |
| **Stock** | Quantity by item across store, departments, empties, supplier and write-offs, plus stock value by owner and the open cost layers. |
| **Purchases** | One row per PO line. A fully received line becomes a cost layer FIFO draws from. |
| **Movements** | Issues, returns, transfers, supplier collections and adjustments. |
| **Backcharge** | The owner-to-consumer matrix, pairwise settlement and every charge line behind it. |
| **Statements** | A printable per-department statement with signature blocks. |
| **Dayworks** | Cross-department lines ready for the accounting system, plus the posting record. |
| **Masters** | Departments, gas items, suppliers, cost codes and personnel. |
| **Import** | Load the original workbook, or anything exported from here. |
| **Settings** | Organisation, reporting month, valuation policy and entry rules. |

## How the money works

Only refills are bought — there is no rental, deposit or serial-number
register — so the whole model hangs off one idea: **a cost layer**.

1. **A received PO line becomes a layer.** Its landed rate is the refill rate
   net of VAT, plus that line's share of PO-wide delivery and other charges.
   The purchasing department is the layer's **owner**.
2. **Consumption draws from layers.** A movement naming a **source PO line**
   reserves that specific layer and pays its actual rate. Everything else
   draws FIFO in receipt order.
3. **One rate per item per month.** Unlinked demand for a month is pooled, so
   every consuming department pays the same rate that month. Owner credits
   are split in proportion to the value each owner's layers contributed.
4. **A transfer moves a charge, it does not create one.** It is priced from
   the issue it references, so passing a cylinder between departments never
   revalues it.
5. **Own consumption is reported but never settled.** The diagonal of the
   matrix is a department using gas it bought itself.

Step 3 is an approximation, and the app says so on the backcharge page: where
a month spans owners, the total is exact but an individual owner-to-consumer
pair is pro-rata rather than transaction-exact.

`FIFO_MONTHLY` is the default. `WAC` and `STD` are also implemented; `STD`
reports the purchase price variance on the stock page.

## Release controls

A month is not releasable until all 14 pass. Two are genuine conservation
identities rather than restatements of the same number:

- **Cylinder count** — everything received is either full in the store, out
  with a department, empty on the rack, back at the supplier, or written off.
- **Layer reconciliation** — cylinders left in the store must equal the
  quantity left in the cost layers, so the valuation cannot drift away from
  the physical register. (Not applicable when charging on return, where gas
  is charged after it moves.)
- **Value reconciliation** — purchase value equals stock held plus gas charged
  out, before any recharge uplift.

The rest cover negative store balances, master data, references, period and
backdating rules, duplicates, FIFO shortfalls, settlement zero-sum, the
own-consumption diagonal, statement coverage, and configuration.

## Design notes

**The registers are append-only.** Corrections are entered as further rows;
nothing is overwritten. RLS enforces this — custodians get INSERT and SELECT
only, and there is deliberately no UPDATE or DELETE policy for them.

**Every derived figure is computed, never stored.** `src/lib/engine` is pure:
a `Ledger` goes in, a `Report` comes out. That is why the model is testable
against hand-worked figures, and why changing a setting immediately restates
every screen rather than needing a rebuild.

**The whole ledger is read at once.** The workbook is built for six
departments, 36 items and five years, so this is a small dataset. One read
plus an in-process FIFO walk is both simpler and faster than pushing the walk
into SQL, and it keeps the calculation in one place.

## Roles

| Role | Can |
| --- | --- |
| `viewer` | Read everything. |
| `custodian` | Also record purchases and movements, and record a posting. |
| `admin` | Also edit settings and master data, import, and set roles. |

The first account to sign up becomes the administrator. Everyone else starts
as a viewer.

## Running it

```bash
npm install
cp .env.example .env.local     # fill in your Supabase URL and publishable key
npm run dev
```

Against a fresh Supabase project:

```bash
supabase link --project-ref <your-ref>
supabase db push               # applies supabase/migrations
psql "$DATABASE_URL" -f supabase/seed.sql   # optional demonstration data
```

`supabase/seed.sql` carries the workbook's `DEMO-` codes. Replace them with
real ones, or skip it and import your own workbook from the Import screen.

```bash
npm test          # engine and Excel round-trip
npm run typecheck
npm run lint
npm run build
```

The engine tests check the model against figures worked by hand from the
workbook's demonstration data — the August blended rate, the reserved layer,
the transfer, the settlement, and the value reconciliation — so a change that
alters what a department is charged will fail a test rather than quietly
restate a month.

To run the Excel tests against a real workbook as well:

```bash
GAS_CONTROL_SOURCE_WORKBOOK=/path/to/Gas_Control.xlsx npm test
```

## Importing the original workbook

The Import screen reads `03_MASTERS`, `04_PURCHASES` and `05_MOVEMENTS`,
matching sheets by name and columns by heading, so a renamed copy still works.
Leave *Check the file without writing* ticked for a dry run first: it reports
what would be imported and lists every skipped row with the reason.

Master rows are matched on their code and updated in place. Purchases and
movements are append-only, so a transaction id already present is left exactly
as it is and re-importing the same file changes nothing.

Two things happen to the uploaded file before it is parsed, both of which only
remove what the importer never reads. Defined names are dropped, because the
workbook builds its dropdown ranges with `INDEX` and `COUNTIF` and the parser
throws on those. Sheets other than the masters and registers are emptied —
`ZZ_CALC` alone holds around 2.4 million formula cells, and parsing it takes
half a minute to learn nothing, since every derived figure is recomputed here
anyway. That takes a 24 MB workbook from about 60 seconds to about 12.

## Layout

```
src/lib/engine/     the model — pure, tested, no I/O
  layers.ts           received PO lines become cost layers
  valuation.ts        monthly FIFO, source-PO reservation
  charges.ts          charge lines, matrix, pairwise settlement
  stock.ts            physical position and conservation residuals
  checks.ts           row validation and the 14 release controls
  index.ts            buildReport: Ledger in, Report out
src/lib/excel/      import and export
src/lib/actions.ts  server actions, validated with zod
src/app/            one route per screen
supabase/migrations/
tests/
```
