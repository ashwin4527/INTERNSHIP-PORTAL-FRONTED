import { useEffect, useState, useCallback } from 'react';
import { api, setToken, getToken } from './api.js';

const EMPTY = { title: '', company: '', location: '', remote: false, skills: '', eligibility: '', deadline: '', applyInfo: '' };
const BLANK_FILTERS = { q: '', location: '', remote: '', eligibility: '' };
const isLink = s => /^https?:\/\//i.test(s);
const fmt = d => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(!!getToken());
  const [view, setView] = useState('dashboard');
  const [msg, setMsg] = useState(null);
  const notify = (type, text) => setMsg({ type, text });

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me').then(d => setUser(d.user)).catch(() => setToken(null)).finally(() => setBooting(false));
  }, []);

  const onAuth = d => { setToken(d.token); setUser(d.user); setView('dashboard'); notify('ok', d.message); };
  const logout = () => { setToken(null); setUser(null); notify('ok', 'You have been logged out.'); };

  if (booting) return <p className="center">Loading…</p>;
  return (
    <>
      <header className="top">
        <h1>Internship Portal</h1>
        {user && (
          <nav>
            <button className={view === 'dashboard' ? 'on' : ''} onClick={() => setView('dashboard')}>Internships</button>
            <button className={view === 'profile' ? 'on' : ''} onClick={() => setView('profile')}>Profile</button>
            <button onClick={logout}>Log out</button>
          </nav>
        )}
      </header>
      <main>
        {msg && <div className={'banner ' + msg.type} role="status" onClick={() => setMsg(null)}>{msg.text}<span> ✕</span></div>}
        {!user ? <Auth onAuth={onAuth} notify={notify} />
          : view === 'profile' ? <Profile />
          : <Dashboard user={user} notify={notify} onExpired={logout} />}
      </main>
    </>
  );
}

function Auth({ onAuth, notify }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setBusy(true);
    try {
      // Only name/email/password are sent. The server decides the role.
      const body = mode === 'login' ? { email: f.email, password: f.password } : f;
      onAuth(await api(`/auth/${mode}`, { method: 'POST', body }));
    } catch (err) { notify('err', err.message); }
    setBusy(false);
  };
  return (
    <form className="card auth" onSubmit={submit}>
      <h2>{mode === 'login' ? 'Log in' : 'Create a student account'}</h2>
      {mode === 'register' && <label>Full name<input required value={f.name} onChange={set('name')} /></label>}
      <label>Email<input type="email" required value={f.email} onChange={set('email')} /></label>
      <label>Password<input type="password" required minLength={mode === 'register' ? 8 : 1} value={f.password} onChange={set('password')} /></label>
      <button className="primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Register'}</button>
      <p className="muted">
        {mode === 'login' ? 'New here?' : 'Already registered?'}{' '}
        <a href="#" onClick={e => { e.preventDefault(); setMode(mode === 'login' ? 'register' : 'login'); }}>
          {mode === 'login' ? 'Create an account' : 'Log in'}
        </a>
      </p>
    </form>
  );
}

function Profile() {
  const [me, setMe] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/auth/me').then(d => setMe(d.user)).catch(e => setErr(e.message)); }, []);
  if (err) return <div className="banner err">{err}</div>;
  if (!me) return <p className="center">Loading…</p>;
  return (
    <section className="card">
      <h2>Your profile</h2>
      <dl><dt>Name</dt><dd>{me.name}</dd><dt>Email</dt><dd>{me.email}</dd><dt>Role</dt><dd>{me.role}</dd></dl>
    </section>
  );
}

