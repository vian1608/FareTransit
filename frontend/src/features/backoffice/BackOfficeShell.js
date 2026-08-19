import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useBackOfficeAuth } from './BackOfficeAuthContext';
import './BackOfficeShell.css';

const items = [
  ['Dashboard','/admin/backoffice','dashboard.view'],
  ['Leads','/admin/crm/leads','crm.leads.view'],
  ['Customers','/admin/crm/customers','crm.customers.view'],
  ['Tasks','/admin/crm/tasks','crm.tasks.view'],
  ['Trips','/admin/trips','trips.view'],
  ['Flights','/admin/bookings/flights','bookings.flights.view'],
  ['Hotels','/admin/bookings/hotels','bookings.hotels.view'],
  ['Cars','/admin/bookings/cars','bookings.cars.view'],
  ['Payments','/admin/payments','payments.view'],
  ['Authorizations','/admin/payments/authorizations','authorization.view'],
  ['Payment Test','/admin/testing/payment-flow','admin.settings'],
  ['Refunds','/admin/payments/refunds','payments.refund'],
  ['Finance','/admin/finance','finance.view'],
  ['Suppliers','/admin/suppliers','suppliers.view'],
  ['Reports','/admin/reports','reports.view'],
  ['Team','/admin/team','team.view'],
  ['Admin','/admin/settings','admin.settings']
];

export default function BackOfficeShell({ children }) {
  const { profile, hasPermission, logout } = useBackOfficeAuth();
  const [open, setOpen] = useState(false);
  return <div className="backoffice-shell">
    <aside className={`backoffice-sidebar ${open ? 'is-open' : ''}`}>
      <div className="backoffice-brand">THE FINAL SEAT <span>BACK OFFICE</span></div>
      <nav>{items.filter(([, , permission]) => hasPermission(permission)).map(([label, href]) => <NavLink key={href} to={href} onClick={() => setOpen(false)} className={({isActive}) => isActive ? 'active' : ''}>{label}</NavLink>)}</nav>
    </aside>
    <section className="backoffice-main">
      <header className="backoffice-topbar"><button className="backoffice-menu" onClick={() => setOpen(value => !value)} aria-label="Toggle back office navigation">☰</button><div className="backoffice-user"><strong>{profile?.name || profile?.email}</strong><span>{profile?.roleName || profile?.role}{profile?.team?.name ? ` · ${profile.team.name}` : ''}</span></div><button className="backoffice-logout" onClick={logout}>Logout</button></header>
      <div className="backoffice-content">{children}</div>
    </section>
  </div>;
}
