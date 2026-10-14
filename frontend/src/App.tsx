import { useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import { resources, rowLabel, type Row, type Resource } from './resources';
const pageSize = 50;

function Records({ resource }: { resource: Resource }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [refs, setRefs] = useState<Record<string, Row[]>>({});
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    api<{data: Row[]}>(resource.path + '?limit=' + pageSize + '&offset=' + offset + '&q=' + encodeURIComponent(search))
      .then(data => { if (!cancelled) setRows(data.data); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [resource.path, search, offset, revision]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const paths = [...new Set(resource.fields.flatMap(f => f.ref ? [f.ref] : []))];
      const entries = await Promise.all(paths.map(async path => {
        const all: Row[] = [];
        for (let start = 0; ; start += 200) {
          const page = await api<{data: Row[]}>(path + '?limit=200&offset=' + start);
          all.push(...page.data);
          if (page.data.length < 200) break;
        }
        return [path, all] as const;
      }));
      if (!cancelled) setRefs(Object.fromEntries(entries));
    }
    load().catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [resource]);
  function edit(row: Row | null) {
    setEditing(row);
    setValues(Object.fromEntries(resource.fields.map(f => [f.name,
      f.type === 'checkbox' ? Boolean(row?.[f.name] ?? true) : String(row?.[f.name] ?? '')
    ])));
    setOpen(true); setError(''); setNotice('');
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const data = Object.fromEntries(resource.fields.map(f => {
        const value = values[f.name];
        return [f.name, f.type === 'checkbox' ? value :
          value === '' && !f.required ? null : f.type === 'number' ? Number(value) : value];
      }));
      await api(resource.path + (editing ? '/' + editing.id : ''), {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(editing ? { ...data, version: editing.version } : data)
      });
      setOpen(false); setNotice('Record saved.'); setRevision(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  }
  async function remove(row: Row) {
    if (!window.confirm('Delete ' + rowLabel(row) + '? This permanently removes the record.')) return;
    setSaving(true); setError('');
    try {
      await api(resource.path + '/' + row.id, { method:'DELETE', body:JSON.stringify({ version:row.version }) });
      setNotice('Record deleted.'); setRevision(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'Delete failed'); }
    finally { setSaving(false); }
  }
  return <section>
    <div className="heading"><div><p className="eyebrow">AGENCY RECORDS</p><h1>{resource.label}</h1></div><button onClick={() => edit(null)}>Add record</button></div>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status" className="notice">{notice}</p>}
    {open ? <form onSubmit={save} className="card">
      <h2>{editing ? 'Edit record #' + editing.id : 'New ' + resource.label.toLowerCase() + ' record'}</h2>
      <div className="fields">{resource.fields.map(f => <label key={f.name}>{f.label}
        {f.ref ? <select required={f.required} value={String(values[f.name] ?? '')}
          onChange={e => setValues(v => ({ ...v,[f.name]:e.target.value }))}>
          <option value="">Select…</option>{(refs[f.ref] || []).map(r => <option key={r.id} value={r.id}>{rowLabel(r)} (#{r.id})</option>)}
        </select> : f.type === 'textarea' ? <textarea value={String(values[f.name] ?? '')}
          onChange={e => setValues(v => ({ ...v,[f.name]:e.target.value }))} /> :
        f.type === 'checkbox' ? <input type="checkbox" checked={Boolean(values[f.name])}
          onChange={e => setValues(v => ({ ...v,[f.name]:e.target.checked }))} /> :
        <input required={f.required} type={f.type === 'decimal' ? 'text' : f.type || 'text'}
          inputMode={f.type === 'decimal' ? 'decimal' : undefined}
          value={String(values[f.name] ?? '')}
          onChange={e => setValues(v => ({ ...v,[f.name]:e.target.value }))} />}
      </label>)}</div>
      <div className="actions"><button disabled={saving}>{saving ? 'Saving…' : 'Save'}</button><button type="button" className="secondary" disabled={saving} onClick={() => setOpen(false)}>Cancel</button></div>
    </form> : <>
      <form className="search" onSubmit={e => { e.preventDefault(); setOffset(0); setSearch(query); }}>
        <input aria-label="Search records" placeholder="Search records" value={query} onChange={e => setQuery(e.target.value)} />
        <button className="secondary">Search</button>
      </form>
      <div className="card table-wrap"><table><thead><tr><th>ID</th>{resource.columns.map(c => <th key={c}>{c.replaceAll('_',' ')}</th>)}<th>Actions</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}><td>#{row.id}</td>{resource.columns.map(c => <td key={c}>{String(row[c] ?? '—')}</td>)}
        <td className="row-actions"><button className="secondary" disabled={saving} onClick={() => edit(row)}>Edit</button><button className="danger" disabled={saving} onClick={() => remove(row)}>Delete</button></td></tr>)}</tbody></table>
        {loading ? <p>Loading records…</p> : rows.length === 0 && <p>No records found. Add a record to get started.</p>}
      </div>
      <div className="actions"><button className="secondary" disabled={offset === 0 || loading} onClick={() => setOffset(n => Math.max(0,n-pageSize))}>Previous</button>
        <span>Page {offset / pageSize + 1}</span><button className="secondary" disabled={rows.length < pageSize || loading} onClick={() => setOffset(n => n+pageSize)}>Next</button></div>
    </>}
  </section>;
}
type Sales = { month: string; employee: string; policy_type: string; policy_count: number; total_premium: string };
function Reports() {
  const [year,setYear] = useState(new Date().getFullYear());
  const [employee,setEmployee] = useState('');
  const [employees,setEmployees] = useState<Row[]>([]);
  const [rows,setRows] = useState<Sales[]>([]);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api<{data: Row[]}>('employees?limit=200').then(r => { if (!cancelled) setEmployees(r.data); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);
  async function load(e: FormEvent) {
    e.preventDefault();setLoading(true);setError('');
    try { const r = await api<{data: Sales[]}>('reports/sales?year=' + year + (employee ? '&employee_id=' + employee : ''));setRows(r.data); }
    catch(e) { setError(e instanceof Error ? e.message : 'Report failed'); }
    finally { setLoading(false); }
  }
  return <section><p className="eyebrow">AGENCY PERFORMANCE</p><h1>Sales reports</h1>
    <p>Policies written by month, employee, and policy type. Premium totals are nominal policy premiums, not collected revenue.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <form onSubmit={load} className="search"><label>Year<input type="number" min="1900" max="9998" required value={year} onChange={e=>setYear(Number(e.target.value))}/></label>
      <label>Employee<select value={employee} onChange={e=>setEmployee(e.target.value)}><option value="">All employees</option>{employees.map(r=><option key={r.id} value={r.id}>{rowLabel(r)}</option>)}</select></label>
      <button disabled={loading}>{loading ? 'Loading…' : 'View report'}</button></form>
    <div className="card table-wrap"><table><thead><tr><th>Month</th><th>Employee</th><th>Policy type</th><th>Policies</th><th>Total premium</th></tr></thead><tbody>
      {rows.map((r,i)=><tr key={i}><td>{r.month}</td><td>{r.employee}</td><td>{r.policy_type}</td><td>{r.policy_count}</td><td>{r.total_premium}</td></tr>)}
    </tbody></table>{!rows.length && <p>No report rows. Select filters and view the report.</p>}</div>
  </section>;
}
export default function App() {
  const [page,setPage] = useState('customers');
  const resource = resources.find(r=>r.path===page);
  return <div className="layout"><aside><div className="brand">SIXS<span>Senior Health Care Solutions</span></div>
    <nav aria-label="Main navigation">{resources.map(r=><button key={r.path} className={page===r.path?'selected':''} onClick={()=>setPage(r.path)}>{r.label}</button>)}
      <button className={page==='reports'?'selected':''} onClick={()=>setPage('reports')}>Sales reports</button></nav>
    <p className="local">Local development</p>
  </aside><main>{resource ? <Records key={resource.path} resource={resource}/> : <Reports/>}</main></div>;
}
