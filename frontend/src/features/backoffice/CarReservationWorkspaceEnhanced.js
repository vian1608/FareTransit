import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import CarReservationWorkspace from './CarReservationWorkspace';
import { backofficeBlobFetch, boPatch, boPost } from './backofficeApi';
import './CarAuthorizationComposer.css';

function formatMoney(value, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(Number(value || 0));
  } catch {
    return `$${Number(value || 0).toFixed(2)}`;
  }
}

function formatDateTime(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function collectionLabel(value) {
  return String(value || '').toUpperCase() === 'PAY_AT_COUNTER' ? 'Pay at counter' : 'Pay now';
}

function RentalCompanyBrand({ preview, compact = false }) {
  if (!preview?.rentalCompanyLogoUrl && !preview?.rentalCompany) return null;
  return <div style={{ margin: compact ? '0 0 12px' : '14px 0 18px', padding: compact ? '8px 10px' : '12px', border: '1px solid #e5eaf2', borderRadius: '10px', background: '#fff', textAlign: 'center' }}>
    {preview.rentalCompanyLogoUrl && <img src={preview.rentalCompanyLogoUrl} alt={preview.rentalCompany || 'Rental company'} style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: compact ? '150px' : '210px', maxHeight: compact ? '48px' : '62px', margin: '0 auto' }} />}
    {preview.rentalCompany && <small style={{ display: 'block', marginTop: preview.rentalCompanyLogoUrl ? '7px' : 0, color: '#64748b' }}>Rental provided by {preview.rentalCompany}</small>}
  </div>;
}

function AuthorizationComposerModal({ reference, data, busy, error, onChange, onClose, onSave, onSend }) {
  const draft = data?.emailDraft || {};
  const preview = data?.preview || {};
  return <div className="carauth-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="carauth-modal" role="dialog" aria-modal="true" aria-labelledby="carauth-title">
      <header className="carauth-modal-header">
        <div>
          <span className="carauth-eyebrow">CUSTOMER COMMUNICATION</span>
          <h2 id="carauth-title">Preview & Send Authorization</h2>
          <p>Review the email and the authorization summary before anything is sent.</p>
        </div>
        <button type="button" className="carauth-close" onClick={onClose} disabled={busy} aria-label="Close authorization preview">×</button>
      </header>

      {error && <div className="carauth-error" role="alert">{error}</div>}

      <div className="carauth-modal-body">
        <div className="carauth-editor">
          <label><span>To</span><input value={draft.to || ''} readOnly /></label>
          <label><span>Subject</span><input value={draft.subject || ''} maxLength="180" onChange={event => onChange('subject', event.target.value)} /></label>
          <label><span>Message</span><textarea value={draft.message || ''} maxLength="8000" onChange={event => onChange('message', event.target.value)} /></label>
          <div className="carauth-security-note"><strong>Secure authorization is automatic.</strong><span>The rental-company logo, Review & Authorize button, booking total, secure link and expiry notice are added automatically when the email is sent.</span></div>
        </div>

        <aside className="carauth-preview">
          <div className="carauth-email-card">
            <div className="carauth-brand">Fare<span>Transit</span></div>
            <small>Car Rental Authorization</small>
            <RentalCompanyBrand preview={preview} />
            <div className="carauth-email-subject">{draft.subject || 'Authorization email'}</div>
            <div className="carauth-email-message">{draft.message || 'Your message will appear here.'}</div>
            <div className="carauth-email-summary"><span>Booking ID</span><strong>{preview.bookingReference || reference}</strong><span>Total authorized</span><strong>{formatMoney(preview.totalAmount, preview.currency)}</strong></div>
            <div className="carauth-fake-button">Review & Authorize</div>
            <small className="carauth-muted">Secure link expires in 24 hours.</small>
          </div>

          <div className="carauth-auth-summary">
            <h3>Passenger authorization preview</h3>
            <RentalCompanyBrand preview={preview} compact />
            <dl>
              <div><dt>Renter</dt><dd>{preview.renterName || 'Not set'}</dd></div>
              <div><dt>Rental company</dt><dd>{preview.rentalCompany || 'Not set'}</dd></div>
              <div><dt>Vehicle</dt><dd>{preview.vehicle || 'Not set'}</dd></div>
              <div><dt>Pickup</dt><dd>{preview.pickupLocation || 'Not set'}<small>{formatDateTime(preview.pickupAt)}</small></dd></div>
              <div><dt>Drop-off</dt><dd>{preview.dropoffLocation || 'Not set'}<small>{formatDateTime(preview.dropoffAt)}</small></dd></div>
              <div><dt>Total</dt><dd>{formatMoney(preview.totalAmount, preview.currency)}</dd></div>
            </dl>
            {!!preview.transactions?.length && <div className="carauth-transactions">
              <h4>Payment authorization</h4>
              {preview.transactions.map((item, index) => <div key={`${item.merchantName}-${index}`}><span><strong>{item.merchantName || `Transaction ${index + 1}`}</strong><small>{collectionLabel(item.collectionMethod)}{item.description ? ` · ${item.description}` : ''}</small></span><b>{formatMoney(item.amount, item.currency || preview.currency)}</b></div>)}
            </div>}
          </div>
        </aside>
      </div>

      <footer className="carauth-modal-actions">
        <button type="button" className="bo-button secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="bo-button secondary" onClick={onSave} disabled={busy}>{busy === 'save-email' ? 'Saving…' : 'Save Email Draft'}</button>
        <button type="button" className="bo-button" onClick={onSend} disabled={!!busy || !draft.to}>{busy === 'send-email' ? 'Sending…' : 'Send Authorization'}</button>
      </footer>
    </section>
  </div>;
}

