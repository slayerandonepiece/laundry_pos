import React from 'react';
import type { Employee } from '../admin.types';
import type { OutletListItem } from '@/features/super-admin/types';
import { Badge, Tag, EmptyState } from '@/features/admin/components/ui';

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
  const unassignedCount = employees.filter(e => e.active && (!e.outlets || e.outlets.length === 0)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '20px', margin: 0, fontWeight: 700 }}>Team members</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px' }}>
            {employees.length} {employees.length === 1 ? 'employee' : 'employees'}{unassignedCount > 0 ? ` (${unassignedCount} without outlet)` : ''} across {outlets.length} {outlets.length === 1 ? 'outlet' : 'outlets'}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onNew}>＋ Add employee</button>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <input
            type="search"
            className="search-input"
            aria-label="Search employees"
            placeholder="Search by name or username…"
            value={search}
            onChange={event => onSearch(event.target.value)}
            style={{ minWidth: '280px' }}
          />
        </div>

        {employees.length === 0 ? (
          <EmptyState
            isFiltered={Boolean(search)}
            firstUseTitle="No employees yet"
            firstUseDescription="Add your first employee to give them access to orders."
            filteredTitle="No matching records"
            filteredDescription="Try adjusting your filters or search terms to find what you are looking for."
          />
        ) : (
          <>
          <div className="employees-table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Outlets</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {employees.map(employee => {
                  const hasNoOutlets = !employee.outlets || employee.outlets.length === 0;
                  return (
                    <tr key={employee.id}>
                      <td>
                        <strong>{employee.name}</strong>
                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{employee.username}</div>
                      </td>
                      <td>
                        {employee.active && hasNoOutlets ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                            <Badge tone="warn">No outlet assigned</Badge>
                            <button
                              type="button"
                              className="ad-text-link"
                              style={{ fontSize: '11.5px', color: 'var(--brand)' }}
                              onClick={() => onEdit(employee)}
                            >
                              Assign outlet →
                            </button>
                          </div>
                        ) : (
                          <span className="row" style={{ gap: '5px', flexWrap: 'wrap' }}>
                            {employee.outlets?.length ? employee.outlets.map(outlet => (
                              <Tag key={outlet.id} isDefault={outlet.id === employee.defaultOutletId}>
                                {outlet.name}
                              </Tag>
                            )) : <span style={{ color: 'var(--muted)', fontSize: '12px' }}>None</span>}
                          </span>
                        )}
                      </td>
                      <td>
                        <Badge tone={employee.active ? 'on' : 'off'}>{employee.active ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="row" style={{ gap: '8px', justifyContent: 'flex-end' }}>
                          <button type="button" className="btn btn-secondary" onClick={() => onEdit(employee)}>Edit</button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ color: employee.active ? '#b91c1c' : 'var(--brand)', borderColor: employee.active ? '#fca5a5' : undefined }}
                            onClick={() => onToggle(employee)}
                          >
                            {employee.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="employees-cards">
            {employees.map(employee => {
              const hasNoOutlets = !employee.outlets || employee.outlets.length === 0;
              return (
                <article key={employee.id} className="employee-card">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong>{employee.name}</strong>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{employee.username}</div>
                    </div>
                    <Badge tone={employee.active ? 'on' : 'off'}>{employee.active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  {employee.active && hasNoOutlets ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                      <Badge tone="warn">No outlet assigned</Badge>
                      <button
                        type="button"
                        className="ad-text-link"
                        style={{ fontSize: '11.5px', color: 'var(--brand)' }}
                        onClick={() => onEdit(employee)}
                      >
                        Assign outlet →
                      </button>
                    </div>
                  ) : (
                    <span className="row" style={{ gap: '5px', flexWrap: 'wrap' }}>
                      {employee.outlets?.length ? employee.outlets.map(outlet => (
                        <Tag key={outlet.id} isDefault={outlet.id === employee.defaultOutletId}>
                          {outlet.name}
                        </Tag>
                      )) : <span style={{ color: 'var(--muted)', fontSize: '12px' }}>No outlets</span>}
                    </span>
                  )}
                  <div className="employee-card-actions" style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => onEdit(employee)}>Edit</button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ flex: 1, color: employee.active ? '#b91c1c' : 'var(--brand)', borderColor: employee.active ? '#fca5a5' : undefined }}
                      onClick={() => onToggle(employee)}
                    >
                      {employee.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
