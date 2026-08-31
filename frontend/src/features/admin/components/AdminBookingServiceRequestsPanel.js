import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { getApiErrorMessage } from '../../../shared/api/api';
import './AdminBookingServiceRequestsPanel.css';

const statusLabels = {
  NONE: 'No assistance requested',
  REQUESTED: 'Requested',
  ACKNOWLEDGED: 'Acknowledged',
  COMPLETED: 'Completed',
};

const pretty = value => {
  const text = String(value || '').trim();
  if (!text || text.toLowerCase() === 'none') return 'None';
  return text.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
};

const money = value => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
};

function PassengerProfile({ passenger, index }) {
  const fullName = [passenger.title, passenger.firstName, passenger.middleName, passenger.lastName, passenger.suffix].filter(Boolean).join(' ');
  return (
    <article className="asr-passenger">
      <div className="asr-passenger__head">
        <span className="asr-passenger__number">{index + 1}</span>
        <div><strong>{fullName || `Passenger ${index + 1}`}</strong><small>{pretty(passenger.role || 'adult')}</small></div>
      </div>
      <div className="asr-profile-grid">
        <div><span>Loyalty Program</span><strong>{passenger.loyaltyProgram || '—'}</strong></div>
        <div><span>Frequent Flyer #</span><strong>{passenger.frequentFlyerNumber || '—'}</strong></div>
        <div><span>Known Traveler #</span><strong>{passenger.knownTravelerNumber || '—'}</strong></div>
        <div><span>Redress #</span><strong>{passenger.redressNumber || '—'}</strong></div>
        <div><span>Nationality</span><strong>{passenger.nationality || '—'}</strong></div>
        <div><span>Passport Expiry</span><strong>{passenger.passportExpiry || '—'}</strong></div>
      </div>
    </article>
  );
}