export default function CarReservationWorkspaceEnhanced() {
  const { id } = useParams();
  const [composer, setComposer] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [launchMessage, setLaunchMessage] = useState('');

  const openComposer = async () => {
    if (document.querySelector('.carws-unsaved-indicator')) {
      setLaunchMessage('Save the reservation changes first, then preview the authorization.');
      return;
    }
    setBusy('compose');
    setError('');
    setLaunchMessage('');
    try {
      const data = await boPost(`/bookings/cars/${encodeURIComponent(id)}/authorization/compose`, {});
      setComposer(data);
    } catch (requestError) {
      setLaunchMessage(requestError.message || 'Unable to prepare the authorization preview.');
    } finally {
      setBusy('');
    }
  };

  const viewAuthorizationEvidence = async () => {
    setBusy('evidence');
    setLaunchMessage('');
    try {
      const blob = await backofficeBlobFetch(`/bookings/cars/${encodeURIComponent(id)}/authorization/evidence.pdf`);
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        const link = document.createElement('a');
        link.href = url;
        link.download = 'FareTransit-Authorization-Evidence.pdf';
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (requestError) {
      setLaunchMessage(requestError.message || 'Authorization evidence is not available yet.');
    } finally {
      setBusy('');
    }
  };

  const updateDraft = (field, value) => setComposer(current => ({ ...current, emailDraft: { ...(current?.emailDraft || {}), [field]: value } }));

  const saveEmailDraft = async () => {
    setBusy('save-email');
    setError('');
    try {
      const data = await boPatch(`/bookings/cars/${encodeURIComponent(id)}/authorization/email-draft`, {
        subject: composer?.emailDraft?.subject || '',
        message: composer?.emailDraft?.message || ''
      });
      setComposer(data);
    } catch (requestError) {
      setError(requestError.message || 'Unable to save the email draft.');
    } finally {
      setBusy('');
    }
  };

  const sendAuthorization = async () => {
    setBusy('send-email');
    setError('');
    try {
      await boPost(`/bookings/cars/${encodeURIComponent(id)}/authorization/send`, {
        subject: composer?.emailDraft?.subject || '',
        message: composer?.emailDraft?.message || ''
      });
      setComposer(null);
      setLaunchMessage('Authorization sent successfully. Refreshing status…');
      window.setTimeout(() => window.location.reload(), 650);
    } catch (requestError) {
      setError(requestError.message || 'Unable to send the authorization.');
    } finally {
      setBusy('');
    }
  };

  return <div className="carws-enhanced">
    <CarReservationWorkspace />
    <div className="carauth-launchbar">
      {launchMessage && <span className={launchMessage.startsWith('Authorization sent') ? 'success' : 'warning'}>{launchMessage}</span>}
      <button type="button" className="bo-button secondary carauth-launch" onClick={viewAuthorizationEvidence} disabled={!!busy}>{busy === 'evidence' ? 'Opening Evidence…' : 'View Authorization'}</button>
      <button type="button" className="bo-button carauth-launch" onClick={openComposer} disabled={!!busy}>{busy === 'compose' ? 'Preparing Preview…' : 'Preview & Send Authorization'}</button>
    </div>
    {composer && <AuthorizationComposerModal
      reference={id}
      data={composer}
      busy={busy}
      error={error}
      onChange={updateDraft}
      onClose={() => { if (!busy) { setComposer(null); setError(''); } }}
      onSave={saveEmailDraft}
      onSend={sendAuthorization}
    />}
  </div>;
}
