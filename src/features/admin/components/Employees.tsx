import React from 'react';
import type { Employee } from '../admin.types';
import type { OutletListItem } from '@/features/super-admin/types';
import { Card, Badge, Tag, EmptyState } from '@/features/admin/components/ui';

interface Props {
  employees: Employee[];
  outlets: OutletListItem[];
  search: string;
  onSearch: (value: string) => void;
  onNew: () => void;
  onEdit: (employee: Employee) => void;
  onToggle: (employee: Employee) => void;
}

export default function Employees({ employees, outlets, search, onSearch, onNew, onEdit, onToggle }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '22px' }}>Employees</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px' }}>
            {employees.length} employees across {outlets.length} outlets · deactivating restricts their sign-in to this organization only
          </p>
        </div>
        <button className="btn btn-primary" onClick={onNew}>＋ Add employee</button>
      </div>

      <div className="card">
        {employees.length === 0 ? (
          <EmptyState
            isFiltered={Boolean(search)}
            firstUseTitle="No employees yet"
            firstUseDescription="Add your first employee to give them access to orders."
            filteredTitle="No matching records"
            filteredDescription="Try adjusting your filters or search terms to find what you are looking for."
          />
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Outlets</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map(employee => (
                <tr key={employee.id}>
                  <td>
                    <strong>{employee.name}</strong>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{employee.username}</div>
                  </td>
                  <td>
                    <span className="row" style={{ gap: '5px', flexWrap: 'wrap' }}>
                      {employee.outlets?.length ? employee.outlets.map(outlet => (
                        <Tag key={outlet.id} isDefault={outlet.id === employee.defaultOutletId}>
                          {outlet.name}
                        </Tag>
                      )) : <span style={{ color: 'var(--muted)', fontSize: '12px' }}>None</span>}
                    </span>
                  </td>
                  <td>
                    <Badge variant={employee.active ? 'on' : 'off'}>{employee.active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td>
                    <span className="row" style={{ gap: '6px', justifyContent: 'flex-end' }}>
                      <button className={employee.active ? "btn btn-danger" : "btn btn-primary"} onClick={() => onToggle(employee)}>
                        {employee.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                      <button className="btn btn-secondary" onClick={() => onEdit(employee)}>Manage ↗</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
