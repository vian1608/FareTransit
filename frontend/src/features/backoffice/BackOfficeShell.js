import React, { useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useBackOfficeAuth } from './BackOfficeAuthContext';
import './BackOfficeShell.css';

function Icon({ type }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    bookings: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><path d="M8 2v4M16 2v4M4 9h16M8 13h3M13 13h3M8 17h3"/></>,
    customers: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
    payments: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.7 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1a1.7 1.7 0 0 0 1.1 1.6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.14.36.36.7.6 1 .28.33.67.52 1.1.53h.1v4h-.1a1.7 1.7 0 0 0-1.7.47Z"/></>
  };
  return <svg className="backoffice-nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: 'dashboard', permissions: ['dashboard.view'] },
  { label: 'Bookings', href: '/admin/bookings', icon: 'bookings', permissions: ['bookings.flights.view','bookings.hotels.view','bookings.cars.view'] },
  { label: 'Customers', href: '/admin/customers', icon: 'customers', permissions: ['crm.customers.view'] },
  { label: 'Payments', href: '/admin/payments', icon: 'payments', permissions: ['payments.view','authorization.view'] },
  { label: 'Settings', href: '/admin/settings', icon: 'settings', permissions: ['admin.settings','team.view','admin.integrations'] }
];

export default function BackOfficeShell({ children }) {
  const { profile, hasPermission, logout } = useBackOfficeAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [search, setSearch] = useState('');
  const visibleItems = useMemo(() => navItems.filter(item => item.permissions.some(hasPermission)), [hasPermission]);
  const displayName = profile?.name || profile?.roleName || profile?.role || profile?.email || 'Admin';
  const secondary = profile?.roleName || profile?.role || profile?.email || 'FareTransit';
  const initials = String(displayName).split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'FT';

  const submitSearch = event => {
    event.preventDefault();
    const q = search.trim();
    navigate(q ? `/admin/bookings?q=${encodeURIComponent(q)}` : '/admin/bookings');
    setOpen(false);
  };

  return <div className="backoffice-shell">
    {open && <button className="backoffice-overlay" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside className={`backoffice-sidebar ${open ? 'is-open' : ''}`}>
      <NavLink to="/admin" end className="backoffice-brand" onClick={() => setOpen(false)} aria-label="FareTransit Admin Home">
        <span className="backoffice-brand-mark">FT</span>
        <span className="backoffice-brand-copy"><strong>FareTransit</strong><small>Admin</small></span>
      </NavLink>
      <nav aria-label="Admin navigation">
        {visibleItems.map(item => <NavLink key={item.href} to={item.href} end={item.href === '/admin'} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}><Icon type={item.icon} /><span>{item.label}</span></NavLink>)}
      </nav>
      <div className="backoffice-sidebar-foot">
        <div className="backoffice-mini-avatar">{initials}</div>
        <div><strong>{displayName}</strong><span>{secondary}</span></div>
      </div>
    </aside>

    <section className="backoffice-main">
      <header className="backoffice-topbar">
        <button className="backoffice-menu" type="button" onClick={() => setOpen(value => !value)} aria-label="Toggle admin navigation"><span></span><span></span><span></span></button>
        <form className="backoffice-global-search" onSubmit={submitSearch}><span aria-hidden="true">⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search bookings, customers, references…" aria-label="Search admin" /></form>
        <button className="backoffice-create" type="button" onClick={() => navigate('/admin/bookings/new')}>+ New Booking</button>
        <div className="backoffice-account">
          <button className="backoffice-account-button" type="button" onClick={() => setAccountOpen(value => !value)} aria-expanded={accountOpen} aria-label="Open account menu"><span>{initials}</span><b>{displayName}</b><i>⌄</i></button>
          {accountOpen && <div className="backoffice-account-menu">
            <div className="backoffice-account-meta"><strong>{displayName}</strong><span>{secondary}</span></div>
            <a href="/" target="_blank" rel="noreferrer">View Website <span>↗</span></a>
            <button type="button" onClick={() => { setAccountOpen(false); navigate('/admin/settings'); }}>Settings</button>
            <button type="button" className="danger" onClick={logout}>Logout</button>
          </div>}
        </div>
      </header>
      <div className="backoffice-content">{children}</div>
    </section>
  </div>;
}
