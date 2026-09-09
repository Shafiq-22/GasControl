-- Demo data lifted from the source workbook (00_README / 03_MASTERS / registers).
-- Safe to re-run; replace the DEMO- codes with real ones before going live.

insert into settings (id, company_name, store_name, custodian, report_month, history_start,
                      purchasing_department, posting_account)
values (true, 'CONFIGURE COMPANY', 'SHARED GAS STORE', 'CONFIGURE CUSTODIAN',
        date '2026-09-01', date '2026-07-01', 'BAF', 'CONFIGURE ACCOUNT')
on conflict (id) do nothing;

insert into departments (code, full_name, cost_centre, contact, sort_order) values
  ('BAF', 'Fabrication',    'CC-BAF', 'Custodian',        1),
  ('WOR', 'Workshop',       'CC-WOR', 'Workshop contact', 2),
  ('BAA', 'Department BAA', 'CC-BAA', 'BAA contact',      3)
on conflict (code) do nothing;

insert into gas_items (item_code, description, gas_type, unit, standard_rate,
                       reorder_point, minimum_stock, max_dept_holding, sort_order) values
  ('DEMO-O2',  'Oxygen refill',         'Oxygen',        'cyl', 250, 2, 1, 25, 1),
  ('DEMO-AC',  'Acetylene refill',      'Acetylene',     'cyl', 250, 2, 1, 25, 2),
  ('DEMO-AR',  'Argon refill',          'Argon',         'cyl', 250, 2, 1, 25, 3),
  ('DEMO-CO2', 'Carbon dioxide refill', 'CO2',           'cyl', 250, 2, 1, 25, 4),
  ('DEMO-MIX', 'Argon / CO2 refill',    'Argon/CO2 mix', 'cyl', 250, 2, 1, 25, 5),
  ('DEMO-N2',  'Nitrogen refill',       'Nitrogen',      'cyl', 250, 2, 1, 25, 6)
on conflict (item_code) do nothing;

insert into suppliers (vendor_no, name, contact) values
  ('DEMO-V1', 'Demonstration supplier', 'CONFIGURE')
on conflict (vendor_no) do nothing;

insert into cost_codes (code, description, owning_department) values
  ('DEMO-BAF', 'BAF demonstration job', 'BAF'),
  ('DEMO-WOR', 'WOR demonstration job', 'WOR'),
  ('DEMO-BAA', 'BAA demonstration job', 'BAA')
on conflict (code) do nothing;

insert into personnel (employee_no, name, department) values
  ('DEMO-E1', 'BAF Receiver', 'BAF'),
  ('DEMO-E2', 'WOR Receiver', 'WOR'),
  ('DEMO-E3', 'BAA Receiver', 'BAA')
on conflict (employee_no) do nothing;

insert into purchases (transaction_id, po_date, po_no, po_line, vendor_no, purchasing_department,
                       item_code, qty_ordered, unit_refill_rate, qty_received, receipt_date,
                       received_by, remarks, entered_by, entry_date) values
  ('P-000001','2026-07-01','DEMO-PO1',1,'DEMO-V1','BAF','DEMO-O2', 10,250,10,'2026-07-01','BAF Receiver','DEMONSTRATION ONLY','BAF Receiver','2026-07-01'),
  ('P-000002','2026-08-01','DEMO-PO2',1,'DEMO-V1','BAA','DEMO-O2', 10,280,10,'2026-08-01','BAA Receiver','DEMONSTRATION ONLY','BAF Receiver','2026-08-01'),
  ('P-000003','2026-09-01','DEMO-PO3',1,'DEMO-V1','BAF','DEMO-O2', 10,300,10,'2026-09-01','BAF Receiver','DEMONSTRATION ONLY','BAF Receiver','2026-09-01'),
  ('P-000004','2026-09-01','DEMO-PO4',1,'DEMO-V1','BAF','DEMO-AC', 10,250,10,'2026-09-01','BAF Receiver','DEMONSTRATION ONLY','BAF Receiver','2026-09-01'),
  ('P-000005','2026-09-01','DEMO-PO5',1,'DEMO-V1','BAF','DEMO-AR', 20,250,20,'2026-09-01','BAF Receiver','DEMONSTRATION ONLY','BAF Receiver','2026-09-01'),
  ('P-000006','2026-09-01','DEMO-PO6',1,'DEMO-V1','BAA','DEMO-AR', 10,280,10,'2026-09-01','BAA Receiver','DEMONSTRATION ONLY','BAF Receiver','2026-09-01'),
  ('P-000007','2026-09-01','DEMO-PO7',1,'DEMO-V1','BAF','DEMO-CO2',10,250,10,'2026-09-01','BAF Receiver','DEMONSTRATION ONLY','BAF Receiver','2026-09-01'),
  ('P-000008','2026-09-01','DEMO-PO8',1,'DEMO-V1','BAF','DEMO-MIX',10,250,10,'2026-09-01','BAF Receiver','DEMONSTRATION ONLY','BAF Receiver','2026-09-01'),
  ('P-000009','2026-09-01','DEMO-PO9',1,'DEMO-V1','BAF','DEMO-N2', 10,250,10,'2026-09-01','BAF Receiver','DEMONSTRATION ONLY','BAF Receiver','2026-09-01')