function Dashboard({ user, notify, onExpired }) {
  const [filters, setFilters] = useState(BLANK_FILTERS);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | internship
  const isAdmin = user.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    try { setItems((await api('/internships' + (qs ? '?' + qs : ''))).internships); }
    catch (e) { if (e.status === 401) return onExpired(); setError(e.message); setItems([]); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const remove = async it => {
    if (!confirm(`Delete "${it.title}" at ${it.company}?`)) return;
    try { const d = await api('/internships/' + it._id, { method: 'DELETE' }); notify('ok', d.message); load(); }
    catch (e) { notify('err', e.message); }
  };
  const setF = k => e => setFilters({ ...filters, [k]: e.target.value });

  return (
    <>
      <section className="filters card">
        <input placeholder="Search title, company or skill" value={filters.q} onChange={setF('q')} />
        <input placeholder="Location" value={filters.location} onChange={setF('location')} />
        <input placeholder="Eligibility (e.g. B.Tech)" value={filters.eligibility} onChange={setF('eligibility')} />
        <select value={filters.remote} onChange={setF('remote')}>
          <option value="">Remote or on-site</option><option value="true">Remote only</option><option value="false">On-site only</option>
        </select>
        <button onClick={() => setFilters(BLANK_FILTERS)}>Clear</button>
        {isAdmin && <button className="primary" onClick={() => setEditing('new')}>+ New listing</button>}
      </section>

      {editing && <Editor item={editing === 'new' ? null : editing} notify={notify}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}

      {loading ? <p className="center">Loading internships…</p>
        : error ? <div className="banner err">{error} <button onClick={load}>Retry</button></div>
        : items.length === 0 ? <p className="center muted">No internships match your search. Try fewer keywords or clear the filters.</p>
        : <div className="grid">{items.map(it => (
            <article className="card item" key={it._id}>
              <h3>{it.title}</h3>
              <p className="company">{it.company} · {it.remote ? 'Remote' : it.location || 'Location not listed'}</p>
              <p className="tags">{it.skills.map(s => <span key={s}>{s}</span>)}</p>
              {it.eligibility && <p><b>Eligibility:</b> {it.eligibility}</p>}
              <p><b>Deadline:</b> {fmt(it.deadline)}</p>
              <p><b>How to apply:</b> {isLink(it.applyInfo) ? <a href={it.applyInfo} target="_blank" rel="noreferrer">Open application</a> : it.applyInfo}</p>
              {isAdmin && <div className="row"><button onClick={() => setEditing(it)}>Edit</button><button className="danger" onClick={() => remove(it)}>Delete</button></div>}
            </article>))}</div>}
    </>
  );
}

function Editor({ item, onClose, onSaved, notify }) {
  const [f, setF] = useState(item ? { ...item, skills: item.skills.join(', '), deadline: item.deadline.slice(0, 10) } : EMPTY);
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async e => {
    e.preventDefault();
    const { title, company, location, remote, skills, eligibility, deadline, applyInfo } = f;
    try {
      const d = await api(item ? '/internships/' + item._id : '/internships', {
        method: item ? 'PUT' : 'POST', body: { title, company, location, remote, skills, eligibility, deadline, applyInfo } });
      notify('ok', d.message); onSaved();
    } catch (err) { notify('err', err.message); }
  };
  return (
    <form className="card editor" onSubmit={save}>
      <h2>{item ? 'Edit listing' : 'New listing'}</h2>
      <label>Title<input required value={f.title} onChange={set('title')} /></label>
      <label>Company<input required value={f.company} onChange={set('company')} /></label>
      <label>Location<input value={f.location} onChange={set('location')} /></label>
      <label className="check"><input type="checkbox" checked={f.remote} onChange={set('remote')} /> Remote</label>
      <label>Skills (comma separated)<input value={f.skills} onChange={set('skills')} /></label>
      <label>Eligibility<input value={f.eligibility} onChange={set('eligibility')} /></label>
      <label>Application deadline<input type="date" required value={f.deadline} onChange={set('deadline')} /></label>
      <label>Application link or instructions<input required value={f.applyInfo} onChange={set('applyInfo')} /></label>
      <div className="row"><button className="primary">{item ? 'Save changes' : 'Create listing'}</button><button type="button" onClick={onClose}>Cancel</button></div>
    </form>
  );
}