export default function AdminBookingServiceRequestsPanel() {
  const { code } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('NONE');

  const load = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/admin/bookings/${encodeURIComponent(code)}/service-requests`, { timeout: 15000 });
      const next = response.data?.data || response.data;
      setData(next);
      setStatus(next?.assistance?.assistanceStatus || 'NONE');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load passenger requests.'));
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => { load(); }, [load]);

  const saveStatus = async () => {
    if (!code || saving || !data?.assistance?.hasSpecialAssistance) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await api.patch(
        `/admin/bookings/${encodeURIComponent(code)}/service-requests`,
        { assistanceStatus: status },
        { timeout: 20000 }
      );
      const next = response.data?.data || response.data;
      setData(next);
      setStatus(next?.assistance?.assistanceStatus || status);
      setMessage('Service-request status updated.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to update service-request status.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className="asr-panel"><div className="asr-loading">Loading passenger requests…</div></section>;
  if (error && !data) return <section className="asr-panel"><div className="asr-alert asr-alert--error">{error}</div></section>;
  if (!data) return null;

  const assistance = data.assistance || {};
  const flex = data.flexAssist || {};
  const baggageCount = Number(assistance.additionalBaggageCount || 0);
  const baggageCurrency = assistance.additionalBaggageCurrency || assistance.additionalBaggageQuote?.currency || 'USD';
  const baggageCustomerTotal = money(assistance.additionalBaggageCustomerTotal ?? assistance.additionalBaggageQuote?.customerTotal);
  const baggageSourceTotal = money(assistance.additionalBaggageSourceTotal ?? assistance.additionalBaggageQuote?.sourceTotal);

  return (
    <section className="asr-panel" aria-label="Passenger profiles and service requests">
      <div className="asr-panel__header">
        <div>
          <span className="asr-eyebrow">Customer Operations</span>
          <h2>Passenger Profiles & Service Requests</h2>
        </div>
        <div className="asr-header-badges">
          {assistance.hasSpecialAssistance && <span className="asr-badge asr-badge--assistance"><i className="fas fa-concierge-bell" /> Service Request</span>}
          {baggageCount > 0 && <span className="asr-badge asr-badge--assistance"><i className="fas fa-suitcase-rolling" /> {baggageCount} Extra Bag{baggageCount === 1 ? '' : 's'}</span>}
          {flex.selected && <span className="asr-badge asr-badge--flex"><i className="fas fa-shield-alt" /> Flex Assist</span>}
        </div>
      </div>

      {error && <div className="asr-alert asr-alert--error">{error}</div>}
      {message && <div className="asr-alert asr-alert--success">{message}</div>}

      <div className="asr-section">
        <h3>Passenger Travel Profiles</h3>
        <div className="asr-passenger-list">
          {(data.travellers || []).length
            ? data.travellers.map((passenger, index) => <PassengerProfile key={passenger.id || index} passenger={passenger} index={index} />)
            : <p className="asr-empty">No passenger profiles were found for this booking.</p>}
        </div>
      </div>

      <div className="asr-two-column">
        <div className={`asr-section asr-assistance${assistance.wheelchairRequired ? ' asr-assistance--urgent' : ''}`}>
          <div className="asr-section__title-row">
            <h3>Special Assistance & Requests</h3>
            {assistance.wheelchairRequired && <span className="asr-wheelchair"><i className="fas fa-wheelchair" /> Wheelchair Required</span>}
          </div>

          {assistance.hasSpecialAssistance ? (
            <>
              <dl className="asr-request-list">
                <div><dt>Meal Preference</dt><dd>{pretty(assistance.mealPreference)}</dd></div>
                <div><dt>Seat Preference</dt><dd>{pretty(assistance.seatPreference)}</dd></div>
                <div><dt>Wheelchair Assistance</dt><dd>{assistance.wheelchairRequired ? 'YES — REQUIRED' : 'No'}</dd></div>
                <div><dt>Additional Checked Bags</dt><dd>{baggageCount > 0 ? `${baggageCount} requested` : 'None'}</dd></div>
                {baggageCount > 0 && <div><dt>FareTransit Baggage Quote</dt><dd>{baggageCustomerTotal ? `$${baggageCustomerTotal} ${baggageCurrency}` : 'Confirm price with airline'}</dd></div>}
                {baggageCount > 0 && baggageSourceTotal && <div><dt>Airline Price Basis</dt><dd>${baggageSourceTotal} {baggageCurrency}</dd></div>}
                <div className="asr-request-list__wide"><dt>Baggage Follow-up</dt><dd>{baggageCount > 0 ? 'Confirm airline availability and final applicable amount after booking before collecting baggage payment.' : 'None'}</dd></div>
                <div className="asr-request-list__wide"><dt>Additional Request</dt><dd>{assistance.additionalRequest || 'None'}</dd></div>
              </dl>

              <div className="asr-status-control">
                <label>Service Request Status
                  <select value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="REQUESTED">Requested</option>
                    <option value="ACKNOWLEDGED">Acknowledged</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </label>
                <button type="button" onClick={saveStatus} disabled={saving}>{saving ? 'Saving…' : 'Update Status'}</button>
              </div>
            </>
          ) : (
            <div className="asr-empty-state"><i className="fas fa-check-circle" /><div><strong>No service requests</strong><span>Meal, seating, wheelchair, baggage and additional-request fields are all clear.</span></div></div>
          )}
        </div>

        <div className="asr-section asr-flex">
          <h3>FareTransit Flex Assist</h3>
          {flex.selected ? (
            <dl className="asr-request-list">
              <div><dt>Selected</dt><dd>YES</dd></div>
              <div><dt>Amount</dt><dd>${Number(flex.amount || 0).toFixed(2)} {flex.currency || 'USD'}</dd></div>
              <div><dt>Status</dt><dd>{pretty(flex.status || 'ACTIVE')}</dd></div>
              <div><dt>Terms</dt><dd>{flex.termsVersion || 'FLEX_V1'}</dd></div>
            </dl>
          ) : (
            <div className="asr-empty-state"><i className="fas fa-minus-circle" /><div><strong>Flex Assist not selected</strong><span>The passenger declined the service during checkout.</span></div></div>
          )}
        </div>
      </div>

      <div className="asr-status-footnote">Current service-request state: <strong>{statusLabels[assistance.assistanceStatus] || assistance.assistanceStatus || 'No assistance requested'}</strong></div>
    </section>
  );
}
