import React, { useState } from 'react';
import { adminAPI } from '../../../shared/api/api';
import './AdminDemoWorkflowCard.css';

const DEMO_BOOKINGS = [
  {
    code: 'DEMO-FT-1001',
    title: '1. Awaiting Authorization',
    detail: 'Booking created · booking request + authorization email activity · authorization preview',
    badge: 'AWAITING AUTH'
  },
  {
    code: 'DEMO-FT-1002',
    title: '2. Authorized / Paid',
    detail: 'Passenger authorization completed · masked manual payment record · payment marked paid',
    badge: 'AUTHORIZED'
  },
  {
    code: 'DEMO-FT-1003',
    title: '3. Ticketed',
    detail: 'PNR + ticket number saved · final ticket snapshot · final ticket email preview/activity',
    badge: 'TICKETED'
  }
];

export default function AdminDemoWorkflowCard() {
  const [credentials, setCredentials] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const resetCredentials = async () => {
    setBusy(true);
    setError('');
    setCopied('');
    try {
      const response = await adminAPI.resetMerchantTestCredentials();
      const data = response?.data || response;
      if (!data?.email || !data?.password) throw new Error('The server did not return the temporary merchant-test credentials.');
      setCredentials(data);
    } catch (e) {
      setError(e?.userMessage || e?.message || 'Unable to generate merchant-test credentials.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (label, value) => {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      setCopied('');
    }
  };

  const openBooking = code => {
    const tab = window.open(`/admin/bookings/${encodeURIComponent(code)}`, '_blank', 'noopener,noreferrer');
    if (tab) tab.opener = null;
  };

  return (
    <section className="admin-demo-card" aria-label="Merchant test workflow">
      <div className="admin-demo-card__header">
        <div>
          <div className="admin-demo-card__eyebrow">DEMO / TEST DATA</div>
          <h2>Merchant Test Workflow</h2>
          <p>Use this restricted merchant-test account and the staged sample bookings below to demonstrate the complete FareTransit workflow without using real customer data.</p>
        </div>
        <button type="button" className="admin-demo-card__primary" onClick={resetCredentials} disabled={busy}>
          {busy ? 'Generating…' : credentials ? 'Reset Test Password' : 'Generate Test Password'}
        </button>
      </div>

      {error && <div className="admin-demo-card__error">{error}</div>}

      <div className="admin-demo-credentials">
        <div>
          <span>Email</span>
          <strong>merchant-test@faretransit.com</strong>
        </div>
        <button type="button" onClick={() => copy('email', 'merchant-test@faretransit.com')}>{copied === 'email' ? 'Copied' : 'Copy email'}</button>
        <div>
          <span>Password</span>
          <strong>{credentials?.password || 'Generate a temporary password'}</strong>
        </div>
        <button type="button" disabled={!credentials?.password} onClick={() => copy('password', credentials.password)}>{copied === 'password' ? 'Copied' : 'Copy password'}</button>
      </div>

      {credentials?.password && (
        <div className="admin-demo-card__notice">
          This password is shown only in this browser session and replaces the previous merchant-test password. It is not stored in the frontend source.
        </div>
      )}

      <div className="admin-demo-workflow-grid">
        {DEMO_BOOKINGS.map(item => (
          <article key={item.code} className="admin-demo-workflow-step">
            <div className="admin-demo-workflow-step__top">
              <span className="admin-demo-workflow-step__badge">{item.badge}</span>
              <code>{item.code}</code>
            </div>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
            <button type="button" onClick={() => openBooking(item.code)}>Open Sample Booking</button>
          </article>
        ))}
      </div>

      <div className="admin-demo-card__footer">
        Sample recipients use <strong>@example.com</strong>. Email rows are demo activity records for previewing the workflow; they are not real customer deliveries.
      </div>
    </section>
  );
}
