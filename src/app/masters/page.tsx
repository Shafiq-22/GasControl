import { getLedger, getProfile, isAdmin } from '@/lib/data';
import { Badge, Card, DownloadLink, Notice, PageHeader } from '@/components/ui';
import { MasterEditor } from './editor';

export const dynamic = 'force-dynamic';

export default async function MastersPage() {
  const [ledger, profile] = await Promise.all([getLedger(), getProfile()]);
  const admin = isAdmin(profile);
  const departmentCodes = ledger.departments.map((d) => d.code);

  return (
    <>
      <PageHeader
        title="Masters"
        subtitle="Departments, gas items, suppliers, cost codes and personnel. The item code is the key everything else hangs off."
        actions={<DownloadLink href="/api/export/masters">Export</DownloadLink>}
      />

      {!admin && (
        <div className="mb-4">
          <Notice>Master data is administrator-only. You can view it here.</Notice>
        </div>
      )}

      <div className="grid gap-4">
        <MasterEditor
          table="departments"
          title="Departments"
          description="Each department is a party to the backcharge. The cost centre is what reaches the accounting system."
          editable={admin}
          rows={ledger.departments}
          keyField="code"
          columns={[
            { name: 'code', label: 'Code', required: true, width: 'w-28' },
            { name: 'full_name', label: 'Full name', required: true },
            { name: 'cost_centre', label: 'Cost centre', required: true, width: 'w-40' },
            { name: 'contact', label: 'Contact' },
            { name: 'sort_order', label: 'Order', type: 'number', width: 'w-20' },
          ]}
        />

        <MasterEditor
          table="gas_items"
          title="Gas items"
          description="Rates are per cylinder. The reorder point and minimum drive the stock alerts."
          editable={admin}
          rows={ledger.items}
          keyField="item_code"
          columns={[
            { name: 'item_code', label: 'Item code', required: true, width: 'w-32' },
            { name: 'description', label: 'Description', required: true },
            { name: 'gas_type', label: 'Gas type', width: 'w-32' },
            { name: 'cylinder_size', label: 'Size', width: 'w-24' },
            { name: 'unit', label: 'Unit', width: 'w-20' },
            { name: 'standard_rate', label: 'Standard rate', type: 'number', step: '0.0001', width: 'w-28' },
            { name: 'reorder_point', label: 'Reorder at', type: 'number', step: '0.01', width: 'w-24' },
            { name: 'minimum_stock', label: 'Minimum', type: 'number', step: '0.01', width: 'w-24' },
            { name: 'max_dept_holding', label: 'Max held', type: 'number', step: '0.01', width: 'w-24' },
            { name: 'hazard_class', label: 'Hazard', width: 'w-24' },
            { name: 'sort_order', label: 'Order', type: 'number', width: 'w-20' },
          ]}
        />

        <MasterEditor
          table="suppliers"
          title="Suppliers"
          editable={admin}
          rows={ledger.suppliers}
          keyField="vendor_no"
          columns={[
            { name: 'vendor_no', label: 'Vendor no.', required: true, width: 'w-32' },
            { name: 'name', label: 'Name', required: true },
            { name: 'contact', label: 'Contact' },
          ]}
        />

        <MasterEditor
          table="cost_codes"
          title="Cost codes"
          description="A cost code belongs to one department, and only that department can be issued against it."
          editable={admin}
          rows={ledger.costCodes}
          keyField="code"
          columns={[
            { name: 'code', label: 'Code', required: true, width: 'w-36' },
            { name: 'description', label: 'Description', required: true },
            { name: 'owning_department', label: 'Owning department', required: true, options: departmentCodes, width: 'w-44' },
          ]}
        />

        <MasterEditor
          table="personnel"
          title="Personnel"
          description="Anyone who can receive a cylinder on a department's behalf."
          editable={admin}
          rows={ledger.personnel}
          keyField="employee_no"
          columns={[
            { name: 'employee_no', label: 'Employee no.', required: true, width: 'w-36' },
            { name: 'name', label: 'Name', required: true },
            { name: 'department', label: 'Department', required: true, options: departmentCodes, width: 'w-44' },
          ]}
        />
      </div>

      <Card className="mt-4" title="Counts">
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            ['Departments', ledger.departments],
            ['Gas items', ledger.items],
            ['Suppliers', ledger.suppliers],
            ['Cost codes', ledger.costCodes],
            ['Personnel', ledger.personnel],
          ].map(([label, rows]) => {
            const list = rows as { active: boolean }[];
            return (
              <span key={label as string} className="inline-flex items-center gap-1.5">
                <Badge tone="neutral">{label as string}</Badge>
                {list.filter((r) => r.active).length} active
                <span style={{ color: 'var(--text-soft)' }}>of {list.length}</span>
              </span>
            );
          })}
        </div>
      </Card>
    </>
  );
}