on conflict (transaction_id) do nothing;

insert into movements (transaction_id, moved_on, kind, item_code, quantity, from_code, to_code,
                       receiver_name, cost_code, source_po_line, residual_pct, reason,
                       original_transaction_id, remarks, entry_timestamp, entered_by) values
  ('M-000001','2026-07-02','ISSUE',        'DEMO-O2',  5,'STORE','WOR','WOR Receiver','DEMO-WOR',null,null,null,null,'DEMONSTRATION ONLY','2026-07-02','BAF Receiver'),
  ('M-000002','2026-07-04','RETURN_EMPTY', 'DEMO-O2',  3,'WOR','STORE','WOR Receiver','DEMO-WOR',null,0,null,'M-000001','DEMONSTRATION ONLY','2026-07-04','BAF Receiver'),
  ('M-000003','2026-07-05','TO_SUPPLIER',  'DEMO-O2',  2,'STORE','SUPPLIER',null,null,null,null,null,null,'DEMONSTRATION ONLY','2026-07-05','BAF Receiver'),
  ('M-000004','2026-08-02','ISSUE',        'DEMO-O2', 10,'STORE','WOR','WOR Receiver','DEMO-WOR',null,null,null,null,'DEMONSTRATION ONLY','2026-08-02','BAF Receiver'),
  ('M-000005','2026-09-02','ISSUE',        'DEMO-O2',  4,'STORE','BAF','BAF Receiver','DEMO-BAF',null,null,null,null,'DEMONSTRATION ONLY','2026-09-02','BAF Receiver'),
  ('M-000006','2026-09-03','TRANSFER',     'DEMO-O2',  2,'BAF','WOR','WOR Receiver','DEMO-WOR',null,null,null,'M-000005','DEMONSTRATION ONLY','2026-09-03','BAF Receiver'),
  ('M-000007','2026-09-03','ISSUE',        'DEMO-O2',  2,'STORE','BAA','BAA Receiver','DEMO-BAA','DEMO-PO3/1',null,null,null,'DEMONSTRATION ONLY','2026-09-03','BAF Receiver'),
  ('M-000008','2026-09-04','ADJUSTMENT',   'DEMO-O2',  1,'WOR','LOSS','WOR Receiver','DEMO-WOR',null,null,'Lost cylinder shell; gas already charged','M-000004','DEMONSTRATION ONLY','2026-09-04','BAF Receiver'),
  ('M-000009','2026-09-02','ISSUE',        'DEMO-AC',  5,'STORE','WOR','WOR Receiver','DEMO-WOR',null,null,null,null,'DEMONSTRATION ONLY','2026-09-02','BAF Receiver'),
  ('M-000010','2026-09-02','ISSUE',        'DEMO-AC',  3,'STORE','BAA','BAA Receiver','DEMO-BAA',null,null,null,null,'DEMONSTRATION ONLY','2026-09-02','BAF Receiver'),
  ('M-000011','2026-09-02','ISSUE',        'DEMO-AC',  2,'STORE','BAF','BAF Receiver','DEMO-BAF',null,null,null,null,'DEMONSTRATION ONLY','2026-09-02','BAF Receiver'),
  ('M-000012','2026-09-02','ISSUE',        'DEMO-CO2',10,'STORE','WOR','WOR Receiver','DEMO-WOR',null,null,null,null,'DEMONSTRATION ONLY','2026-09-02','BAF Receiver'),
  ('M-000013','2026-09-04','RETURN_EMPTY', 'DEMO-CO2', 6,'WOR','STORE','WOR Receiver','DEMO-WOR',null,0,null,'M-000012','DEMONSTRATION ONLY','2026-09-04','BAF Receiver'),
  ('M-000014','2026-09-05','TO_SUPPLIER',  'DEMO-CO2', 4,'STORE','SUPPLIER',null,null,null,null,null,null,'DEMONSTRATION ONLY','2026-09-05','BAF Receiver'),
  ('M-000015','2026-09-02','ISSUE',        'DEMO-MIX', 3,'STORE','WOR','WOR Receiver','DEMO-WOR','DEMO-PO8/1',null,null,null,'DEMONSTRATION ONLY','2026-09-02','BAF Receiver'),
  ('M-000016','2026-09-03','RETURN_UNUSED','DEMO-MIX', 1,'WOR','STORE','WOR Receiver','DEMO-WOR','DEMO-PO8/1',null,null,'M-000015','DEMONSTRATION ONLY','2026-09-03','BAF Receiver'),
  ('M-000017','2026-09-03','ISSUE',        'DEMO-N2',  2,'STORE','BAF','BAF Receiver','DEMO-BAF',null,null,null,null,'DEMONSTRATION ONLY','2026-09-03','BAF Receiver')
on conflict (transaction_id) do nothing;

-- Keep the generators ahead of the seeded ids.
select setval('purchase_seq', (select coalesce(max(substring(transaction_id from 3)::int), 0) from purchases));
select setval('movement_seq', (select coalesce(max(substring(transaction_id from 3)::int), 0) from movements));
