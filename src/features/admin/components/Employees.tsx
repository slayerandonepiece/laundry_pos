import type { Employee } from '../admin.types';
import { Badge, Button, Empty } from './Primitives';

interface Props { employees: Employee[]; search: string; onSearch: (value: string) => void; onNew: () => void; onEdit: (employee: Employee) => void; onToggle: (employee: Employee) => void }
export default function Employees({ employees, search, onSearch, onNew, onEdit, onToggle }: Props) {
  return <section className="ad-card ad-table-card">
    <div className="ad-card-heading"><div><h2>Team members <span className="ad-count">{employees.length}</span></h2><p>Employees can use Sales and manage Orders.</p></div><Button onClick={onNew}>＋ Add employee</Button></div>
    <div className="ad-toolbar"><input aria-label="Search employees" value={search} onChange={event => onSearch(event.target.value)} placeholder="Search name or username…"/></div>
    {!employees.length ? <Empty text={search ? 'No employees match this search.' : 'Add your first employee to give them access to orders.'}/> : <>
      <div className="ad-table-wrap ad-desktop-table" tabIndex={0} role="region" aria-label="Employees table"><table className="ad-table ad-employees-table"><thead><tr><th>ID</th><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{employees.map(employee => <tr key={employee.id}><td><span title={employee.id}>{employee.id.slice(0, 8)}</span></td><td><strong>{employee.name}</strong></td><td>{employee.username}</td><td>Employee</td><td><Badge>{employee.active ? 'Active' : 'Inactive'}</Badge></td><td><div className="ad-employee-actions"><button className="ad-order-link" onClick={() => onEdit(employee)}>Edit</button><button className="ad-order-link" onClick={() => onToggle(employee)}>{employee.active ? 'Deactivate' : 'Activate'}</button></div></td></tr>)}</tbody></table></div>
      <div className="ad-mobile-records">{employees.map(employee => <article className="ad-mobile-expense" key={employee.id}><div className="ad-record-heading"><h3>{employee.name}</h3><Badge>{employee.active ? 'Active' : 'Inactive'}</Badge></div><p>{employee.username} · Employee</p><div className="ad-employee-actions"><Button secondary onClick={() => onEdit(employee)}>Edit</Button><Button secondary onClick={() => onToggle(employee)}>{employee.active ? 'Deactivate' : 'Activate'}</Button></div></article>)}</div>
    </>}
    <p className="ad-help">Employee logins work only with this browser&apos;s prototype data. Deactivated employees cannot sign in.</p>
  </section>;
}
